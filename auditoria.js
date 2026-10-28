// Auditoria: quem fez o quê, quando, e o que mudou (antes → depois). Só acrescenta, nunca altera.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('./db');

const ctx = new AsyncLocalStorage();
// guarda o utilizador e o IP do pedido para todas as gravações que ele fizer
const contexto = (req, res, next) => ctx.run({ user: req.user, ip: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() }, next);

const ENTIDADES = {
  missoes: 'Projecto', destinos: 'Destino', viagens: 'Camião', custos: 'Custo', transportadoras: 'Transportadora',
  notas_debito: 'Nota de débito', destino_itens: 'Artigo', kit_itens: 'Item de kit', orcamento: 'Orçamento', utilizadores: 'Utilizador',
  facturas: 'Factura', sessao: 'Sessão',
};
const IGNORAR = new Set(['criado_em', 'senha_hash', 'ultimo_acesso']);
const rotulo = r => r && (r.comunidade || [r.codigo, r.matricula].filter(Boolean).join(' ') || r.nome || r.numero || r.artigo || r.descricao || r.item || r.categoria || r.utilizador || (r.id && `#${r.id}`));
const fmt = v => (v === null || v === undefined || v === '' ? '—' : String(v));

function diferencas(antes = {}, depois = {}) {
  const out = [];
  for (const k of new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])) {
    if (IGNORAR.has(k) || k === 'id') continue;
    const a = antes?.[k], b = depois?.[k];
    if (fmt(a) !== fmt(b) && !(a == null && b == null)) out.push({ campo: k, antes: a ?? null, depois: b ?? null });
  }
  return out;
}
const limpar = o => o && Object.fromEntries(Object.entries(o).filter(([k]) => !IGNORAR.has(k)));

async function registar({ accao, entidade, entidade_id = null, missao_id = null, resumo = '', antes = null, depois = null, utilizador }) {
  try {
    const c = ctx.getStore() || {};
    const u = utilizador || c.user;
    const mudancas = accao === 'alterar' ? diferencas(antes, depois) : null;
    if (accao === 'alterar' && !mudancas.length) return; // nada mudou de facto
    await db.prepare(`INSERT INTO auditoria (utilizador_id, utilizador_nome, ip, accao, entidade, entidade_id, missao_id, resumo, mudancas, antes, depois)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      u?.id ?? null, u ? `${u.nome} (${u.utilizador})` : 'sistema', c.ip || null, accao, entidade, entidade_id, missao_id,
      String(resumo || '').slice(0, 500), mudancas ? JSON.stringify(mudancas) : null,
      accao === 'apagar' ? JSON.stringify(limpar(antes)) : null, accao === 'criar' ? JSON.stringify(limpar(depois)) : null);
  } catch (e) { console.error('auditoria:', e.message); }
}

// helpers para as tabelas: lêem o registo antes/depois e registam
const ler = (tabela, id) => db.prepare(`SELECT * FROM ${tabela} WHERE id=?`).get(id);
const missaoDe = async (tabela, r) => {
  if (!r) return null;
  if (r.missao_id) return r.missao_id;
  if (tabela === 'missoes') return r.id;
  if (tabela === 'destino_itens') return (await ler('destinos', r.destino_id))?.missao_id ?? null;
  return null;
};
async function depoisDeCriar(tabela, id, resumo) {
  const r = await ler(tabela, id);
  await registar({ accao: 'criar', entidade: tabela, entidade_id: id, missao_id: await missaoDe(tabela, r), resumo: resumo || `${ENTIDADES[tabela] || tabela} ${rotulo(r) || ''} criado`, depois: r });
}
async function alterar(tabela, id, fn, resumo) {
  const antes = await ler(tabela, id);
  const res = await fn();
  const depois = await ler(tabela, id);
  await registar({ accao: 'alterar', entidade: tabela, entidade_id: Number(id), missao_id: await missaoDe(tabela, depois || antes), resumo: resumo || `${ENTIDADES[tabela] || tabela} ${rotulo(depois || antes) || ''}`, antes, depois });
  return res;
}
async function apagar(tabela, id, resumo) {
  const antes = await ler(tabela, id);
  await db.prepare(`DELETE FROM ${tabela} WHERE id=?`).run(id);
  if (antes) await registar({ accao: 'apagar', entidade: tabela, entidade_id: Number(id), missao_id: await missaoDe(tabela, antes), resumo: resumo || `${ENTIDADES[tabela] || tabela} ${rotulo(antes) || ''} apagado`, antes });
}

function rotas(app, wrap, soSuperadmin) {
  app.get('/api/auditoria', soSuperadmin, wrap(async req => {
    const q = req.query, w = [], p = [];
    if (q.utilizador) { w.push('utilizador_id=?'); p.push(q.utilizador); }
    if (q.missao) { w.push('missao_id=?'); p.push(q.missao); }
    if (q.entidade) { w.push('entidade=?'); p.push(q.entidade); }
    if (q.accao) { w.push('accao=?'); p.push(q.accao); }
    if (q.de) { w.push('quando>=?'); p.push(q.de + ' 00:00:00'); }
    if (q.ate) { w.push('quando<=?'); p.push(q.ate + ' 23:59:59'); }
    const lim = Math.min(Number(q.limite) || 500, 5000);
    const linhas = await db.prepare(`SELECT id, quando, utilizador_id, utilizador_nome, ip, accao, entidade, entidade_id, missao_id, resumo, mudancas, antes, depois
      FROM auditoria ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ${lim}`).all(...p);
    return linhas.map(l => ({ ...l, entidade_nome: ENTIDADES[l.entidade] || l.entidade, mudancas: l.mudancas ? JSON.parse(l.mudancas) : null, antes: l.antes ? JSON.parse(l.antes) : null, depois: l.depois ? JSON.parse(l.depois) : null }));
  }));
}

module.exports = { contexto, registar, depoisDeCriar, alterar, apagar, rotas, ENTIDADES };
