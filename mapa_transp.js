// Mapa de viagens e custos por transportadora (Excel + versão imprimível)
const ExcelJS = require('exceljs');
const L = require('./logic');

const MZN = '#,##0.00 "MT"';
const borda = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const dt = s => (s ? new Date(s + 'T00:00:00Z') : null);
const dmy = s => (s ? s.split('-').reverse().join('/') : '—');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = v => { const x = Number(v) || 0; const [i, f] = Math.abs(x).toFixed(2).split('.'); return (x < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + f; };

// Dados de cada transportadora: viagens, notas de débito e totais
function dados(mid) {
  const M = L.carregarMissao(mid);
  const dMap = new Map(M.destinos.map(d => [d.id, d]));
  const ids = [...new Set(M.viagens.map(v => v.transportadora_id ?? 0))];
  const lista = ids.map(tid => {
    const vs = M.viagens.filter(v => (v.transportadora_id ?? 0) === tid);
    const viagens = vs.map(v => {
      const ds = v.destinos.map(x => dMap.get(x.destino_id)).filter(Boolean);
      const notas = M.notas.filter(n => n.viagem_id === v.id);
      const pago = (v.adiantamento || 0) + (v.valor_pago || 0);
      return {
        v, ds, notas,
        destinos: ds.map(d => d.comunidade).join('; '),
        distritos: [...new Set(ds.map(d => d.distrito))].join(', '),
        kits_b: v.kits_baixa || 0, kits_s: v.kits_sequeiro || 0, peso_t: (v.peso_kg || 0) / 1000,
        valor: v.estado === 'cancelada' ? 0 : v.custo_transporte, nd: v.nd_desconto || 0, adiantamento: v.adiantamento || 0, pago_rest: v.valor_pago || 0,
        pago, saldo: v.estado === 'cancelada' ? 0 : v.saldo_pagar, extras: v.custos_extra || 0,
      };
    });
    const soma = k => viagens.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    return {
      id: tid, nome: vs[0]?.transportadora || 'Sem transportadora', viagens,
      tot: { n: viagens.filter(x => x.v.estado !== 'cancelada').length, valor: soma('valor'), nd: soma('nd'), adiantamento: soma('adiantamento'), pago: soma('pago'), saldo: soma('saldo'), kits: soma('kits_b') + soma('kits_s'), extras: soma('extras') },
    };
  }).sort((a, b) => b.tot.valor - a.tot.valor);
  return { M, lista };
}

function cab(ws, r) {
  ws.getRow(r).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF1F2937'); c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = borda; });
  ws.getRow(r).height = 30;
}
const COLS = [
  ['codigo', 'Camião', 9], ['matricula', 'Matrícula', 12], ['motorista', 'Motorista', 18], ['tel', 'Telefone', 13],
  ['saida', 'Saída', 11, 'dd/mm/yyyy'], ['regresso', 'Conclusão', 11, 'dd/mm/yyyy'], ['estado', 'Estado', 11],
  ['distritos', 'Distritos', 18], ['destinos', 'Destinos', 40], ['kits', 'Kits (B/S)', 11], ['peso', 'Peso (t)', 8, '0.0'],
  ['valor', 'Valor transporte', 15, MZN], ['nd', 'Notas de débito', 14, MZN], ['adiant', 'Adiantamento', 14, MZN], ['pago', 'Restante pago', 14, MZN],
  ['saldo', 'Saldo a pagar', 15, MZN], ['obs', 'Observações', 34],
];
function folhaTransp(wb, t, M, titulo) {
  const ws = wb.addWorksheet(titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  ws.columns = COLS.map(([key, , w]) => ({ key, width: w }));
  ws.addRow([`Mapa de viagens e custos — ${t.nome}`]).font = { bold: true, size: 14 };
  ws.addRow([`${M.missao.nome} · emitido a ${dmy(M.hoje)}`]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const h = ws.addRow(COLS.map(c => c[1])); cab(ws, h.number);
  for (const x of t.viagens) {
    const v = x.v;
    const r = ws.addRow({
      codigo: v.codigo, matricula: [v.matricula, v.matricula_reboque].filter(Boolean).join(' / '), motorista: v.motorista || '', tel: v.motorista_tel || '',
      saida: dt(v.data_saida || v.data_saida_prevista), regresso: dt(v.data_regresso), estado: v.estado_nome,
      distritos: x.distritos, destinos: x.destinos, kits: `${x.kits_b} / ${x.kits_s}`, peso: x.peso_t,
      valor: x.valor, nd: x.nd ? -x.nd : 0, adiant: x.adiantamento, pago: x.pago_rest, saldo: x.saldo,
      obs: [v.observacoes, ...x.notas.map(n => `${n.numero} (${n.estado_nome}): ${n.motivo_nome} ${n2(n.valor)} MT`)].filter(Boolean).join(' | '),
    });
    r.eachCell({ includeEmpty: true }, (c, i) => { c.border = borda; const f = COLS[i - 1]?.[3]; if (f) c.numFmt = f; c.alignment = { vertical: 'top', wrapText: [9, 17].includes(i) }; });
    if (v.estado === 'cancelada') r.font = { color: { argb: 'FF9CA3AF' }, strike: true };
    if (x.saldo > 0) r.getCell('saldo').font = { bold: true, color: { argb: 'FFC2261D' } };
  }
  const T = t.tot;
  const tr = ws.addRow({ codigo: 'TOTAL', motorista: `${T.n} viagem(ns)`, kits: `${T.kits} kits`, valor: T.valor, nd: T.nd ? -T.nd : 0, adiant: T.adiantamento, pago: T.pago - T.adiantamento, saldo: T.saldo });
  tr.font = { bold: true }; tr.eachCell({ includeEmpty: true }, (c, i) => { c.fill = fill('FFF3F4F6'); c.border = borda; const f = COLS[i - 1]?.[3]; if (f && f !== 'dd/mm/yyyy') c.numFmt = f; });
  ws.views = [{ state: 'frozen', ySplit: h.number }];
  ws.autoFilter = { from: { row: h.number, column: 1 }, to: { row: h.number, column: COLS.length } };
  // notas de débito em detalhe
  const notas = t.viagens.flatMap(x => x.notas);
  if (notas.length) {
    ws.addRow([]); ws.addRow(['Notas de débito']).font = { bold: true, size: 12 };
    const hn = ws.addRow(['Nº', 'Data', 'Camião', 'Motivo', 'Estado', 'Artigos', '', '', '', '', '', 'Valor']); cab(ws, hn.number);
    for (const n of notas) {
      const r = ws.addRow([n.numero, dt(n.data), M.viagens.find(v => v.id === n.viagem_id)?.codigo, n.motivo_nome, n.estado_nome, n.linhas.map(l => `${l.quantidade} × ${l.artigo}`).join('; '), '', '', '', '', '', n.valor]);
      r.getCell(2).numFmt = 'dd/mm/yyyy'; r.getCell(12).numFmt = MZN;
    }
  }
  return ws;
}

async function excel(mid, tid) {
  const { M, lista } = dados(mid);
  const sel = tid != null ? lista.filter(t => String(t.id) === String(tid)) : lista;
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  if (tid == null) {
    const ws = wb.addWorksheet('Resumo');
    ws.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 17 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 17 }];
    ws.addRow(['Mapa de viagens e custos por transportadora']).font = { bold: true, size: 14 };
    ws.addRow([`${M.missao.nome} · emitido a ${dmy(M.hoje)}`]).font = { italic: true, color: { argb: 'FF555555' } };
    ws.addRow([]);
    const h = ws.addRow(['Transportadora', 'Viagens', 'Kits', 'Valor transporte', 'Notas de débito', 'Adiantamentos', 'Total pago', 'Saldo a pagar']); cab(ws, h.number);
    for (const t of lista) {
      const r = ws.addRow([t.nome, t.tot.n, t.tot.kits, t.tot.valor, t.tot.nd ? -t.tot.nd : 0, t.tot.adiantamento, t.tot.pago, t.tot.saldo]);
      r.eachCell(c => (c.border = borda)); [4, 5, 6, 7, 8].forEach(i => (r.getCell(i).numFmt = MZN));
    }
    const s = k => lista.reduce((a, t) => a + t.tot[k], 0);
    const tr = ws.addRow(['TOTAL', s('n'), s('kits'), s('valor'), -s('nd'), s('adiantamento'), s('pago'), s('saldo')]);
    tr.font = { bold: true }; [4, 5, 6, 7, 8].forEach(i => (tr.getCell(i).numFmt = MZN)); tr.eachCell(c => (c.fill = fill('FFF3F4F6')));
  }
  sel.forEach(t => folhaTransp(wb, t, M, t.nome));
  return { buf: await wb.xlsx.writeBuffer(), nome: tid != null ? (sel[0]?.nome || 'transportadora') : 'todas', M };
}

// Extracto imprimível de uma transportadora
function html(mid, tid) {
  const { M, lista } = dados(mid);
  const t = lista.find(x => String(x.id) === String(tid));
  if (!t) return null;
  const T = t.tot;
  const linhas = t.viagens.map(x => {
    const v = x.v;
    return `<tr class="${v.estado === 'cancelada' ? 'canc' : ''}"><td><b>${esc(v.codigo)}</b><div class="mono">${esc(v.matricula || '—')}</div></td>
      <td>${esc(v.motorista || '—')}<div class="m">${esc(v.motorista_tel || '')}</div></td>
      <td class="nw">${dmy(v.data_saida || v.data_saida_prevista)}<div class="m">${esc(v.estado_nome)}</div></td>
      <td>${esc(x.destinos)}<div class="m">${esc(x.distritos)} · ${x.kits_b + x.kits_s} kits</div>${v.observacoes ? `<div class="m">${esc(v.observacoes)}</div>` : ''}</td>
      <td class="r">${n2(x.valor)}</td><td class="r">${x.nd ? '−' + n2(x.nd) : '—'}</td><td class="r">${n2(x.pago)}</td><td class="r b">${n2(x.saldo)}</td></tr>`;
  }).join('');
  const notas = t.viagens.flatMap(x => x.notas);
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Mapa de viagens — ${esc(t.nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} body{font:11.5px/1.45 Inter,system-ui,sans-serif;color:#18181b;margin:0;background:#f4f4f5}
.page{max-width:1100px;margin:24px auto;background:#fff;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:19px;margin:0}.m{color:#71717a;font-size:10.5px}.r{text-align:right}.b{font-weight:700}.nw{white-space:nowrap}.mono{font-family:Consolas,monospace;font-size:10.5px}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:16px}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}.kpi div{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}.kpi span{display:block;color:#71717a;font-size:10.5px}.kpi b{font-size:14px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10.5px;color:#52525b;border-bottom:1px solid #18181b;padding:6px}td{padding:6px;border-bottom:1px solid #e4e4e7;vertical-align:top}
tfoot td{font-weight:700;border-top:1px solid #18181b;border-bottom:0}.canc td{color:#a1a1aa;text-decoration:line-through}
h2{font-size:13px;margin:22px 0 6px}
.assin{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px}.assin div{border-top:1px solid #18181b;padding-top:4px;font-size:10.5px;color:#52525b}
.bar{max-width:1100px;margin:16px auto 0;display:flex;justify-content:flex-end;gap:8px}
.bar a,.bar button{font:600 13px Inter,sans-serif;padding:8px 14px;border-radius:7px;border:1px solid #18181b;background:#18181b;color:#fff;cursor:pointer;text-decoration:none}
.bar a{background:#fff;color:#18181b}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}.bar{display:none}@page{size:A4 landscape;margin:12mm}}
</style></head><body>
<div class="bar"><a href="/api/missoes/${mid}/transportadoras/${tid}/mapa.xlsx">Excel</a><button onclick="print()">Imprimir / PDF</button></div>
<div class="page">
  <div class="top"><div><h1>Mapa de viagens e custos — ${esc(t.nome)}</h1><div class="m">${esc(M.missao.nome)}</div></div><div class="r m">Emitido a ${dmy(M.hoje)}</div></div>
  <div class="kpi"><div><span>Viagens</span><b>${T.n}</b></div><div><span>Valor do transporte</span><b>${n2(T.valor)} MT</b></div><div><span>Notas de débito</span><b>${T.nd ? '−' + n2(T.nd) : '0,00'} MT</b></div><div><span>Pago</span><b>${n2(T.pago)} MT</b></div><div><span>Saldo a pagar</span><b>${n2(T.saldo)} MT</b></div></div>
  <table><thead><tr><th>Camião</th><th>Motorista</th><th>Saída</th><th>Destinos</th><th class="r">Valor (MT)</th><th class="r">N. débito</th><th class="r">Pago</th><th class="r">Saldo</th></tr></thead>
  <tbody>${linhas}</tbody><tfoot><tr><td colspan="4">Total · ${T.n} viagem(ns) · ${T.kits} kits</td><td class="r">${n2(T.valor)}</td><td class="r">${T.nd ? '−' + n2(T.nd) : '—'}</td><td class="r">${n2(T.pago)}</td><td class="r">${n2(T.saldo)}</td></tr></tfoot></table>
  ${notas.length ? `<h2>Notas de débito</h2><table><thead><tr><th>Nº</th><th>Data</th><th>Camião</th><th>Motivo</th><th>Artigos</th><th>Estado</th><th class="r">Valor</th></tr></thead><tbody>
    ${notas.map(n => `<tr><td>${esc(n.numero)}</td><td>${dmy(n.data)}</td><td>${esc(M.viagens.find(v => v.id === n.viagem_id)?.codigo || '')}</td><td>${esc(n.motivo_nome)}</td><td>${esc(n.linhas.map(l => `${l.quantidade} × ${l.artigo}`).join('; '))}${n.observacoes ? `<div class="m">${esc(n.observacoes)}</div>` : ''}</td><td>${esc(n.estado_nome)}</td><td class="r">${n2(n.valor)}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="assin"><div>Pela Adicional Logistics</div><div>Pela ${esc(t.nome)} (conferido)</div></div>
</div></body></html>`;
}

module.exports = { excel, html };
