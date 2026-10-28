// Exportação do ponto de situação para Excel
const ExcelJS = require('exceljs');
const { listaCarga } = require('./logic');

const MZN = '#,##0.00 "MT"';
const COR = { cab: 'FF1F2937', amarelo: 'FFF5B301', ok: 'FFC6EFCE', alerta: 'FFFFEB9C', critico: 'FFFFC7CE', info: 'FFDDEBF7', neutro: 'FFEDEDED', previsto: 'FFB7E1A1', fds: 'FFFCE4D6' };
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const borda = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
const dt = s => (s ? new Date(s + 'T00:00:00Z') : null);
const ddmm = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');

function cabecalho(ws, row) {
  const r = ws.getRow(row);
  r.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(COR.cab);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = borda;
  });
  r.height = 30;
}
function tabela(ws, colunas, linhas, inicio = 1) {
  ws.columns = colunas.map(c => ({ key: c.key, width: c.w || 14 }));
  const h = ws.getRow(inicio);
  colunas.forEach((c, i) => { h.getCell(i + 1).value = c.t; });
  cabecalho(ws, inicio);
  linhas.forEach(l => {
    const r = ws.addRow(colunas.map(c => l[c.key]));
    colunas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.border = borda;
      if (c.fmt) cell.numFmt = c.fmt;
      if (c.fmt === 'dd/mm/yyyy') cell.alignment = { horizontal: 'center' };
    });
  });
  ws.views = [{ state: 'frozen', ySplit: inicio }];
  ws.autoFilter = { from: { row: inicio, column: 1 }, to: { row: inicio, column: colunas.length } };
}

async function exportarExcel(M, P, F) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controlo de Distribuição';
  wb.created = new Date();
  const vMap = new Map(M.viagens.map(v => [v.id, v]));
  const dMap = new Map(M.destinos.map(d => [d.id, d]));
  const K = P.kpis;

  // ---- Resumo ----
  const ws = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: COR.amarelo } } });
  ws.columns = [{ width: 38 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  ws.addRow([M.missao.nome]).font = { bold: true, size: 15 };
  ws.addRow([`Ponto de situação a ${M.hoje.split('-').reverse().join('/')}`]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const kp = [
    ['Destinos (comunidades)', K.destinos], ['Entregues', K.entregues], ['  dos quais no prazo', K.no_prazo],
    ['Em trânsito', K.em_transito], ['Atrasados (data prevista passou)', K.atrasados], ['Críticos (atrasados + sem camião iminente)', K.criticos], ['Sem camião atribuído', K.sem_camiao],
    ['Beneficiários previstos', K.benef_total], ['Beneficiários atendidos', K.benef_atendidos],
    ['Camiões / viagens', K.viagens],
    ['Custo de transporte', K.custo_transporte, MZN], ['Outros custos (estivas, etc.)', K.custo_outros, MZN],
    ['CUSTO TOTAL DO PROJECTO', K.custo_total, MZN], ['Pago', K.pago, MZN], ['Por pagar', K.por_pagar, MZN],
    ['Custo por beneficiário', K.custo_benef ?? '', MZN],
  ];
  if (K.orcamento) kp.push(['Orçamento', K.orcamento, MZN], ['Execução do orçamento', K.custo_total / K.orcamento, '0.0%']);
  for (const [a, b, f] of kp) {
    const r = ws.addRow([a, b]);
    r.getCell(1).border = borda; r.getCell(2).border = borda;
    if (f) r.getCell(2).numFmt = f;
    if (a.startsWith('CUSTO TOTAL')) { r.font = { bold: true }; r.getCell(2).fill = fill(COR.amarelo); }
    if (a.startsWith('Atrasados') && b) r.getCell(2).fill = fill(COR.critico);
  }
  ws.addRow([]);
  const blocos = [
    ['Custos por categoria', ['Categoria', 'Valor'], P.porCategoria.map(x => [x.nome, x.valor]), [null, MZN]],
    ['Por província', ['Província', 'Destinos', 'Entregues', 'Atrasados', 'Beneficiários', 'Custo'], P.porProvincia.map(x => [x.nome, x.destinos, x.entregues, x.atrasados, x.benef, x.custo]), [null, null, null, null, null, MZN]],
    ['Por distrito', ['Distrito', 'Destinos', 'Entregues', 'Atrasados', 'Beneficiários', 'Custo'], P.porDistrito.map(x => [x.nome, x.destinos, x.entregues, x.atrasados, x.benef, x.custo]), [null, null, null, null, null, MZN]],
    ['Por transportadora', ['Transportadora', 'Viagens', 'Valor', 'Pago', 'Saldo'], P.porTransportadora.map(x => [x.nome, x.viagens, x.valor, x.pago, x.valor - x.pago]), [null, null, MZN, MZN, MZN]],
  ];
  for (const [titulo, cab, linhas, fmts] of blocos) {
    if (!linhas.length) continue;
    ws.addRow([titulo]).font = { bold: true, size: 12 };
    const h = ws.addRow(cab); cabecalho(ws, h.number);
    for (const l of linhas) {
      const r = ws.addRow(l);
      l.forEach((_, i) => { r.getCell(i + 1).border = borda; if (fmts[i]) r.getCell(i + 1).numFmt = fmts[i]; });
    }
    ws.addRow([]);
  }
  if (P.alertas.length || P.alertasViagem.length) {
    ws.addRow(['Alertas']).font = { bold: true, size: 12 };
    for (const a of P.alertas) {
      const r = ws.addRow([`${a.comunidade} (${a.distrito})`, a.situacao]);
      r.getCell(2).fill = fill(a.nivel === 'critico' ? COR.critico : COR.alerta);
    }
    for (const a of P.alertasViagem) ws.addRow([`Camião ${a.codigo}`, a.texto]).getCell(2).fill = fill(COR.alerta);
  }

  // ---- Receita e Custos ----
  if (F) {
    const wf = wb.addWorksheet('Orçamento e Custos', { properties: { tabColor: { argb: 'FF16A34A' } } });
    wf.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
    wf.addRow(['Orçamento e custos — ' + M.missao.nome]).font = { bold: true, size: 14 };
    wf.addRow([]);
    const resumo = [['Orçamento do projecto', F.receita], ['Gasto até agora', F.gasto], ['Margem (orçamento − gasto)', F.saldo], ['Margem %', F.saldo_pct], ['Pago', F.pago], ['Por pagar', F.por_pagar]];
    if (F.orcamento) resumo.splice(1, 0, ['Limites por rubrica', F.orcamento]);
    for (const [a, b] of resumo) {
      const r = wf.addRow([a, b]);
      r.getCell(1).border = borda; r.getCell(2).border = borda; r.getCell(2).numFmt = a === 'Margem %' ? '0.0%' : MZN;
      if (a.startsWith('Margem (')) { r.font = { bold: true }; r.getCell(2).fill = fill(b < 0 ? COR.critico : COR.ok); }
    }
    wf.addRow([]);
    const h = wf.addRow(['Rubrica', 'Orçado', 'Gasto', 'Pago', 'Disponível do orçado']); cabecalho(wf, h.number);
    for (const x of F.rubricas.filter(x => x.orcado || x.gasto)) {
      const r = wf.addRow([x.nome, x.orcado || null, x.gasto, x.pago, x.disponivel]);
      [2, 3, 4, 5].forEach(i => (r.getCell(i).numFmt = MZN)); r.eachCell(c => (c.border = borda));
      if (x.disponivel != null && x.disponivel < 0) r.getCell(5).fill = fill(COR.critico);
    }
    if (F.porCamiao.length) {
      wf.addRow([]);
      const h2 = wf.addRow(['Camião', 'Transportadora', 'Transporte', 'Estivas e extras', 'Total', 'Pago']); cabecalho(wf, h2.number);
      for (const v of F.porCamiao) {
        const r = wf.addRow([`${v.codigo} ${v.matricula || ''}`, v.transportadora || '', v.transporte, v.extras, v.total, v.pago]);
        [3, 4, 5, 6].forEach(i => (r.getCell(i).numFmt = MZN));
      }
    }
  }

  // ---- Destinos ----
  const wd = wb.addWorksheet('Destinos');
  tabela(wd, [
    { key: 'provincia', t: 'Província' }, { key: 'distrito', t: 'Distrito' }, { key: 'posto', t: 'Posto Adm.' },
    { key: 'localidade', t: 'Localidade' }, { key: 'comunidade', t: 'Comunidade', w: 22 },
    { key: 'tipo_kit', t: 'Tipo de kit', w: 20 }, { key: 'benef_baixa', t: 'Kits Baixa', w: 9 }, { key: 'benef_sequeiro', t: 'Kits Sequeiro', w: 10 }, { key: 'benef_total', t: 'Total kits', w: 9 },
    { key: 'local_entrega', t: 'Local de entrega', w: 26 },
    { key: 'data_prevista', t: 'Data prevista', fmt: 'dd/mm/yyyy', w: 12 },
    { key: 'camiao', t: 'Camião(ões)', w: 20 }, { key: 'transportadora', t: 'Transportadora', w: 20 },
    { key: 'estado', t: 'Estado', w: 14 }, { key: 'data_entrega', t: 'Data entrega', fmt: 'dd/mm/yyyy', w: 12 },
    { key: 'benef_atendidos', t: 'Benef. atendidos', w: 10 }, { key: 'situacao', t: 'Situação vs cronograma', w: 28 },
    { key: 'custo_transporte', t: 'Custo transporte (alocado)', fmt: MZN, w: 16 }, { key: 'custo_outros', t: 'Outros custos', fmt: MZN, w: 14 },
    { key: 'custo_total', t: 'Custo total', fmt: MZN, w: 15 }, { key: 'observacoes', t: 'Observações', w: 36 },
  ], M.destinos.map(d => ({
    ...d,
    data_prevista: dt(d.data_prevista), data_entrega: dt(d.data_entrega),
    camiao: d.viagens.map(id => { const v = vMap.get(id); return `${v.codigo}${v.matricula ? ' · ' + v.matricula : ''}`; }).join('; '),
    transportadora: [...new Set(d.viagens.map(id => vMap.get(id).transportadora).filter(Boolean))].join('; '),
    estado: d.estado_nome,
    tipo_kit: [d.benef_baixa ? 'Baixa' : '', d.benef_sequeiro ? 'Sequeiro' : ''].filter(Boolean).join(' + ') || '—',
  })));
  const iSit = wd.getColumn('situacao').number;
  M.destinos.forEach((d, i) => { wd.getRow(i + 2).getCell(iSit).fill = fill(COR[d.nivel] || COR.neutro); });
  const tr = wd.addRow({ comunidade: 'TOTAL', benef_total: K.benef_total, custo_total: M.destinos.reduce((s, d) => s + d.custo_total, 0) });
  tr.font = { bold: true }; tr.getCell(wd.getColumn('custo_total').number).numFmt = MZN;

  // ---- Camiões ----
  const wv = wb.addWorksheet('Camiões');
  tabela(wv, [
    { key: 'codigo', t: 'Código', w: 10 }, { key: 'transportadora', t: 'Transportadora', w: 22 },
    { key: 'matricula', t: 'Matrícula', w: 13 }, { key: 'matricula_reboque', t: 'Reboque', w: 12 },
    { key: 'motorista', t: 'Motorista', w: 20 }, { key: 'motorista_tel', t: 'Telefone', w: 14 },
    { key: 'capacidade_t', t: 'Cap. (t)', w: 8 }, { key: 'origem', t: 'Origem', w: 16 },
    { key: 'data_saida_prevista', t: 'Saída prevista', fmt: 'dd/mm/yyyy', w: 12 }, { key: 'data_saida', t: 'Saída real', fmt: 'dd/mm/yyyy', w: 12 },
    { key: 'data_regresso', t: 'Regresso', fmt: 'dd/mm/yyyy', w: 12 },
    { key: 'estado_nome', t: 'Estado', w: 12 }, { key: 'n', t: 'Nº destinos', w: 9 }, { key: 'lista', t: 'Destinos', w: 50 },
    { key: 'benef_total', t: 'Beneficiários', w: 11 },
    { key: 'kits_baixa', t: 'Kits Baixa', w: 9 }, { key: 'kits_sequeiro', t: 'Kits Sequeiro', w: 10 }, { key: 'peso_t', t: 'Peso estim. (t)', fmt: '0.00', w: 11 },
    { key: 'modo', t: 'Modo preço', w: 12 }, { key: 'custo_transporte', t: 'Preço transporte', fmt: MZN, w: 16 },
    { key: 'custos_extra', t: 'Custos extra (estivas…)', fmt: MZN, w: 16 }, { key: 'custo_total', t: 'Custo total', fmt: MZN, w: 16 },
    { key: 'adiantamento', t: 'Adiantamento', fmt: MZN, w: 14 }, { key: 'valor_pago', t: 'Pago', fmt: MZN, w: 14 },
    { key: 'saldo_pagar', t: 'Saldo a pagar', fmt: MZN, w: 14 }, { key: 'observacoes', t: 'Observações', w: 30 },
  ], M.viagens.map(v => ({
    ...v,
    data_saida_prevista: dt(v.data_saida_prevista), data_saida: dt(v.data_saida), data_regresso: dt(v.data_regresso),
    n: v.destinos.length, peso_t: v.peso_kg / 1000,
    lista: v.destinos.map(x => { const d = dMap.get(x.destino_id); return `${d.comunidade} (${d.distrito}, ${ddmm(d.data_prevista)})${v.modo_preco === 'por_destino' ? ' ' + Number(x.preco || 0).toLocaleString('pt-PT') + ' MT' : ''}`; }).join('; '),
    modo: v.modo_preco === 'por_destino' ? 'Por destino' : 'Valor global',
  })));
  wv.getColumn('lista').alignment = { wrapText: true, vertical: 'top' };

  // ---- Kits: quantidades a preparar ----
  if (M.kits?.itens?.length) {
    const ativos = M.destinos.filter(d => d.estado !== 'cancelado');
    const provs = [...new Set(ativos.map(d => d.provincia))];
    const tot = listaCarga(M.kits, ativos);
    const porP = provs.map(p => listaCarga(M.kits, ativos.filter(d => d.provincia === p)));
    const wk = wb.addWorksheet('Kits');
    wk.columns = [{ width: 16 }, { width: 40 }, { width: 14 }, ...provs.map(() => ({ width: 12 })), { width: 12 }, { width: 14 }];
    wk.addRow(['Quantidades a preparar (1 kit por beneficiário)']).font = { bold: true, size: 13 };
    wk.addRow([`Kits Baixa: ${tot.kits.baixa} · Kits Sequeiro: ${tot.kits.sequeiro}`]).font = { italic: true, color: { argb: 'FF555555' } };
    const h = wk.addRow(['Artigo', 'Descrição', 'Embalagem', ...provs, 'Total', 'Peso (kg)']); cabecalho(wk, h.number);
    for (const i of tot.itens) {
      const r = wk.addRow([i.item, i.descricao, i.embalagem, ...porP.map(p => p.itens.find(x => x.descricao === i.descricao)?.qtd || 0), i.qtd, i.peso_kg ?? 'por confirmar']);
      r.eachCell(c => (c.border = borda)); r.getCell(4 + provs.length).font = { bold: true };
    }
  }

  // ---- Custos ----
  const wc = wb.addWorksheet('Custos');
  tabela(wc, [
    { key: 'data', t: 'Data', fmt: 'dd/mm/yyyy', w: 12 }, { key: 'categoria_nome', t: 'Categoria', w: 26 },
    { key: 'descricao', t: 'Descrição', w: 32 }, { key: 'fornecedor', t: 'Fornecedor / pago a', w: 22 },
    { key: 'camiao', t: 'Camião', w: 14 }, { key: 'destino', t: 'Destino', w: 22 },
    { key: 'quantidade', t: 'Qtd', w: 7 }, { key: 'valor_unitario', t: 'Valor unit.', fmt: MZN, w: 14 },
    { key: 'valor', t: 'Valor', fmt: MZN, w: 14 }, { key: 'pago', t: 'Pago?', w: 7 }, { key: 'observacoes', t: 'Observações', w: 36 },
  ], M.custos.map(c => ({
    ...c, data: dt(c.data), pago: c.pago ? 'Sim' : 'Não',
    camiao: c.viagem_id ? vMap.get(c.viagem_id)?.codigo : '', destino: c.destino_id ? dMap.get(c.destino_id)?.comunidade : '',
  })));
  const tc = wc.addRow({ descricao: 'TOTAL', valor: K.custo_outros }); tc.font = { bold: true }; tc.getCell(9).numFmt = MZN;

  // ---- Artigos por destino (projectos sem kits) ----
  const comItens = M.destinos.filter(d => d.itens?.length);
  if (comItens.length) {
    const wa = wb.addWorksheet('Artigos');
    tabela(wa, [
      { key: 'provincia', t: 'Província', w: 11 }, { key: 'distrito', t: 'Distrito', w: 13 }, { key: 'destino', t: 'Destino', w: 20 }, { key: 'local', t: 'Local', w: 16 },
      { key: 'categoria', t: 'Categoria', w: 22 }, { key: 'artigo', t: 'Artigo', w: 36 }, { key: 'codigo', t: 'Código', w: 16 }, { key: 'fornecedor', t: 'Fornecedor', w: 13 },
      { key: 'lote', t: 'Lote', w: 7 }, { key: 'volumes', t: 'Volumes', w: 9 }, { key: 'peso', t: 'Peso (kg)', fmt: '#,##0.0', w: 10 }, { key: 'camiao', t: 'Camião', w: 16 },
      { key: 'estado', t: 'Estado', w: 12 }, { key: 'observacoes', t: 'Observações', w: 30 },
    ], comItens.flatMap(d => d.itens.map(i => ({ provincia: d.provincia, distrito: d.distrito, destino: d.comunidade, local: d.local_entrega || d.localidade, categoria: i.categoria, artigo: i.artigo, codigo: i.codigo,
      fornecedor: i.fornecedor, lote: i.lote, volumes: i.volumes, peso: i.peso_kg, camiao: d.viagens.map(id => vMap.get(id)?.codigo).filter(Boolean).join(', '), estado: d.estado_nome, observacoes: i.observacoes }))));
    const t = wa.addRow({ artigo: 'TOTAL', volumes: comItens.reduce((s, d) => s + d.volumes, 0), peso: comItens.reduce((s, d) => s + d.peso_itens, 0) }); t.font = { bold: true };
  }

  // ---- Notas de débito ----
  if (M.notas?.length) {
    const wn = wb.addWorksheet('Notas de débito');
    const linhas = [];
    for (const nd of M.notas) {
      const v = vMap.get(nd.viagem_id), d = dMap.get(nd.destino_id);
      const base = { numero: nd.numero, data: dt(nd.data), transportadora: nd.transportadora || '', camiao: v ? `${v.codigo} ${v.matricula || ''}` : '', destino: d?.comunidade || '', motivo: nd.motivo_nome, estado: nd.estado_nome, referencia: nd.referencia || '', observacoes: nd.observacoes || '' };
      if (!nd.linhas.length) linhas.push({ ...base, valor: 0 });
      nd.linhas.forEach(l => linhas.push({ ...base, artigo: l.artigo, quantidade: l.quantidade, preco_unit: l.preco_unit, valor: l.valor }));
    }
    tabela(wn, [
      { key: 'numero', t: 'Nº', w: 9 }, { key: 'data', t: 'Data', fmt: 'dd/mm/yyyy', w: 11 }, { key: 'transportadora', t: 'Transportadora', w: 22 },
      { key: 'camiao', t: 'Camião', w: 18 }, { key: 'destino', t: 'Destino', w: 20 }, { key: 'motivo', t: 'Motivo', w: 20 }, { key: 'estado', t: 'Estado', w: 11 },
      { key: 'artigo', t: 'Artigo', w: 32 }, { key: 'quantidade', t: 'Qtd', w: 7 }, { key: 'preco_unit', t: 'Valor unit.', fmt: MZN, w: 14 }, { key: 'valor', t: 'Valor', fmt: MZN, w: 14 },
      { key: 'referencia', t: 'Documento suporte', w: 18 }, { key: 'observacoes', t: 'Observações', w: 40 },
    ], linhas);
    const t = wn.addRow({ artigo: 'TOTAL descontado (emitidas + aceites)', valor: M.notas.filter(n => n.conta).reduce((s, n) => s + n.valor, 0) });
    t.font = { bold: true }; t.getCell(wn.getColumn('valor').number).numFmt = MZN;
  }

  // ---- Cronograma (grelha igual ao mapa original) ----
  const wg = wb.addWorksheet('Cronograma');
  const datas = [...M.destinos.flatMap(d => [d.data_prevista, d.data_entrega]), M.hoje].filter(Boolean).sort();
  const dias = [];
  if (datas.length) {
    for (let d = new Date(datas[0] + 'T00:00:00Z'); d <= new Date(datas.at(-1) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
  }
  const fixas = ['Província', 'Distrito', 'Posto Adm.', 'Localidade', 'Comunidade', 'Kits'];
  wg.columns = [...fixas.map((_, i) => ({ width: [11, 12, 15, 14, 22, 12][i] })), ...dias.map(() => ({ width: 6.5 })), { width: 26 }, { width: 26 }];
  wg.addRow([...fixas, ...dias.map(ddmm), 'Local de entrega', 'Situação']);
  cabecalho(wg, 1);
  wg.getRow(1).eachCell(c => { c.fill = fill(COR.amarelo); c.font = { bold: true, color: { argb: 'FF000000' } }; });
  for (const d of M.destinos) {
    const r = wg.addRow([d.provincia, d.distrito, d.posto, d.localidade, d.comunidade, [d.benef_baixa ? `B ${d.benef_baixa}` : '', d.benef_sequeiro ? `S ${d.benef_sequeiro}` : ''].filter(Boolean).join(' + '), ...dias.map(() => ''), d.local_entrega, d.situacao]);
    dias.forEach((dia, i) => {
      const c = r.getCell(fixas.length + 1 + i);
      c.border = borda;
      const wd_ = new Date(dia + 'T00:00:00Z').getUTCDay();
      if (wd_ === 0 || wd_ === 6) c.fill = fill(COR.fds);
      if (dia === d.data_prevista) { c.fill = fill(COR.previsto); c.value = 'P'; }
      if (dia === d.data_entrega) {
        const atraso = d.data_prevista && d.data_entrega > d.data_prevista;
        c.fill = fill(atraso ? 'FFF8696B' : 'FF2E7D32'); c.value = '✓'; c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }
      c.alignment = { horizontal: 'center' };
      if (dia === M.hoje) c.border = { ...borda, left: { style: 'medium', color: { argb: 'FFE11D48' } }, right: { style: 'medium', color: { argb: 'FFE11D48' } } };
    });
    r.getCell(fixas.length + dias.length + 2).fill = fill(COR[d.nivel] || COR.neutro);
  }
  wg.views = [{ state: 'frozen', xSplit: 6, ySplit: 1 }];
  wg.addRow([]);
  wg.addRow(['Legenda: P = data prevista · ✓ verde = entregue no prazo · ✓ vermelho = entregue com atraso · laranja claro = fim de semana · contorno vermelho = hoje']).font = { italic: true, size: 9 };

  return wb.xlsx.writeBuffer();
}

module.exports = { exportarExcel };
