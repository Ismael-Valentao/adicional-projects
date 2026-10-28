// Regras de negócio: custos, alocação, situação face ao cronograma, sugestões
const db = require('./db');

const CATEGORIAS = {
  estiva_carga: 'Estiva — carregamento',
  estiva_descarga: 'Estiva — descarregamento',
  combustivel: 'Combustível extra',
  portagem: 'Portagens',
  ajudas_custo: 'Ajudas de custo / alimentação',
  armazenagem: 'Armazenagem',
  escolta: 'Acompanhamento / escolta',
  comunicacao: 'Comunicação',
  outros: 'Outros',
};
const ESTADOS_DESTINO = { pendente: 'Pendente', em_transito: 'Em trânsito', entregue: 'Entregue', parcial: 'Entrega parcial', adiado: 'Adiado', cancelado: 'Cancelado' };
const MOTIVOS_ND = { falta: 'Mercadoria em falta', dano: 'Mercadoria danificada', atraso: 'Atraso na entrega', outro: 'Outro' };
const ESTADOS_ND = { emitida: 'Emitida', aceite: 'Aceite', contestada: 'Contestada', anulada: 'Anulada' };
// só as notas emitidas ou aceites são descontadas ao transportador
const ndConta = n => n.estado === 'emitida' || n.estado === 'aceite';
const ESTADOS_VIAGEM = { planeada: 'Planeada', carregada: 'Carregada', em_transito: 'Em trânsito', concluida: 'Concluída', cancelada: 'Cancelada' };

function hoje() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function diffDias(a, b) { // a - b em dias
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}

// Carrega todo o estado de uma missão e calcula derivados
function carregarMissao(mid) {
  const missao = db.prepare('SELECT * FROM missoes WHERE id=?').get(mid);
  if (!missao) return null;
  const destinos = db.prepare('SELECT * FROM destinos WHERE missao_id=? ORDER BY ordem, id').all(mid);
  const viagens = db.prepare(`SELECT v.*, t.nome transportadora FROM viagens v
    LEFT JOIN transportadoras t ON t.id=v.transportadora_id WHERE v.missao_id=? ORDER BY v.data_saida_prevista, v.id`).all(mid);
  const links = db.prepare(`SELECT vd.* FROM viagem_destinos vd JOIN viagens v ON v.id=vd.viagem_id
    WHERE v.missao_id=? ORDER BY vd.ordem, vd.id`).all(mid);
  const custos = db.prepare(`SELECT * FROM custos WHERE missao_id=? ORDER BY data, id`).all(mid);

  const dMap = new Map(destinos.map(d => [d.id, Object.assign(d, { viagens: [], custo_transporte: 0, custo_outros: 0 })]));
  const vMap = new Map(viagens.map(v => [v.id, Object.assign(v, { destinos: [], custos_extra: 0 })]));

  for (const l of links) {
    const v = vMap.get(l.viagem_id), d = dMap.get(l.destino_id);
    if (!v || !d) continue;
    v.destinos.push({ destino_id: d.id, preco: l.preco || 0, ordem: l.ordem });
    d.viagens.push(v.id);
  }
  // custo de transporte de cada viagem + alocação aos destinos
  for (const v of viagens) {
    const ativa = v.estado !== 'cancelada';
    v.custo_transporte = v.modo_preco === 'por_destino'
      ? v.destinos.reduce((s, x) => s + (x.preco || 0), 0)
      : (v.preco_global || 0);
    if (!ativa) v.custo_transporte = 0;
    v.benef_total = v.destinos.reduce((s, x) => s + (dMap.get(x.destino_id).benef_total || 0), 0);
    if (!ativa) continue;
    if (v.modo_preco === 'por_destino') {
      v.destinos.forEach(x => { dMap.get(x.destino_id).custo_transporte += x.preco || 0; });
    } else if (v.destinos.length) {
      // repartição proporcional aos beneficiários (ou igual se não houver números)
      const base = v.benef_total || v.destinos.length;
      v.destinos.forEach(x => {
        const peso = v.benef_total ? (dMap.get(x.destino_id).benef_total || 0) : 1;
        dMap.get(x.destino_id).custo_transporte += v.custo_transporte * peso / base;
      });
    }
  }
  for (const c of custos) {
    c.valor = (c.quantidade || 0) * (c.valor_unitario || 0);
    c.categoria_nome = CATEGORIAS[c.categoria] || c.categoria;
    if (c.viagem_id && vMap.has(c.viagem_id)) vMap.get(c.viagem_id).custos_extra += c.valor;
    if (c.destino_id && dMap.has(c.destino_id)) dMap.get(c.destino_id).custo_outros += c.valor;
    else if (c.viagem_id && vMap.has(c.viagem_id)) {
      const v = vMap.get(c.viagem_id);
      const base = v.benef_total || v.destinos.length;
      v.destinos.forEach(x => {
        const peso = v.benef_total ? (dMap.get(x.destino_id).benef_total || 0) : 1;
        dMap.get(x.destino_id).custo_outros += base ? c.valor * peso / base : 0;
      });
    }
  }
  for (const v of viagens) {
    v.custo_total = v.custo_transporte + v.custos_extra;
    v.saldo_pagar = v.custo_transporte - (v.adiantamento || 0) - (v.valor_pago || 0);
    v.nd_desconto = 0; v.notas = [];
    v.estado_nome = ESTADOS_VIAGEM[v.estado] || v.estado;
  }
  const H = hoje();
  for (const d of destinos) {
    d.estado_nome = ESTADOS_DESTINO[d.estado] || d.estado;
    Object.assign(d, situacao(d, d.viagens.map(id => vMap.get(id)), H));
    d.custo_total = d.custo_transporte + d.custo_outros;
    d.matriculas = d.viagens.map(id => vMap.get(id).matricula).filter(Boolean).join(', ');
  }
  // kits: 1 por beneficiário (baixa → Kit Baixa, sequeiro → Kit Sequeiro)
  const kits = infoKits(mid);
  // carga por artigo (projectos sem kits): soma ao peso do destino
  const itens = db.prepare(`SELECT i.* FROM destino_itens i JOIN destinos d ON d.id=i.destino_id WHERE d.missao_id=? ORDER BY i.ordem, i.id`).all(mid);
  for (const d of destinos) {
    d.kits_baixa = d.benef_baixa || 0; d.kits_sequeiro = d.benef_sequeiro || 0;
    d.itens = itens.filter(i => i.destino_id === d.id);
    d.volumes = soma(d.itens, i => i.volumes);
    d.peso_itens = soma(d.itens, i => i.peso_kg);
    d.peso_kg = d.kits_baixa * kits.peso.baixa + d.kits_sequeiro * kits.peso.sequeiro + d.peso_itens;
  }
  const dMap2 = new Map(destinos.map(d => [d.id, d]));
  for (const v of viagens) {
    const ds = v.destinos.map(x => dMap2.get(x.destino_id)).filter(Boolean);
    v.kits_baixa = soma(ds, d => d.kits_baixa); v.kits_sequeiro = soma(ds, d => d.kits_sequeiro);
    v.volumes = soma(ds, d => d.volumes); v.artigos = soma(ds, d => d.itens.length);
    v.peso_kg = soma(ds, d => d.peso_kg);
  }
  const notas = db.prepare(`SELECT n.*, t.nome transportadora FROM notas_debito n LEFT JOIN transportadoras t ON t.id=n.transportadora_id
    WHERE n.missao_id=? ORDER BY n.data DESC, n.id DESC`).all(mid);
  const linhasND = db.prepare('SELECT l.* FROM nd_linhas l JOIN notas_debito n ON n.id=l.nd_id WHERE n.missao_id=? ORDER BY l.ordem, l.id').all(mid);
  for (const n of notas) {
    n.linhas = linhasND.filter(l => l.nd_id === n.id).map(l => ({ ...l, valor: (l.quantidade || 0) * (l.preco_unit || 0) }));
    n.valor = soma(n.linhas, l => l.valor);
    n.motivo_nome = MOTIVOS_ND[n.motivo] || n.motivo; n.estado_nome = ESTADOS_ND[n.estado] || n.estado;
    n.conta = ndConta(n);
    const v = vMap.get(n.viagem_id);
    if (v) { v.notas.push(n.id); if (n.conta) { v.nd_desconto += n.valor; v.saldo_pagar -= n.valor; } }
  }
  return { missao, destinos, viagens, custos, kits, notas, hoje: H };
}

// Composição dos kits e peso conhecido de cada um
function infoKits(mid) {
  const itens = db.prepare('SELECT * FROM kit_itens WHERE missao_id=? ORDER BY kit, ordem, id').all(mid);
  const peso = { baixa: 0, sequeiro: 0 }, porConfirmar = { baixa: [], sequeiro: [] };
  for (const i of itens) {
    if (i.peso_kg == null) porConfirmar[i.kit]?.push(i.item);
    else peso[i.kit] = (peso[i.kit] || 0) + i.qtd * i.peso_kg;
  }
  return { itens, peso, porConfirmar };
}

// Lista de artigos a carregar para um conjunto de destinos (soma os dois kits, junta o mesmo produto)
function listaCarga(kits, destinos) {
  const n = { baixa: soma(destinos, d => d.benef_baixa || 0), sequeiro: soma(destinos, d => d.benef_sequeiro || 0) };
  const m = new Map();
  for (const i of kits.itens) {
    const q = i.qtd * (n[i.kit] || 0);
    if (!q) continue;
    const x = m.get(i.descricao) || { categoria: i.categoria, item: i.item, descricao: i.descricao, embalagem: i.embalagem, qtd: 0, peso_kg: i.peso_kg == null ? null : 0 };
    x.qtd += q;
    if (x.peso_kg != null && i.peso_kg != null) x.peso_kg += q * i.peso_kg; else x.peso_kg = null;
    m.set(i.descricao, x);
  }
  const ordem = ['Sementes', 'Fertilizantes', 'Pesticidas', 'Ferramentas'];
  return { kits: n, itens: [...m.values()].sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria)) };
}

// Situação do destino face à data prevista
// nivel: ok | info | alerta | critico | neutro
function situacao(d, viagens, H) {
  const vs = viagens.filter(v => v && v.estado !== 'cancelada');
  const p = d.data_prevista;
  if (d.estado === 'cancelado') return { situacao: 'Cancelado', nivel: 'neutro', desvio: null };
  if (d.estado === 'entregue' || d.estado === 'parcial') {
    const parc = d.estado === 'parcial' ? ' (parcial)' : '';
    if (!p || !d.data_entrega) return { situacao: 'Entregue' + parc, nivel: d.estado === 'parcial' ? 'alerta' : 'ok', desvio: null };
    const x = diffDias(d.data_entrega, p);
    if (x <= 0) return { situacao: (x < 0 ? `Entregue ${-x}d antes` : 'Entregue no prazo') + parc, nivel: d.estado === 'parcial' ? 'alerta' : 'ok', desvio: x };
    return { situacao: `Entregue com ${x}d de atraso` + parc, nivel: 'alerta', desvio: x };
  }
  if (!p) return { situacao: 'Sem data prevista', nivel: 'alerta', desvio: null };
  const falta = diffDias(p, H); // dias até à data prevista
  if (falta < 0) return { situacao: `Atrasado ${-falta}d`, nivel: 'critico', desvio: -falta };
  if (!vs.length) {
    if (falta <= 2) return { situacao: falta === 0 ? 'Hoje — sem camião' : `Sem camião (faltam ${falta}d)`, nivel: 'critico', desvio: null };
    return { situacao: 'Sem camião atribuído', nivel: 'alerta', desvio: null };
  }
  const saidaTarde = vs.some(v => (v.data_saida || v.data_saida_prevista) && (v.data_saida || v.data_saida_prevista) > p);
  if (saidaTarde) return { situacao: 'Saída do camião após data prevista', nivel: 'critico', desvio: null };
  if (d.estado === 'adiado') return { situacao: 'Adiado', nivel: 'alerta', desvio: null };
  if (falta === 0) return { situacao: d.estado === 'em_transito' ? 'Hoje — em trânsito' : 'Entrega hoje', nivel: 'info', desvio: 0 };
  if (d.estado === 'em_transito') return { situacao: 'Em trânsito', nivel: 'info', desvio: null };
  return { situacao: `Planeado (faltam ${falta}d)`, nivel: 'ok', desvio: null };
}

function soma(arr, f) { return arr.reduce((s, x) => s + (f(x) || 0), 0); }

function painel(mid) {
  const M = carregarMissao(mid);
  if (!M) return null;
  const { destinos, viagens, custos } = M;
  const ativos = destinos.filter(d => d.estado !== 'cancelado');
  const entregues = ativos.filter(d => d.estado === 'entregue' || d.estado === 'parcial');
  const transporte = soma(viagens, v => v.custo_transporte);
  const outros = soma(custos, c => c.valor);
  const pago = soma(viagens.filter(v => v.estado !== 'cancelada'), v => (v.adiantamento || 0) + (v.valor_pago || 0)) + soma(custos.filter(c => c.pago), c => c.valor);
  const total = transporte + outros;
  const benefTotal = soma(ativos, d => d.benef_total);
  const benefAtendidos = soma(entregues, d => d.benef_atendidos ?? d.benef_total);

  const porCategoria = {};
  porCategoria['Transporte (subcontratado)'] = transporte;
  for (const c of custos) porCategoria[c.categoria_nome] = (porCategoria[c.categoria_nome] || 0) + c.valor;

  const porTransportadora = {};
  for (const v of viagens.filter(v => v.estado !== 'cancelada')) {
    const k = v.transportadora || '(sem transportadora)';
    const t = porTransportadora[k] ||= { nome: k, viagens: 0, valor: 0, pago: 0, nd: 0 };
    t.viagens++; t.valor += v.custo_transporte; t.pago += (v.adiantamento || 0) + (v.valor_pago || 0); t.nd += v.nd_desconto || 0;
  }
  const grupos = (key) => {
    const g = {};
    for (const d of ativos) {
      const k = typeof key === 'function' ? key(d) : d[key];
      const x = g[k] ||= { nome: k, destinos: 0, entregues: 0, atrasados: 0, benef: 0, custo: 0 };
      x.destinos++; x.benef += d.benef_total || 0; x.custo += d.custo_total;
      if (d.estado === 'entregue' || d.estado === 'parcial') x.entregues++;
      if (d.nivel === 'critico') x.atrasados++;
    }
    return Object.values(g).map(x => ({ ...x, custo_benef: x.benef ? x.custo / x.benef : null }));
  };
  const porDia = {};
  for (const d of ativos) {
    const k = d.data_prevista || 'sem data';
    const x = porDia[k] ||= { data: k, destinos: 0, entregues: 0, benef: 0 };
    x.destinos++; x.benef += d.benef_total || 0;
    if (d.estado === 'entregue' || d.estado === 'parcial') x.entregues++;
  }
  const alertas = destinos.filter(d => d.nivel === 'critico' || d.nivel === 'alerta')
    .sort((a, b) => (a.nivel === 'critico' ? 0 : 1) - (b.nivel === 'critico' ? 0 : 1) || String(a.data_prevista).localeCompare(String(b.data_prevista)));
  // viagens com destinos de datas muito diferentes ou distritos dispersos
  const alertasViagem = [];
  for (const v of viagens.filter(v => v.estado !== 'cancelada' && v.estado !== 'concluida')) {
    const ds = v.destinos.map(x => destinos.find(d => d.id === x.destino_id));
    if (!v.matricula) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: 'Sem matrícula registada' });
    if (!v.motorista) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: 'Sem motorista registado' });
    if (!v.transportadora_id) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: 'Sem transportadora' });
    if (!v.custo_transporte) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: 'Preço do transporte não definido' });
    const provs = new Set(ds.map(d => d.provincia));
    if (provs.size > 1) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: `Destinos em ${provs.size} províncias (${[...provs].join(', ')})` });
    const saida = v.data_saida || v.data_saida_prevista;
    const primeira = ds.map(d => d.data_prevista).filter(Boolean).sort()[0];
    if (saida && primeira && saida > primeira) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: `Sai a ${saida} mas o 1.º destino está previsto para ${primeira}` });
    if (v.estado === 'planeada' && saida && saida < M.hoje) alertasViagem.push({ viagem: v.id, codigo: v.codigo, texto: `Saída prevista (${saida}) já passou e continua "Planeada"` });
  }
  return {
    missao: M.missao, hoje: M.hoje,
    kpis: {
      destinos: ativos.length, entregues: entregues.length,
      atrasados: ativos.filter(d => d.data_prevista && d.data_prevista < M.hoje && !['entregue', 'parcial'].includes(d.estado)).length,
      criticos: ativos.filter(d => d.nivel === 'critico').length,
      sem_camiao: ativos.filter(d => !d.viagens.length && d.estado !== 'entregue' && d.estado !== 'parcial').length,
      em_transito: ativos.filter(d => d.estado === 'em_transito').length,
      no_prazo: entregues.filter(d => d.desvio == null || d.desvio <= 0).length,
      benef_total: benefTotal, benef_atendidos: benefAtendidos,
      viagens: viagens.filter(v => v.estado !== 'cancelada').length,
      viagens_em_curso: viagens.filter(v => v.estado === 'em_transito' || v.estado === 'carregada').length,
      custo_transporte: transporte, custo_outros: outros, custo_total: total,
      pago, por_pagar: total - pago,
      custo_benef: benefTotal ? total / benefTotal : null,
      orcamento: db.prepare('SELECT COALESCE(SUM(valor),0) s FROM orcamento WHERE missao_id=?').get(mid).s || M.missao.orcamento || 0,
    },
    porCategoria: Object.entries(porCategoria).map(([nome, valor]) => ({ nome, valor })).filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor),
    porTransportadora: Object.values(porTransportadora).sort((a, b) => b.valor - a.valor),
    porProvincia: grupos('provincia'),
    porDistrito: grupos(d => `${d.provincia} · ${d.distrito}`),
    porDia: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
    alertas: alertas.map(d => ({ id: d.id, comunidade: d.comunidade, distrito: d.distrito, provincia: d.provincia, data_prevista: d.data_prevista, situacao: d.situacao, nivel: d.nivel })),
    alertasViagem,
  };
}

// Sugere agrupar destinos sem camião por distrito + data prevista (e por província/data)
function sugestoes(mid) {
  const M = carregarMissao(mid);
  if (!M) return [];
  const livres = M.destinos.filter(d => !d.viagens.length && !['entregue', 'parcial', 'cancelado'].includes(d.estado));
  const g = {};
  for (const d of livres) {
    const k = `${d.provincia}|${d.distrito}|${d.data_prevista || ''}`;
    (g[k] ||= { provincia: d.provincia, distrito: d.distrito, data_prevista: d.data_prevista, destinos: [] }).destinos.push(d);
  }
  // juntar distritos vizinhos da mesma província e mesma data num mesmo camião sugerido
  const porProvData = {};
  for (const x of Object.values(g)) (porProvData[`${x.provincia}|${x.data_prevista}`] ||= []).push(x);
  const out = [];
  for (const lista of Object.values(porProvData)) {
    const ds = lista.flatMap(x => x.destinos);
    out.push({
      titulo: `${lista[0].provincia} — ${lista.map(x => x.distrito).join(' + ')}`,
      provincia: lista[0].provincia,
      distritos: lista.map(x => x.distrito),
      data_prevista: lista[0].data_prevista,
      saida_sugerida: lista[0].data_prevista ? sugerirSaida(lista[0].provincia, lista[0].data_prevista) : null,
      destinos: ds.map(d => ({ id: d.id, comunidade: d.comunidade, distrito: d.distrito, benef_total: d.benef_total, local_entrega: d.local_entrega })),
      benef_total: soma(ds, d => d.benef_total),
      locais: [...new Set(ds.map(d => d.local_entrega).filter(Boolean))],
    });
  }
  return out.sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)));
}
// Inhambane fica longe de Maputo: sugerir sair na véspera
function sugerirSaida(provincia, data) {
  const dias = provincia === 'Inhambane' ? 1 : 0;
  const d = new Date(data + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ---------- Financeiro: receita, orçamento, custo real, margem e projecção ----------
const RUBRICAS = { transporte: 'Transporte (subcontratado)', ...CATEGORIAS };

function receitaDe(missao, benef) {
  if (missao.receita_modo === 'por_beneficiario') return benef * (missao.receita_unit || 0);
  return null; // global: repartido mais abaixo
}

function financeiro(mid, M = carregarMissao(mid)) {
  if (!M) return null;
  const { missao, destinos, viagens, custos, hoje: H } = M;
  const ativos = destinos.filter(d => d.estado !== 'cancelado');
  const benefTotal = soma(ativos, d => d.benef_total);
  const receita = missao.receita_modo === 'por_beneficiario' ? benefTotal * (missao.receita_unit || 0) : (missao.receita_valor || 0);

  // orçamento por rubrica (opcional)
  const linhas = db.prepare('SELECT * FROM orcamento WHERE missao_id=?').all(mid);
  const orc = Object.fromEntries(linhas.map(l => [l.categoria, l]));
  const orcTotal = soma(linhas, l => l.valor);

  // só factos: o que está registado e o que foi pago
  const vAtivas = viagens.filter(v => v.estado !== 'cancelada');
  const gasto = { transporte: soma(vAtivas, v => v.custo_transporte) };
  const pago = { transporte: soma(vAtivas, v => Math.min(v.custo_transporte, (v.adiantamento || 0) + (v.valor_pago || 0))) };
  for (const c of custos) {
    gasto[c.categoria] = (gasto[c.categoria] || 0) + c.valor;
    pago[c.categoria] = (pago[c.categoria] || 0) + (c.pago ? c.valor : 0);
  }
  const ndTotal = soma((M.notas || []).filter(n => n.conta), n => n.valor);
  const totalGasto = soma(Object.values(gasto), x => x) - ndTotal;
  const totalPago = soma(Object.values(pago), x => x);

  const rubricas = Object.entries(RUBRICAS).map(([k, nome]) => {
    const o = orc[k]?.valor || 0, g = gasto[k] || 0;
    return { categoria: k, nome, orcado: o, gasto: g, pago: pago[k] || 0, disponivel: o ? o - g : null, notas: orc[k]?.notas || '' };
  });
  if (ndTotal) rubricas.push({ categoria: 'nd', nome: 'Notas de débito a transportadores', orcado: 0, gasto: -ndTotal, pago: 0, disponivel: null, notas: '' });

  const porCamiao = vAtivas.map(v => ({
    id: v.id, codigo: v.codigo, matricula: v.matricula, transportadora: v.transportadora, estado_nome: v.estado_nome, estado: v.estado,
    destinos: v.destinos.length, transporte: v.custo_transporte, extras: v.custos_extra, nd: v.nd_desconto || 0, total: v.custo_total - (v.nd_desconto || 0),
    pago: Math.min(v.custo_transporte, (v.adiantamento || 0) + (v.valor_pago || 0)) + soma(custos.filter(c => c.viagem_id === v.id && c.pago), c => c.valor),
  }));

  const alertas = [];
  for (const r of rubricas) if (r.orcado && r.gasto > r.orcado) alertas.push({ nivel: 'critico', texto: `${r.nome}: já gastou ${Math.round(r.gasto).toLocaleString('pt-PT')} MT, acima do orçado (${Math.round(r.orcado).toLocaleString('pt-PT')} MT).` });
  if (receita && totalGasto > receita) alertas.push({ nivel: 'critico', texto: 'Os custos registados já ultrapassam a receita do projecto.' });

  return {
    missao, hoje: H,
    receita, orcamento: orcTotal, gasto: totalGasto, nd: ndTotal, pago: totalPago, por_pagar: totalGasto - totalPago,
    saldo: receita - totalGasto, saldo_pct: receita ? (receita - totalGasto) / receita : null,
    rubricas, porCamiao, alertas,
  };
}

// ---------- Mapa de projectos (todas as missões) ----------
// Execução medida em kits (projectos com kits), kg (projectos com artigos) ou nº de destinos
function resumoProjecto(mid) {
  const M = carregarMissao(mid);
  if (!M) return null;
  const F = financeiro(mid, M);
  const ativos = M.destinos.filter(d => d.estado !== 'cancelado');
  const entregue = d => d.estado === 'entregue';
  const comKits = ativos.some(d => d.benef_total);
  const comArtigos = ativos.some(d => d.itens?.length);
  const unid = comKits ? 'kits' : comArtigos ? 'kg' : 'destinos';
  const val = d => (unid === 'kits' ? d.benef_total || 0 : unid === 'kg' ? d.peso_itens || 0 : 1);
  const total = soma(ativos, val), feito = soma(ativos.filter(entregue), val);
  const exec = total ? feito / total : 0;
  const facturas = db.prepare('SELECT * FROM facturas WHERE missao_id=? ORDER BY data, id').all(mid);
  const validas = facturas.filter(f => f.estado !== 'anulada');
  const facturado = soma(validas, f => f.valor), recebido = soma(validas.filter(f => f.estado === 'paga'), f => f.valor);
  const executado = F.receita * exec;
  const nEnt = ativos.filter(entregue).length;
  const estado = !nEnt && !M.viagens.some(v => ['em_transito', 'concluida'].includes(v.estado)) ? 'por_implementar' : nEnt === ativos.length && ativos.length ? 'concluido' : 'em_curso';
  const datas = ativos.map(d => d.data_prevista).filter(Boolean).sort();
  const pendentes = ativos.filter(d => !entregue(d));
  return {
    id: M.missao.id, nome: M.missao.nome, cliente: M.missao.cliente || '', descricao: M.missao.descricao || '',
    estado, estado_nome: { por_implementar: 'Por implementar', em_curso: 'Em curso', concluido: 'Concluído' }[estado],
    inicio: M.missao.data_inicio || datas[0] || null, fim: M.missao.data_fim || datas.at(-1) || null,
    destinos: ativos.length, destinos_entregues: nEnt,
    provincias: [...new Set(ativos.map(d => d.provincia).filter(Boolean))],
    unidade: unid, total_unid: total, entregue_unid: feito, por_entregar_unid: total - feito, execucao: exec,
    viagens: M.viagens.filter(v => v.estado !== 'cancelada').length,
    receita: F.receita, executado, facturado, por_facturar: Math.max(0, executado - facturado), recebido, por_receber: facturado - recebido,
    custos: F.gasto, custos_pagos: F.pago, custos_por_pagar: F.por_pagar, saldo: F.receita - F.gasto,
    proximas: pendentes.filter(d => d.data_prevista).sort((a, b) => a.data_prevista.localeCompare(b.data_prevista)).slice(0, 3).map(d => `${d.comunidade} (${d.data_prevista.slice(8)}/${d.data_prevista.slice(5, 7)})`),
    sem_data: pendentes.filter(d => !d.data_prevista).length,
    facturas,
  };
}
function mapaProjectos() {
  return db.prepare('SELECT id FROM missoes ORDER BY id').all().map(m => resumoProjecto(m.id)).filter(Boolean);
}

function gravarOrcamento(mid, linhas) {
  const up = db.prepare(`INSERT INTO orcamento (missao_id, categoria, valor, notas) VALUES (?,?,?,?)
    ON CONFLICT(missao_id, categoria) DO UPDATE SET valor=excluded.valor, notas=excluded.notas`);
  for (const l of linhas) if (RUBRICAS[l.categoria]) up.run(mid, l.categoria, Number(l.valor) || 0, l.notas || null);
}

module.exports = { resumoProjecto, mapaProjectos, MOTIVOS_ND, ESTADOS_ND, infoKits, listaCarga, CATEGORIAS, RUBRICAS, ESTADOS_DESTINO, ESTADOS_VIAGEM, carregarMissao, painel, sugestoes, financeiro, gravarOrcamento, hoje };
