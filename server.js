require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./db');
const L = require('./logic');
const A = require('./auth');
const AU = require('./auditoria');
const { exportarExcel } = require('./export');
const { guiaHTML, ndHTML } = require('./guia');
const MP = require('./mapa_projectos');
const MT = require('./mapa_transp');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const wrap = fn => async (req, res) => {
  try { const r = await fn(req, res); if (r !== undefined && !res.headersSent) res.json(r); }
  catch (e) { console.error(e); if (!res.headersSent) res.status(res.statusCode >= 400 ? res.statusCode : 400).json({ erro: e.message }); }
};
const num = v => (v === '' || v == null ? null : Number(v));
const txt = v => (v === '' || v == null ? null : String(v).trim());

// ---------- acesso: só o ecrã de login e os seus ficheiros ficam abertos ----------
app.get('/saude', (req, res) => res.json({ ok: true }));
app.use(A.exigirSessao(['/login.html', '/login.js', '/styles.css', '/favicon.ico', '/adicional-logo.svg', '/adicional-logo-branco.svg', '/adicional-logo.png', '/api/auth/login', '/saude']));
app.use(AU.contexto);
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Versão dos dados: o frontend consulta para actualizar em tempo real
let versao = Date.now();
app.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) versao = Date.now(); }); next(); });
app.get('/api/versao', (req, res) => res.json({ versao }));
A.rotas(app, wrap);
AU.rotas(app, wrap, A.soSuperadmin);

// Gera UPDATE só com os campos permitidos que vieram no corpo
async function atualizar(tabela, id, body, campos) {
  const keys = Object.keys(body).filter(k => campos[k]);
  if (!keys.length) return;
  await AU.alterar(tabela, id, () => db.prepare(`UPDATE ${tabela} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => campos[k](body[k])), id));
}
async function inserir(tabela, body, campos, extra = {}) {
  const keys = Object.keys(body).filter(k => campos[k]);
  const all = [...Object.keys(extra), ...keys];
  const vals = [...Object.values(extra), ...keys.map(k => campos[k](body[k]))];
  const id = (await db.prepare(`INSERT INTO ${tabela} (${all.join(',')}) VALUES (${all.map(() => '?').join(',')})`).run(...vals)).lastInsertRowid;
  await AU.depoisDeCriar(tabela, id);
  return id;
}
const CAMPOS_DESTINO = {
  provincia: txt, distrito: txt, posto: txt, localidade: txt, comunidade: txt,
  benef_total: num, benef_baixa: num, benef_sequeiro: num, local_entrega: txt, data_prevista: txt,
  estado: txt, data_entrega: txt, benef_atendidos: num, recebido_por: txt, observacoes: txt,
};
const CAMPOS_VIAGEM = {
  codigo: txt, transportadora_id: num, matricula: v => txt(v)?.toUpperCase() ?? null, matricula_reboque: v => txt(v)?.toUpperCase() ?? null,
  motorista: txt, motorista_tel: txt, capacidade_t: num, carga: txt, origem: txt,
  data_saida_prevista: txt, data_saida: txt, data_regresso: txt, estado: txt,
  modo_preco: txt, preco_global: v => num(v) || 0, adiantamento: v => num(v) || 0, valor_pago: v => num(v) || 0, observacoes: txt,
};
const CAMPOS_CUSTO = {
  viagem_id: num, destino_id: num, categoria: txt, descricao: txt, fornecedor: txt,
  quantidade: v => num(v) ?? 1, valor_unitario: v => num(v) || 0, data: txt, pago: v => (v ? 1 : 0), observacoes: txt,
};
const CAMPOS_TRANSP = { nome: txt, nuit: txt, contacto: txt, telefone: txt, email: txt, observacoes: txt };
const CAMPOS_MISSAO = { nome: txt, cliente: txt, descricao: txt, orcamento: v => num(v) || 0, receita_modo: txt, receita_valor: v => num(v) || 0, receita_unit: v => num(v) || 0, margem_alvo: v => num(v) || 0, data_inicio: txt, data_fim: txt };
const CAMPOS_ITEM = { categoria: txt, artigo: txt, codigo: txt, volumes: v => num(v) || 0, peso_kg: v => num(v) || 0, lote: txt, fornecedor: txt, observacoes: txt };
const CAMPOS_ND = { viagem_id: num, transportadora_id: num, destino_id: num, data: txt, motivo: txt, estado: txt, referencia: txt, observacoes: txt };
const xlsx = (res, buf, nome) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.send(Buffer.from(buf));
};

// ---------- metadados ----------
app.get('/api/meta', wrap(() => ({ motivosND: L.MOTIVOS_ND, estadosND: L.ESTADOS_ND, rubricas: L.RUBRICAS, categorias: L.CATEGORIAS, estadosDestino: L.ESTADOS_DESTINO, estadosViagem: L.ESTADOS_VIAGEM, hoje: L.hoje() })));

// ---------- projectos ----------
app.get('/api/missoes', wrap(() => db.prepare('SELECT * FROM missoes ORDER BY id DESC').all()));
app.post('/api/missoes', wrap(async req => ({ id: await inserir('missoes', req.body, CAMPOS_MISSAO) })));
app.put('/api/missoes/:id', wrap(async req => { await atualizar('missoes', req.params.id, req.body, CAMPOS_MISSAO); return { ok: true }; }));
app.get('/api/missoes/:id/painel', wrap(req => L.painel(req.params.id)));
app.get('/api/missoes/:id/tudo', wrap(req => L.carregarMissao(req.params.id)));
app.get('/api/missoes/:id/financeiro', wrap(req => L.financeiro(req.params.id)));
const orcObj = async mid => Object.fromEntries((await db.prepare('SELECT categoria, valor FROM orcamento WHERE missao_id=?').all(mid)).map(r => [r.categoria, r.valor]));
app.put('/api/missoes/:id/orcamento', wrap(async req => {
  const antes = await orcObj(req.params.id);
  await L.gravarOrcamento(req.params.id, req.body.linhas || []);
  await AU.registar({ accao: 'alterar', entidade: 'orcamento', missao_id: Number(req.params.id), resumo: 'Limites de orçamento por rubrica', antes, depois: await orcObj(req.params.id) });
  return { ok: true };
}));
app.get('/api/missoes/:id/sugestoes', wrap(req => L.sugestoes(req.params.id)));
app.get('/api/missoes/:id/export.xlsx', wrap(async (req, res) => {
  const M = await L.carregarMissao(req.params.id);
  const [P, F] = await Promise.all([L.painel(req.params.id, M), L.financeiro(req.params.id, M)]);
  xlsx(res, await exportarExcel(M, P, F), `Ponto_situacao_${M.hoje}.xlsx`);
}));

// ---------- kits e guia de carga ----------
app.get('/api/missoes/:id/kits', wrap(async req => {
  const M = await L.carregarMissao(req.params.id);
  const ativos = M.destinos.filter(d => d.estado !== 'cancelado');
  const porProv = [...new Set(ativos.map(d => d.provincia))].map(p => ({ provincia: p, ...L.listaCarga(M.kits, ativos.filter(d => d.provincia === p)), peso_kg: ativos.filter(d => d.provincia === p).reduce((s, d) => s + d.peso_kg, 0) }));
  return { ...M.kits, total: L.listaCarga(M.kits, ativos), peso_total: ativos.reduce((s, d) => s + d.peso_kg, 0), porProv };
}));
app.put('/api/kit-itens/:id', wrap(async req => {
  const b = req.body;
  await AU.alterar('kit_itens', req.params.id, async () => {
    if ('qtd' in b) await db.prepare('UPDATE kit_itens SET qtd=? WHERE id=?').run(num(b.qtd) ?? 0, req.params.id);
    if ('peso_kg' in b) await db.prepare('UPDATE kit_itens SET peso_kg=? WHERE id=?').run(num(b.peso_kg), req.params.id);
  });
  return { ok: true };
}));
app.get('/guia/:vid', wrap(async (req, res) => {
  const v = await db.prepare('SELECT missao_id FROM viagens WHERE id=?').get(req.params.vid);
  const html = v && await guiaHTML(v.missao_id, req.params.vid);
  if (!html) return void res.status(404).send('Camião não encontrado');
  res.type('html').send(html);
}));

// ---------- notas de débito a transportadores ----------
const linhasNDtxt = async id => (await db.prepare('SELECT artigo, quantidade, preco_unit FROM nd_linhas WHERE nd_id=? ORDER BY ordem, id').all(id)).map(l => `${l.quantidade} × ${l.artigo} @ ${l.preco_unit}`).join('; ');
async function gravarLinhasND(id, linhas) {
  if (!Array.isArray(linhas)) return;
  const antes = await linhasNDtxt(id);
  await gravarLinhasNDsem(id, linhas);
  const depois = await linhasNDtxt(id);
  if (antes) await AU.registar({ accao: 'alterar', entidade: 'notas_debito', entidade_id: Number(id), resumo: 'Linhas da nota de débito', antes: { linhas: antes }, depois: { linhas: depois } });
}
async function gravarLinhasNDsem(id, linhas) {
  await db.prepare('DELETE FROM nd_linhas WHERE nd_id=?').run(id);
  const ins = db.prepare('INSERT INTO nd_linhas (nd_id, artigo, quantidade, preco_unit, ordem) VALUES (?,?,?,?,?)');
  let i = 0;
  for (const l of linhas.filter(l => txt(l.artigo))) await ins.run(id, txt(l.artigo), num(l.quantidade) || 0, num(l.preco_unit) || 0, ++i);
}
// a transportadora é a do camião, se não for indicada
async function completarND(b) {
  if (b.viagem_id && !b.transportadora_id) b.transportadora_id = (await db.prepare('SELECT transportadora_id t FROM viagens WHERE id=?').get(b.viagem_id))?.t ?? null;
  return b;
}
app.post('/api/missoes/:id/notas-debito', wrap(async req => {
  const b = await completarND({ ...req.body });
  if (!b.viagem_id && !b.transportadora_id) throw new Error('Indique o camião ou a transportadora');
  return db.tx(async () => {
    const n = (await db.prepare('SELECT COUNT(*)+1 n FROM notas_debito WHERE missao_id=?').get(req.params.id)).n;
    const id = await inserir('notas_debito', { ...b, data: b.data || L.hoje() }, CAMPOS_ND, { missao_id: Number(req.params.id), numero: `ND-${String(n).padStart(3, '0')}` });
    await gravarLinhasND(id, b.linhas);
    return { id };
  });
}));
app.put('/api/notas-debito/:id', wrap(async req => {
  const b = await completarND({ ...req.body });
  await db.tx(async () => { await atualizar('notas_debito', req.params.id, b, CAMPOS_ND); await gravarLinhasND(req.params.id, b.linhas); });
  return { ok: true };
}));
app.delete('/api/notas-debito/:id', wrap(async req => { await AU.apagar('notas_debito', req.params.id); return { ok: true }; }));
app.get('/nd/:id', wrap(async (req, res) => {
  const n = await db.prepare('SELECT missao_id FROM notas_debito WHERE id=?').get(req.params.id);
  const html = n && await ndHTML(n.missao_id, req.params.id);
  if (!html) return void res.status(404).send('Nota de débito não encontrada');
  res.type('html').send(html);
}));

// ---------- destinos ----------
app.post('/api/missoes/:id/destinos', wrap(async req => {
  const ordem = (await db.prepare('SELECT COALESCE(MAX(ordem),0)+1 o FROM destinos WHERE missao_id=?').get(req.params.id)).o;
  return { id: await inserir('destinos', req.body, CAMPOS_DESTINO, { missao_id: Number(req.params.id), ordem }) };
}));
app.put('/api/destinos/:id', wrap(async req => {
  const b = { ...req.body };
  if ((b.estado === 'entregue' || b.estado === 'parcial') && !b.data_entrega) {
    const cur = await db.prepare('SELECT data_entrega FROM destinos WHERE id=?').get(req.params.id);
    if (!cur?.data_entrega) b.data_entrega = L.hoje();
  }
  await atualizar('destinos', req.params.id, b, CAMPOS_DESTINO);
  return { ok: true };
}));
// carga por artigo nos destinos
app.post('/api/destinos/:id/itens', wrap(async req => {
  if (!txt(req.body.artigo)) throw new Error('Indique o artigo');
  const ordem = (await db.prepare('SELECT COALESCE(MAX(ordem),0)+1 o FROM destino_itens WHERE destino_id=?').get(req.params.id)).o;
  return { id: await inserir('destino_itens', req.body, CAMPOS_ITEM, { destino_id: Number(req.params.id), ordem }) };
}));
app.put('/api/itens/:id', wrap(async req => { await atualizar('destino_itens', req.params.id, req.body, CAMPOS_ITEM); return { ok: true }; }));
app.delete('/api/itens/:id', wrap(async req => { await AU.apagar('destino_itens', req.params.id); return { ok: true }; }));

// Importar um projecto: { missao:{...}, destinos:[{..., itens:[...]}] } — cria tudo numa transacção
app.post('/api/importar-projecto', wrap(async req => {
  const { missao, destinos = [] } = req.body;
  if (!txt(missao?.nome)) throw new Error('Indique o nome do projecto');
  return db.tx(async () => {
    const mid = await inserir('missoes', missao, CAMPOS_MISSAO);
    let i = 0;
    for (const d of destinos) {
      const did = await inserir('destinos', d, CAMPOS_DESTINO, { missao_id: Number(mid), ordem: ++i });
      let k = 0;
      for (const it of d.itens || []) await inserir('destino_itens', it, CAMPOS_ITEM, { destino_id: Number(did), ordem: ++k });
    }
    return { id: mid, destinos: destinos.length, itens: destinos.reduce((s, d) => s + (d.itens?.length || 0), 0) };
  });
}));

// Repartir: a parte entregue fica no destino original (entregue); o restante passa a um novo destino pendente
app.post('/api/destinos/:id/repartir', wrap(async req => {
  const d = await db.prepare('SELECT * FROM destinos WHERE id=?').get(req.params.id);
  if (!d) throw new Error('Destino não encontrado');
  const b = Math.max(0, num(req.body.baixa) || 0), s = Math.max(0, num(req.body.sequeiro) || 0);
  const rb = (d.benef_baixa || 0) - b, rs = (d.benef_sequeiro || 0) - s;
  if (rb < 0 || rs < 0) throw new Error('A quantidade entregue é maior do que a prevista');
  if (!b && !s) throw new Error('Indique os kits entregues');
  if (!rb && !rs) throw new Error('Não sobra nada por entregar — marque como entregue');
  const dataEnt = txt(req.body.data_entrega) || L.hoje();
  const base = d.comunidade.replace(/ \(\d+\.ª entrega\)$/, '');
  const n = (await db.prepare('SELECT COUNT(*) n FROM destinos WHERE missao_id=? AND (comunidade=? OR comunidade LIKE ?)').get(d.missao_id, base, base + ' (%.ª entrega)')).n + 1;
  const dm = x => (x ? `${x.slice(8)}/${x.slice(5, 7)}` : '');
  return db.tx(async () => {
    await AU.alterar('destinos', d.id, () => db.prepare(`UPDATE destinos SET benef_baixa=?, benef_sequeiro=?, benef_total=?, estado='entregue', data_entrega=?, benef_atendidos=NULL, observacoes=? WHERE id=?`)
      .run(b, s, b + s, dataEnt, [d.observacoes, `Repartido: entregues B${b}/S${s} a ${dm(dataEnt)}; restante (B${rb}/S${rs}) em "${base} (${n}.ª entrega)"`].filter(Boolean).join(' | '), d.id), 'Entrega repartida');
    const id = (await db.prepare(`INSERT INTO destinos (missao_id, provincia, distrito, posto, localidade, comunidade, benef_baixa, benef_sequeiro, benef_total,
      local_entrega, data_prevista, estado, observacoes, ordem) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pendente',?,?)`)
      .run(d.missao_id, d.provincia, d.distrito, d.posto, d.localidade, `${base} (${n}.ª entrega)`, rb, rs, rb + rs, d.local_entrega,
        txt(req.body.data_prevista) ?? null, [`Restante da entrega de ${dm(dataEnt)}`, txt(req.body.observacoes)].filter(Boolean).join(' | '), d.ordem)).lastInsertRowid;
    await AU.depoisDeCriar('destinos', id, `Destino ${base} (${n}.ª entrega) criado ao repartir`);
    return { ok: true, id };
  });
}));
app.post('/api/destinos/lote', wrap(async req => {
  const { ids = [], ...campos } = req.body;
  if (campos.estado === 'entregue' && !campos.data_entrega) campos.data_entrega = L.hoje();
  for (const id of ids) await atualizar('destinos', id, campos, CAMPOS_DESTINO);
  return { ok: true, n: ids.length };
}));
app.delete('/api/destinos/:id', wrap(async req => { await AU.apagar('destinos', req.params.id); return { ok: true }; }));

// ---------- mapa de projectos ----------
app.get('/api/projectos', wrap(() => L.mapaProjectos()));
app.get('/api/projectos/mapa.xlsx', wrap(async (req, res) => { const { buf, hoje } = await MP.excel(); xlsx(res, buf, `Mapa_projectos_${hoje}.xlsx`); }));
app.get('/mapa-projectos', wrap(async (req, res) => { res.type('html').send(await MP.html()); }));

// ---------- mapa de viagens e custos por transportadora ----------
const enviarMapaT = async (res, mid, tid) => { const { buf, nome, M } = await MT.excel(mid, tid); xlsx(res, buf, `Mapa_viagens_${nome.replace(/[^\wÀ-ſ-]+/g, '_')}_${M.hoje}.xlsx`); };
app.get('/api/missoes/:id/transportadoras/mapa.xlsx', wrap((req, res) => enviarMapaT(res, req.params.id, null)));
app.get('/api/missoes/:id/transportadoras/:tid/mapa.xlsx', wrap((req, res) => enviarMapaT(res, req.params.id, Number(req.params.tid))));
app.get('/mapa-transportadora/:mid/:tid', wrap(async (req, res) => {
  const h = await MT.html(req.params.mid, Number(req.params.tid));
  if (!h) return void res.status(404).send('Transportadora sem viagens neste projecto');
  res.type('html').send(h);
}));

// ---------- transportadoras ----------
app.get('/api/transportadoras', wrap(() => db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM viagens v WHERE v.transportadora_id=t.id) n_viagens
  FROM transportadoras t ORDER BY nome`).all()));
app.post('/api/transportadoras', wrap(async req => {
  if (!txt(req.body.nome)) throw new Error('Nome obrigatório');
  return { id: await inserir('transportadoras', req.body, CAMPOS_TRANSP) };
}));
app.put('/api/transportadoras/:id', wrap(async req => { await atualizar('transportadoras', req.params.id, req.body, CAMPOS_TRANSP); return { ok: true }; }));
app.delete('/api/transportadoras/:id', wrap(async req => { await AU.apagar('transportadoras', req.params.id); return { ok: true }; }));

// Histórico de matrículas/motoristas (para autocompletar) — o mais recente de cada matrícula
app.get('/api/frota-conhecida', wrap(async () => {
  const rows = await db.prepare('SELECT id, transportadora_id, matricula, motorista, motorista_tel, capacidade_t FROM viagens WHERE matricula IS NOT NULL ORDER BY id DESC').all();
  const vistos = new Set();
  return rows.filter(r => !vistos.has(r.matricula) && vistos.add(r.matricula)).map(({ id, ...r }) => r);
}));

// ---------- viagens (camiões) ----------
const destinosTxt = async vid => (await db.prepare('SELECT d.comunidade, vd.preco FROM viagem_destinos vd JOIN destinos d ON d.id=vd.destino_id WHERE vd.viagem_id=? ORDER BY vd.ordem, vd.id').all(vid)).map(r => r.comunidade + (r.preco ? ` (${r.preco})` : '')).join(', ');
async function gravarDestinosViagem(vid, destinos) {
  if (!Array.isArray(destinos)) return;
  const antes = await destinosTxt(vid);
  await gravarDestinosViagemSem(vid, destinos);
  const depois = await destinosTxt(vid);
  const v = await db.prepare('SELECT codigo, matricula, missao_id FROM viagens WHERE id=?').get(vid);
  await AU.registar({ accao: 'alterar', entidade: 'viagens', entidade_id: Number(vid), missao_id: v?.missao_id, resumo: `Destinos do camião ${v?.codigo || ''} ${v?.matricula || ''}`, antes: { destinos: antes }, depois: { destinos: depois } });
}
async function gravarDestinosViagemSem(vid, destinos) {
  await db.prepare('DELETE FROM viagem_destinos WHERE viagem_id=?').run(vid);
  const ins = db.prepare('INSERT INTO viagem_destinos (viagem_id, destino_id, preco, ordem) VALUES (?,?,?,?)');
  let i = 0;
  for (const d of destinos) await ins.run(vid, d.destino_id, num(d.preco) || 0, ++i);
}
async function propagarEstado(vid, estado, data) {
  const ids = (await db.prepare('SELECT destino_id FROM viagem_destinos WHERE viagem_id=?').all(vid)).map(r => r.destino_id);
  for (const id of ids) await AU.alterar('destinos', id, async () => {
    if (estado === 'em_transito') await db.prepare(`UPDATE destinos SET estado='em_transito' WHERE id=? AND estado IN ('pendente','adiado')`).run(id);
    if (estado === 'planeada' || estado === 'carregada' || estado === 'cancelada') await db.prepare(`UPDATE destinos SET estado='pendente' WHERE id=? AND estado='em_transito'`).run(id);
    if (estado === 'concluida') await db.prepare(`UPDATE destinos SET estado='entregue', data_entrega=COALESCE(data_entrega, ?) WHERE id=? AND estado IN ('pendente','em_transito','adiado')`).run(data || L.hoje(), id);
  }, 'Estado do destino alterado pelo camião');
}
app.post('/api/missoes/:id/viagens', wrap(async req => {
  const b = req.body;
  return db.tx(async () => {
    const n = (await db.prepare('SELECT COUNT(*)+1 n FROM viagens WHERE missao_id=?').get(req.params.id)).n;
    const id = await inserir('viagens', { codigo: b.codigo || `CAM-${String(n).padStart(2, '0')}`, ...b }, CAMPOS_VIAGEM, { missao_id: Number(req.params.id) });
    await gravarDestinosViagem(id, b.destinos);
    return { id };
  });
}));
app.put('/api/viagens/:id', wrap(async req => {
  const b = req.body;
  const antes = await db.prepare('SELECT estado, data_saida FROM viagens WHERE id=?').get(req.params.id);
  await db.tx(async () => {
    if (b.estado === 'em_transito' && !b.data_saida && !antes?.data_saida) b.data_saida = L.hoje();
    await atualizar('viagens', req.params.id, b, CAMPOS_VIAGEM);
    await gravarDestinosViagem(req.params.id, b.destinos);
    if (b.estado && antes && b.estado !== antes.estado) await propagarEstado(req.params.id, b.estado, b.data_regresso);
  });
  return { ok: true };
}));
app.delete('/api/viagens/:id', wrap(async req => {
  await db.tx(async () => { await propagarEstado(req.params.id, 'cancelada'); await AU.apagar('viagens', req.params.id); });
  return { ok: true };
}));

// ---------- custos ----------
app.post('/api/missoes/:id/custos', wrap(async req => {
  if (!req.body.categoria) throw new Error('Categoria obrigatória');
  return { id: await inserir('custos', req.body, CAMPOS_CUSTO, { missao_id: Number(req.params.id) }) };
}));
app.put('/api/custos/:id', wrap(async req => { await atualizar('custos', req.params.id, req.body, CAMPOS_CUSTO); return { ok: true }; }));
app.delete('/api/custos/:id', wrap(async req => { await AU.apagar('custos', req.params.id); return { ok: true }; }));

const PORT = process.env.PORT || 3060;
(async () => {
  await db.init();
  await A.garantirAdmin();
  app.listen(PORT, () => console.log(`Distribuição de insumos → http://localhost:${PORT}`));
})().catch(e => { console.error('Falha ao arrancar:', e.message); process.exit(1); });
