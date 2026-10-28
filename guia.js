// Guia de carga imprimível de um camião: o que carregar no armazém e o que descarregar em cada paragem
const L = require('./logic');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => { const [i, f] = Math.abs(Number(v) || 0).toFixed(v % 1 ? 2 : 0).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : ''); };
const dmy = s => (s ? s.split('-').reverse().join('/') : '—');
const kg = v => (v >= 1000 ? `${n(Math.round(v / 10) / 100)} t` : `${n(Math.round(v))} kg`);

// junta à lista de kits as linhas de artigos dos destinos (mesmo artigo+código somam)
function comItens(lista, destinos) {
  const m = new Map();
  for (const d of destinos) for (const i of d.itens || []) {
    const k = (i.codigo || '') + '|' + i.artigo;
    const x = m.get(k) || { categoria: i.categoria || 'Artigos', item: i.artigo, descricao: [i.codigo, i.fornecedor].filter(Boolean).join(' · '), embalagem: 'volumes', qtd: 0, peso_kg: 0 };
    x.qtd += i.volumes || 0; x.peso_kg += i.peso_kg || 0; m.set(k, x);
  }
  return { ...lista, itens: [...lista.itens, ...m.values()] };
}

function guiaHTML(mid, vid) {
  const M = L.carregarMissao(mid);
  const v = M?.viagens.find(x => x.id === Number(vid));
  if (!v) return null;
  const dMap = new Map(M.destinos.map(d => [d.id, d]));
  const stops = v.destinos.map(x => dMap.get(x.destino_id)).filter(Boolean);
  const total = comItens(L.listaCarga(M.kits, stops), stops);
  const pesoConhecido = total.itens.reduce((s, i) => s + (i.peso_kg || 0), 0);
  const semPeso = total.itens.filter(i => i.peso_kg == null).map(i => i.item);

  const linhasItens = total.itens.map(i => `<tr><td>${esc(i.categoria)}</td><td><b>${esc(i.item)}</b><div class="m">${esc(i.descricao)}</div></td><td>${esc(i.embalagem)}</td><td class="r b">${n(i.qtd)}</td><td class="r">${i.peso_kg == null ? '—' : kg(i.peso_kg)}</td><td class="chk"></td></tr>`).join('');
  const paragens = stops.map((d, k) => {
    const c = comItens(L.listaCarga(M.kits, [d]), [d]);
    return `<section class="stop"><div class="sh"><div><span class="nr">${k + 1}</span><b>${esc(d.comunidade)}</b> — ${esc(d.local_entrega || d.localidade || '')}</div>
      <div class="m">${esc(d.provincia)} · ${esc(d.distrito)} · ${esc(d.posto || '')} · previsto ${dmy(d.data_prevista)}</div></div>
      <div class="kits">${c.kits.baixa || c.kits.sequeiro ? `Kit Baixa: <b>${n(c.kits.baixa)}</b> &nbsp;·&nbsp; Kit Sequeiro: <b>${n(c.kits.sequeiro)}</b> &nbsp;·&nbsp; ` : `${(d.itens || []).length} artigo(s) · <b>${n(d.volumes || 0)}</b> volumes &nbsp;·&nbsp; `}≈ ${kg(d.peso_kg)}</div>
      ${c.itens.length ? `<table class="sm"><tbody>${c.itens.map(i => `<tr><td>${esc(i.item)} <span class="m">(${esc(i.embalagem)})</span></td><td class="r b">${n(i.qtd)}</td></tr>`).join('')}</tbody></table>` : '<p class="m">Sem kits indicados para este destino.</p>'}
      <div class="sig"><div>Recebido por (nome e cargo)</div><div>Assinatura / carimbo</div><div>Data e hora</div></div></section>`;
  }).join('');

  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Guia de carga ${esc(v.codigo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} body{font:12.5px/1.45 Inter,system-ui,sans-serif;color:#18181b;margin:0;background:#f4f4f5}
.page{max-width:900px;margin:24px auto;background:#fff;padding:36px 40px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0}.m{color:#71717a;font-size:11.5px}.r{text-align:right}.b{font-weight:700}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 18px;margin-bottom:18px}.grid span{display:block;color:#71717a;font-size:11px}.grid b{font-size:13px}
.plate{font-family:Consolas,monospace;border:1px solid #a1a1aa;border-radius:4px;padding:1px 6px}
h2{font-size:14px;margin:22px 0 8px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;color:#52525b;border-bottom:1px solid #18181b;padding:6px}td{padding:6px;border-bottom:1px solid #e4e4e7;vertical-align:top}
td.chk{width:40px;border:1px solid #d4d4d8}
.tot{display:flex;gap:28px;padding:10px 12px;background:#f4f4f5;border-radius:6px;margin-top:10px}
.stop{border:1px solid #d4d4d8;border-radius:8px;padding:12px 14px;margin-bottom:12px;break-inside:avoid}
.sh{margin-bottom:6px}.nr{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#18181b;color:#fff;font-size:11px;margin-right:8px}
.kits{margin:6px 0 8px}.stop table td{padding:3px 6px}
.sig{display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:16px;margin-top:22px}.sig div{border-top:1px solid #18181b;padding-top:4px;font-size:11px;color:#52525b}
.assin{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px}.assin div{border-top:1px solid #18181b;padding-top:4px;font-size:11px;color:#52525b}
.bar{max-width:900px;margin:16px auto 0;display:flex;justify-content:flex-end;gap:8px}
.bar button{font:600 13px Inter,sans-serif;padding:8px 14px;border-radius:7px;border:1px solid #18181b;background:#18181b;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}.bar{display:none}@page{size:A4;margin:14mm}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir</button></div>
<div class="page">
  <div class="top"><div><h1>Guia de carga — ${esc(v.codigo)}</h1><div class="m">${esc(M.missao.nome)}</div></div>
    <div class="r"><div class="m">Emitida em ${dmy(M.hoje)}</div><div class="m">Origem: <b>${esc(v.origem || '—')}</b></div></div></div>
  <div class="grid">
    <div><span>Transportadora</span><b>${esc(v.transportadora || '—')}</b></div>
    <div><span>Matrícula</span><b class="plate">${esc(v.matricula || '—')}</b>${v.matricula_reboque ? ` <b class="plate">${esc(v.matricula_reboque)}</b>` : ''}</div>
    <div><span>Motorista</span><b>${esc(v.motorista || '—')}</b></div>
    <div><span>Telefone</span><b>${esc(v.motorista_tel || '—')}</b></div>
    <div><span>Saída prevista</span><b>${dmy(v.data_saida_prevista)}</b></div>
    <div><span>Paragens</span><b>${stops.length}</b></div>
    <div><span>${v.kits_baixa || v.kits_sequeiro ? 'Kits' : 'Volumes'}</span><b>${v.kits_baixa || v.kits_sequeiro ? `${n(v.kits_baixa)} Baixa · ${n(v.kits_sequeiro)} Sequeiro` : `${n(v.volumes || 0)} volumes · ${n(v.artigos || 0)} linhas`}</b></div>
    <div><span>Peso estimado</span><b>≈ ${kg(pesoConhecido)}</b>${v.capacidade_t ? `<span>capacidade ${n(v.capacidade_t)} t</span>` : ''}</div>
  </div>
  <h2>1. Carregamento no armazém</h2>
  <table><thead><tr><th>Categoria</th><th>Artigo</th><th>Embalagem</th><th class="r">Quantidade</th><th class="r">Peso</th><th>Conf.</th></tr></thead><tbody>${linhasItens || '<tr><td colspan="6" class="m">Sem destinos.</td></tr>'}</tbody></table>
  <div class="tot"><div>${v.kits_baixa + v.kits_sequeiro ? `Total de kits: <b>${n(v.kits_baixa + v.kits_sequeiro)}</b>` : `Total de volumes: <b>${n(v.volumes || 0)}</b>`}</div><div>Peso estimado: <b>≈ ${kg(pesoConhecido)}</b></div>${semPeso.length ? `<div class="m">Sem peso na estimativa: ${esc([...new Set(semPeso)].join(', '))}</div>` : ''}</div>
  <div class="assin"><div>Fiel de armazém</div><div>Motorista</div><div>Responsável Adicional</div></div>
  <h2 style="margin-top:34px">2. Entregas por paragem</h2>
  ${paragens || '<p class="m">Sem destinos.</p>'}
</div></body></html>`;
}

// Nota de débito imprimível para enviar à transportadora
function ndHTML(mid, id) {
  const M = L.carregarMissao(mid);
  const nd = M?.notas.find(x => x.id === Number(id));
  if (!nd) return null;
  const v = M.viagens.find(x => x.id === nd.viagem_id);
  const d = M.destinos.find(x => x.id === nd.destino_id);
  const mt = x => `${n(Math.round((x || 0) * 100) / 100)} MT`;
  const linhas = nd.linhas.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.artigo)}</td><td class="r">${n(l.quantidade)}</td><td class="r">${mt(l.preco_unit)}</td><td class="r b">${mt(l.valor)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Nota de débito ${esc(nd.numero)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} body{font:12.5px/1.5 Inter,system-ui,sans-serif;color:#18181b;margin:0;background:#f4f4f5}
.page{max-width:860px;margin:24px auto;background:#fff;padding:40px 44px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0}.m{color:#71717a;font-size:11.5px}.r{text-align:right}.b{font-weight:700}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #18181b;padding-bottom:14px;margin-bottom:18px}
.est{display:inline-block;border:1px solid #a1a1aa;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.est.anulada{color:#b91c1c;border-color:#fca5a5}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px 20px;margin-bottom:20px}.grid span{display:block;color:#71717a;font-size:11px}.grid b{font-size:13px}
.plate{font-family:Consolas,monospace;border:1px solid #a1a1aa;border-radius:4px;padding:1px 6px}
table{width:100%;border-collapse:collapse;margin-top:6px}th{text-align:left;font-size:11px;color:#52525b;border-bottom:1px solid #18181b;padding:7px 6px}td{padding:7px 6px;border-bottom:1px solid #e4e4e7}
.tot{display:flex;justify-content:flex-end;gap:24px;padding:12px 6px;font-size:15px}
.obs{border:1px solid #e4e4e7;border-radius:6px;padding:10px 12px;min-height:60px;white-space:pre-wrap;margin-top:16px}
.assin{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:56px}.assin div{border-top:1px solid #18181b;padding-top:5px;font-size:11px;color:#52525b}
.bar{max-width:860px;margin:16px auto 0;display:flex;justify-content:flex-end}
.bar button{font:600 13px Inter,sans-serif;padding:8px 14px;border-radius:7px;border:1px solid #18181b;background:#18181b;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}.bar{display:none}@page{size:A4;margin:16mm}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir</button></div>
<div class="page">
  <div class="top"><div><h1>Nota de débito ${esc(nd.numero)}</h1><div class="m">${esc(M.missao.nome)}</div></div>
    <div class="r"><div>Data: <b>${dmy(nd.data)}</b></div><div style="margin-top:6px"><span class="est ${nd.estado}">${esc(nd.estado_nome)}</span></div></div></div>
  <div class="grid">
    <div><span>Transportadora</span><b>${esc(nd.transportadora || '—')}</b></div>
    <div><span>Camião</span><b>${esc(v?.codigo || '—')}</b> ${v?.matricula ? `<b class="plate">${esc(v.matricula)}</b>` : ''}</div>
    <div><span>Motorista</span><b>${esc(v?.motorista || '—')}</b></div>
    <div><span>Motivo</span><b>${esc(nd.motivo_nome)}</b></div>
    <div><span>Destino</span><b>${esc(d ? `${d.comunidade} (${d.distrito})` : '—')}</b></div>
    <div><span>Documento de suporte</span><b>${esc(nd.referencia || '—')}</b></div>
  </div>
  <table><thead><tr><th>#</th><th>Artigo / descrição</th><th class="r">Quantidade</th><th class="r">Valor unitário</th><th class="r">Valor</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="5" class="m">Sem linhas.</td></tr>'}</tbody></table>
  <div class="tot"><span>Total a debitar</span><b>${mt(nd.valor)}</b></div>
  <div class="m">O valor acima será descontado no pagamento do serviço de transporte.</div>
  <div class="obs"><div class="m" style="margin-bottom:4px">Observações</div>${esc(nd.observacoes || '')}</div>
  <div class="assin"><div>Pela Adicional Logistics</div><div>Pela transportadora (tomei conhecimento)</div></div>
</div></body></html>`;
}

module.exports = { guiaHTML, ndHTML };
