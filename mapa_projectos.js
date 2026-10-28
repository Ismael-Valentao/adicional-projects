// Mapa de projectos: orçamento, gasto e margem de cada projecto (Excel + versão imprimível)
const ExcelJS = require('exceljs');
const L = require('./logic');

const MZN = '#,##0.00 "MT"';
const borda = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const dmy = s => (s ? s.split('-').reverse().join('/') : '—');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v, d = 2) => { const x = Number(v) || 0; const [i, f] = Math.abs(x).toFixed(d).split('.'); return (x < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + f : ''); };
const pct = v => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
const unidTxt = (p, v) => (p.unidade === 'kits' ? `${n(v, 0)} kits` : p.unidade === 'kg' ? `${n(v, 0)} kg` : `${n(v, 0)} destinos`);
const COR = { por_implementar: 'FFFFF7E0', em_curso: 'FFEFF5FF', concluido: 'FFECFDF3' };
const margem = p => ({ valor: p.receita - p.custos, pct: p.receita ? (p.receita - p.custos) / p.receita : null });

async function excel() {
  const P = await L.mapaProjectos();
  const hoje = L.hoje();
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const ws = wb.addWorksheet('Mapa de projectos');
  const cols = [
    ['nome', 'Projecto', 34], ['cliente', 'Cliente', 22], ['estado', 'Estado', 14], ['periodo', 'Período', 19], ['provincias', 'Províncias', 20],
    ['destinos', 'Destinos (entregues/total)', 13], ['exec', 'Execução', 9, '0%'], ['por_entregar', 'Por entregar', 16],
    ['orcamento', 'Orçamento', 16, MZN], ['gasto', 'Gasto', 16, MZN], ['margem', 'Margem', 16, MZN], ['margem_pct', 'Margem %', 10, '0.0%'],
    ['pago', 'Pago', 15, MZN], ['por_pagar', 'Por pagar', 15, MZN], ['obs', 'Observações', 30],
  ];
  ws.columns = cols.map(([key, , w]) => ({ key, width: w }));
  ws.addRow(['Mapa de projectos — orçamento, gasto e margem']).font = { bold: true, size: 14 };
  ws.addRow([`Adicional Logistics · ponto de situação a ${dmy(hoje)}`]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const h = ws.addRow(cols.map(c => c[1]));
  h.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF1F2937'); c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = borda; });
  h.height = 32;
  for (const p of P) {
    const m = margem(p);
    const r = ws.addRow({
      nome: p.nome, cliente: p.cliente, estado: p.estado_nome, periodo: `${dmy(p.inicio)} – ${dmy(p.fim)}`, provincias: p.provincias.join(', '),
      destinos: `${p.destinos_entregues} / ${p.destinos}`, exec: p.execucao, por_entregar: unidTxt(p, p.por_entregar_unid),
      orcamento: p.receita || null, gasto: p.custos, margem: p.receita ? m.valor : null, margem_pct: m.pct,
      pago: p.custos_pagos, por_pagar: p.custos_por_pagar, obs: !p.receita ? 'Orçamento por definir' : '',
    });
    r.eachCell({ includeEmpty: true }, (c, i) => { c.border = borda; const f = cols[i - 1]?.[3]; if (f) c.numFmt = f; c.alignment = { vertical: 'top', wrapText: true }; });
    r.getCell('estado').fill = fill(COR[p.estado]);
    if (p.receita && m.valor < 0) r.getCell('margem').font = { bold: true, color: { argb: 'FFC2261D' } };
  }
  const s = k => P.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const orc = s('receita'), gas = s('custos');
  const t = ws.addRow({ nome: `TOTAL · ${P.length} projecto(s)`, orcamento: orc, gasto: gas, margem: orc - gas, margem_pct: orc ? (orc - gas) / orc : null, pago: s('custos_pagos'), por_pagar: s('custos_por_pagar') });
  t.font = { bold: true }; t.eachCell({ includeEmpty: true }, (c, i) => { c.fill = fill('FFF3F4F6'); c.border = borda; const f = cols[i - 1]?.[3]; if (f && f !== '0%') c.numFmt = f; });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: h.number }];
  ws.addRow([]);
  ws.addRow(['Margem = orçamento − gasto registado (camiões, estivas e outros custos, menos notas de débito).']).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  return { buf: await wb.xlsx.writeBuffer(), hoje };
}

async function html() {
  const P = await L.mapaProjectos();
  const hoje = L.hoje();
  const s = k => P.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const orc = s('receita'), gas = s('custos');
  const grupos = [['em_curso', 'Em curso'], ['por_implementar', 'Por implementar'], ['concluido', 'Concluídos']];
  const linha = p => { const m = margem(p); return `<tr><td><b>${esc(p.nome)}</b><div class="m">${esc(p.cliente)}${p.provincias.length ? ' · ' + esc(p.provincias.join(', ')) : ''}</div></td>
    <td class="nw">${dmy(p.inicio)} – ${dmy(p.fim)}</td>
    <td><span class="est ${p.estado}">${esc(p.estado_nome)}</span><div class="bar"><i style="width:${Math.round(p.execucao * 100)}%"></i></div><div class="m">${Math.round(p.execucao * 100)}% · ${p.destinos_entregues}/${p.destinos} destinos</div></td>
    <td class="m2">Falta <b>${unidTxt(p, p.por_entregar_unid)}</b>${p.sem_data ? `<div class="m">${p.sem_data} sem data</div>` : ''}</td>
    <td class="r">${p.receita ? n(p.receita) : '<span class="m">por definir</span>'}</td><td class="r">${n(p.custos)}</td>
    <td class="r b ${p.receita && m.valor < 0 ? 'neg' : ''}">${p.receita ? n(m.valor) : '—'}</td><td class="r b ${p.receita && m.valor < 0 ? 'neg' : ''}">${pct(m.pct)}</td>
    <td class="r">${n(p.custos_por_pagar)}</td></tr>`; };
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Mapa de projectos — ${dmy(hoje)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} body{font:11.5px/1.45 Inter,system-ui,sans-serif;color:#18181b;margin:0;background:#f4f4f5}
.page{max-width:1180px;margin:24px auto;background:#fff;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:19px;margin:0} h2{font-size:12.5px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#52525b}
.m{color:#71717a;font-size:10.5px}.m2{font-size:11px}.r{text-align:right}.b{font-weight:700}.nw{white-space:nowrap}.neg{color:#c2261d}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:16px}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:8px}.kpi div{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}.kpi span{display:block;color:#71717a;font-size:10.5px}.kpi b{font-size:14px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;color:#52525b;border-bottom:1px solid #18181b;padding:6px}td{padding:7px 6px;border-bottom:1px solid #e4e4e7;vertical-align:top}
.est{display:inline-block;border-radius:5px;padding:1px 7px;font-size:10.5px;font-weight:600;border:1px solid}
.est.em_curso{background:#eff5ff;border-color:#c7dafe;color:#1d4ed8}.est.por_implementar{background:#fffaeb;border-color:#fde4a8;color:#b45309}.est.concluido{background:#ecfdf3;border-color:#bbf0cf;color:#15803d}
.bar{height:5px;background:#f4f4f5;border-radius:9px;margin:5px 0 2px;overflow:hidden;width:110px}.bar i{display:block;height:100%;background:#16a34a}
.nota{margin-top:14px;color:#71717a;font-size:10.5px}
.bar2{max-width:1180px;margin:16px auto 0;display:flex;justify-content:flex-end;gap:8px}
.bar2 a,.bar2 button{font:600 13px Inter,sans-serif;padding:8px 14px;border-radius:7px;border:1px solid #18181b;background:#18181b;color:#fff;cursor:pointer;text-decoration:none}.bar2 a{background:#fff;color:#18181b}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}.bar2{display:none}@page{size:A4 landscape;margin:11mm}}
</style></head><body>
<div class="bar2"><a href="/api/projectos/mapa.xlsx">Excel</a><button onclick="print()">Imprimir / PDF</button></div>
<div class="page">
  <div class="top"><div><h1>Mapa de projectos — orçamento, gasto e margem</h1><div class="m">Adicional Logistics · projectos de distribuição</div></div><div class="r m">Ponto de situação a ${dmy(hoje)}</div></div>
  <div class="kpi"><div><span>Projectos</span><b>${P.length}</b></div><div><span>Orçamento</span><b>${n(orc)} MT</b></div><div><span>Gasto</span><b>${n(gas)} MT</b></div>
    <div><span>Margem</span><b class="${orc - gas < 0 ? 'neg' : ''}">${n(orc - gas)} MT</b></div><div><span>Margem %</span><b class="${orc - gas < 0 ? 'neg' : ''}">${pct(orc ? (orc - gas) / orc : null)}</b></div></div>
  ${grupos.map(([k, t]) => { const L2 = P.filter(p => p.estado === k); return L2.length ? `<h2>${t} · ${L2.length}</h2><table><thead><tr><th>Projecto</th><th>Período</th><th>Execução</th><th>Por entregar</th><th class="r">Orçamento (MT)</th><th class="r">Gasto</th><th class="r">Margem</th><th class="r">Margem %</th><th class="r">Por pagar</th></tr></thead><tbody>${L2.map(linha).join('')}</tbody></table>` : ''; }).join('')}
  <div class="nota">Margem = orçamento − gasto registado (camiões, estivas e outros custos, menos notas de débito). Por pagar = custos ainda não pagos.</div>
</div></body></html>`;
}

module.exports = { excel, html };
