/* Controlo de Distribuição — frontend */
'use strict';

// ============================================================ utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => {
  const n = Number(v) || 0, [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 && Number(i + (f || '')) ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : '');
};
const mt = v => (v == null || isNaN(v) ? '—' : `${nf(Math.round(v))} MT`);
const mt2 = v => (v == null || isNaN(v) ? '—' : `${nf(v, 2)} MT`);
const pc = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const compact = v => { const a = Math.abs(v); return a >= 1e6 ? `${nf(v / 1e6, 1)} M` : a >= 1e3 ? `${nf(v / 1e3, a >= 1e5 ? 0 : 1)} mil` : nf(v); };
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dt = s => new Date(s + 'T00:00:00Z');
const dm = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
const dLong = s => { if (!s) return '—'; const d = dt(s); return `${DS[d.getUTCDay()]}, ${d.getUTCDate()} ${MS[d.getUTCMonth()]}`; };
const dFull = s => { if (!s) return '—'; const d = dt(s); return `${d.getUTCDate()} ${MS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const addDias = (s, n) => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isWE = s => [0, 6].includes(dt(s).getUTCDay());
const range = (a, b) => { const o = []; for (let d = a; d <= b; d = addDias(d, 1)) o.push(d); return o; };
const peso = kg => (kg >= 1000 ? `${nf(kg / 1000, 1)} t` : `${nf(Math.round(kg))} kg`);
// pesquisa: ignora acentos e maiúsculas; várias palavras = todas têm de aparecer
const norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const casa = (texto, q) => { const n = norm(texto); return norm(q).split(/\s+/).filter(Boolean).every(p => n.includes(p)); };
const pesquisa = (id, ph, extra = '') => `<div class="search" ${extra}>${ic('search', 'sm')}<input class="input" type="search" data-pesq="${id}" placeholder="${esc(ph)}" value="${esc(S.pesq[id] || '')}" autocomplete="off"></div><span class="muted sm nowrap" data-pesq-conta="${id}"></span>`;
function aplicarPesquisa(id) {
  const q = S.pesq[id] || '';
  $$(`[data-pesq-tabela="${id}"]`).forEach(tb => {
    const linhas = $$(':scope > tbody > tr', tb);
    let total = 0, vis = 0, grupo = null, grupoVis = false;
    const fechaGrupo = () => { if (grupo) grupo.hidden = !grupoVis; };
    for (const tr of linhas) {
      if (tr.classList.contains('group')) { fechaGrupo(); grupo = tr; grupoVis = false; continue; }
      if (tr.classList.contains('sem-res')) continue;
      total++;
      const ok = !q || casa(tr.textContent + ' ' + (tr.dataset.extra || ''), q);
      tr.hidden = !ok; if (ok) { vis++; grupoVis = true; }
    }
    fechaGrupo();
    let vazio = $(':scope > tbody > tr.sem-res', tb);
    if (!vis && total) {
      if (!vazio) { vazio = document.createElement('tr'); vazio.className = 'sem-res'; vazio.innerHTML = `<td colspan="99"><div class="empty sm">Nada encontrado para “${esc(q)}”.</div></td>`; $('tbody', tb).append(vazio); }
    } else vazio?.remove();
    $$(`[data-pesq-conta="${id}"]`).forEach(c => (c.textContent = q ? `${vis} de ${total}` : ''));
  });
}
// tipo de kit do destino: Baixa (regadio) e/ou Sequeiro
const kitTag = (d, curto) => {
  const b = d.benef_baixa || 0, q = d.benef_sequeiro || 0;
  if (!b && !q) return d.itens?.length ? `<span class="kit" style="border-color:var(--line);background:var(--gray-soft);color:var(--text-2)" title="${esc(d.itens.map(i => `${nf(i.volumes, i.volumes % 1 ? 1 : 0)} × ${i.artigo}`).join('\n'))}">${d.itens.length} art. · ${nf(d.volumes, d.volumes % 1 ? 1 : 0)} vol${curto ? '' : ' · ' + peso(d.peso_itens)}</span>` : '<span class="muted">—</span>';
  const t = (cls, nome, n) => `<span class="kit ${cls}" title="${n} kit(s) ${nome}">${curto ? nome[0] : nome} ${nf(n)}</span>`;
  return `<span class="kits">${b ? t('kb', 'Baixa', b) : ''}${q ? t('ks', 'Sequeiro', q) : ''}</span>`;
};
const kitTexto = d => [d.benef_baixa ? `Baixa ${d.benef_baixa}` : '', d.benef_sequeiro ? `Sequeiro ${d.benef_sequeiro}` : ''].filter(Boolean).join(' + ') || (d.itens?.length ? `${d.itens.length} artigos · ${nf(d.volumes || 0)} volumes · ${d.itens.map(i => i.artigo).join(', ')}` : '—');
const semKits = () => !S.d?.kits?.itens?.length && S.d?.destinos.some(d => d.itens?.length);
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// ícones (traço 24×24, estilo Lucide)
const P = {
  overview: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  board: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkc: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  trend: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  cal2: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  filemin: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const badge = (t, n = 'neutro', extra = '') => `<span class="badge b-${n} ${extra}">${esc(t)}</span>`;
const plate = m => (m ? `<span class="plate">${esc(m)}</span>` : '<span class="plate none">sem matrícula</span>');
const NIVEL_VIAGEM = { planeada: 'neutro', carregada: 'violet', em_transito: 'info', concluida: 'ok', cancelada: 'critico' };

// ============================================================ estado e API
const S = {
  missoes: [], missao: null, meta: null, d: null, p: null, f: null, transp: [],
  page: (location.hash.slice(1) in { overview: 1, planeamento: 1, cronograma: 1, destinos: 1, camioes: 1, financeiro: 1, custos: 1, transportadoras: 1, kits: 1, notas: 1, projectos: 1, utilizadores: 1 } && location.hash.slice(1)) || localStorage.getItem('pagina') || 'overview',
  fDest: { q: '', vista: 'todos', provincia: '', distrito: '', data: '' }, fCam: { q: '', estado: '' }, fBoard: { provincia: '' }, fCrono: { provincia: '' },
  pesq: {}, sel: new Set(), bsel: new Set(), orcEdit: false, versao: 0, stale: false, atualizado: Date.now(),
};
async function api(url, opt = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/api/auth/')) { location.href = '/login.html?voltar=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(j.erro || r.statusText);
  return j;
}
function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.innerHTML = `${ic(err ? 'alert' : 'checkc')}<span>${esc(msg)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

async function boot() {
  S.eu = (await api('/api/auth/eu')).utilizador;
  aplicarTema();
  S.meta = await api('/api/meta');
  S.missoes = await api('/api/missoes');
  const g = localStorage.getItem('missao');
  S.missao = (S.missoes.find(m => String(m.id) === g) || S.missoes[0])?.id;
  await load();
  if (S.eu?.mudar_senha) mudarSenha(true);
  setInterval(poll, 8000);
  setInterval(() => { const el = $('#live'); if (el) el.textContent = haQuanto(); }, 5000);
}
async function load() {
  const id = S.missao;
  const [d, p, f, transp, v, proj] = await Promise.all([
    api(`/api/missoes/${id}/tudo`), api(`/api/missoes/${id}/painel`), api(`/api/missoes/${id}/financeiro`), api('/api/transportadoras'), api('/api/versao'), api('/api/projectos'),
  ]);
  Object.assign(S, { d, p, f, transp, proj, versao: v.versao, stale: false, atualizado: Date.now(), kitsInfo: null });
  S.dMap = new Map(d.destinos.map(x => [x.id, x]));
  S.vMap = new Map(d.viagens.map(x => [x.id, x]));
  render();
}
async function poll() {
  try {
    const { versao } = await api('/api/versao');
    if (versao === S.versao) return;
    if ($('.drawer') || $('.dialog') || document.activeElement?.matches('input,textarea,select')) { S.stale = true; return; }
    await load();
  } catch { /* servidor indisponível: tenta de novo */ }
}
function haQuanto() {
  const s = Math.round((Date.now() - S.atualizado) / 1000);
  return s < 10 ? 'Actualizado agora' : s < 60 ? `Actualizado há ${s}s` : `Actualizado há ${Math.round(s / 60)} min`;
}
async function mutate(fn, msg) {
  try { const r = await fn(); if (msg) toast(msg); await load(); return r; }
  catch (e) { toast(e.message, true); throw e; }
}

// ============================================================ shell
const NAV = [
  ['overview', 'Visão geral', 'overview'], ['planeamento', 'Planeamento', 'board'], ['cronograma', 'Cronograma', 'calendar'],
  ['destinos', 'Destinos', 'pin'], ['camioes', 'Camiões', 'truck'],
  ['financeiro', 'Orçamento e custos', 'chart'], ['custos', 'Custos', 'receipt'], ['notas', 'Notas de débito', 'filemin'], ['transportadoras', 'Transportadoras', 'building'], ['kits', 'Kits de insumos', 'package'],
];
function render() {
  const sy = window.scrollY;
  const K = S.p.kpis, F = S.f;
  const cnt = {
    destinos: K.atrasados ? `<span class="cnt red">${K.atrasados}</span>` : `<span class="cnt">${K.destinos}</span>`,
    planeamento: K.sem_camiao ? `<span class="cnt">${K.sem_camiao}</span>` : '',
    camioes: `<span class="cnt">${K.viagens}</span>`,
    notas: S.d.notas?.filter(n => n.estado === 'contestada').length ? `<span class="cnt red">${S.d.notas.filter(n => n.estado === 'contestada').length}</span>` : (S.d.notas?.length ? `<span class="cnt">${S.d.notas.length}</span>` : ''),
    financeiro: F.alertas.some(a => a.nivel === 'critico') ? `<span class="cnt red">!</span>` : '',
  };
  const semKits = !S.d.kits?.itens?.length && S.d.destinos.some(d => d.itens?.length);
  const navItem = ([k, t0, i]) => { const t = k === 'kits' && semKits ? 'Artigos a entregar' : t0; return `<a class="${S.page === k ? 'on' : ''}" data-act="nav" data-k="${k}">${ic(i)}<span>${t}</span>${cnt[k] || ''}</a>`; };
  $('#app').innerHTML = `<div class="app">
    <aside class="side">
      <div class="brand"><div class="brand-mark">${ic('truck')}</div><div><b>Distribuição</b><span>Controlo de Projectos</span></div></div>
      <div class="mission"><select id="selMissao" aria-label="Projecto">${S.missoes.map(m => `<option value="${m.id}" ${m.id == S.missao ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}<option value="__nova">+ Novo projecto</option></select>${ic('chev', 'sm')}</div>
      <nav class="nav">
        <a class="${S.page === 'projectos' ? 'on' : ''}" data-act="nav" data-k="projectos">${ic('chart')}<span>Todos os projectos</span><span class="cnt">${S.proj?.length || ''}</span></a>
        <div class="nav-label">Operação</div>${NAV.slice(0, 5).map(navItem).join('')}
        <div class="nav-label">Finanças</div>${NAV.slice(5, 8).map(navItem).join('')}
        <div class="nav-label">Cadastros</div>${NAV.slice(8).map(navItem).join('')}${S.eu?.perfil === 'superadmin' ? `<a class="${S.page === 'utilizadores' ? 'on' : ''}" data-act="nav" data-k="utilizadores">${ic('users')}<span>Utilizadores</span></a>` : ''}
      </nav>
      <div class="side-foot">
        <div class="today">${ic('calendar', 'sm')} Hoje, ${dLong(S.d.hoje)}</div>
        <div class="today"><span class="live" id="live">${haQuanto()}</span></div>
        <a class="btn btn-block" href="/api/missoes/${S.missao}/export.xlsx">${ic('download')} Exportar Excel</a>
        <button class="btn btn-ghost btn-block" data-act="missao">${ic('settings')} Definições do projecto</button>
        <div class="conta">
          <button class="conta-btn" data-act="conta-menu" title="Conta, tema e sair"><span class="avatar">${esc((S.eu?.nome || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase())}</span><span class="conta-n"><b>${esc(S.eu?.nome || '')}</b><small>${esc(S.eu?.perfil === 'superadmin' ? 'Superadmin' : 'Utilizador')}</small></span>${ic('chev', 'sm')}</button>
        </div>
      </div>
    </aside>
    <main class="main" id="page"></main></div>`;
  $('#selMissao').onchange = e => {
    if (e.target.value === '__nova') { e.target.value = S.missao; return drawerMissao(null); }
    S.missao = e.target.value; localStorage.setItem('missao', S.missao); S.sel.clear(); S.bsel.clear(); load();
  };
  renderPage();
  window.scrollTo(0, sy);
}
function renderPage() {
  const el = $('#page');
  const sc = el.scrollTop;
  const fn = PAGES[S.page] || PAGES.overview;
  el.innerHTML = fn();
  el.scrollTop = sc;
  AFTER[S.page]?.();
  $$('[data-pesq]').forEach(i => aplicarPesquisa(i.dataset.pesq));
  renderSelbar();
}
const head = (t, sub, actions = '') => `<header class="page-head"><div><h1>${t}</h1><div class="sub">${sub}</div></div><div class="actions">${actions}</div></header>`;
const periodo = () => { const ds = S.d.destinos.map(x => x.data_prevista).filter(Boolean).sort(); return ds.length ? `${dm(ds[0])} – ${dm(ds.at(-1))}` : 'sem datas'; };

// ============================================================ Visão geral
function pgOverview() {
  const K = S.p.kpis, F = S.f, D = S.d.destinos;
  const pct = K.destinos ? K.entregues / K.destinos : 0;
  const benefPct = K.benef_total ? K.benef_atendidos / K.benef_total : 0;
  const att = atencao();
  const H = S.d.hoje;
  const dias = [H, addDias(H, 1), addDias(H, 2), addDias(H, 3)];
  const agenda = dias.map((dia, i) => {
    const ds = D.filter(x => x.data_prevista === dia && x.estado !== 'cancelado');
    const saidas = S.d.viagens.filter(v => v.data_saida_prevista === dia && ['planeada', 'carregada'].includes(v.estado));
    return `<div class="day ${i === 0 ? 'today' : ''}"><h4><span>${i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : dLong(dia)}</span><em>${ds.length} entregas</em></h4>
      ${saidas.map(v => `<div class="it" data-act="camiao" data-id="${v.id}">${ic('truck', 'sm')}<span>Sai ${esc(v.codigo)} ${esc(v.matricula || '')}</span></div>`).join('')}
      ${ds.slice(0, 7).map(x => `<div class="it" data-act="destino" data-id="${x.id}"><i class="dot d-${x.nivel}"></i><span>${esc(x.comunidade)} <span class="muted">· ${esc(x.distrito)} · ${esc(kitTexto(x))}</span></span></div>`).join('')}
      ${ds.length > 7 ? `<div class="it muted" data-act="nav" data-k="planeamento"><span>+ ${ds.length - 7} mais</span></div>` : ''}
      ${!ds.length && !saidas.length ? '<div class="muted sm">Nada previsto</div>' : ''}</div>`;
  }).join('');
  const maxCat = Math.max(1, ...S.p.porCategoria.map(x => x.valor));
  return head('Visão geral', `${esc(S.d.missao.nome)} · ${periodo()}`,
    `<button class="btn" data-act="nav" data-k="planeamento">${ic('board')} Planeamento</button><button class="btn btn-primary" data-act="camiao-novo">${ic('plus')} Novo camião</button>`) + `
  <div class="page-body">
    <section class="metrics m5">
      <div class="metric"><div class="l">Entregas concluídas</div><div class="v">${K.entregues}<small>/ ${K.destinos}</small></div>
        <div class="bar"><i style="width:${pct * 100}%;background:var(--green-solid)"></i><i style="width:${K.destinos ? K.em_transito / K.destinos * 100 : 0}%;background:#60a5fa"></i></div>
        <div class="s"><span><b>${K.no_prazo}</b> no prazo</span><span><b>${K.em_transito}</b> em trânsito</span></div></div>
      <div class="metric"><div class="l">Beneficiários atendidos</div><div class="v">${nf(K.benef_atendidos)}<small>/ ${nf(K.benef_total)}</small></div>
        <div class="bar"><i style="width:${benefPct * 100}%;background:var(--green-solid)"></i></div><div class="s">${pc(benefPct, 0)} do total previsto</div></div>
      <div class="metric"><div class="l">Atrasos e riscos</div><div class="v ${K.atrasados ? 'neg' : ''}">${K.atrasados}<small>atrasados</small></div>
        <div class="s"><span><b>${K.sem_camiao}</b> destinos sem camião</span><span><b>${K.criticos}</b> críticos</span></div></div>
      <div class="metric"><div class="l">Gasto até agora</div><div class="v">${mt(F.gasto)}</div>
        ${F.receita ? `<div class="bar"><i style="width:${Math.min(100, F.gasto / F.receita * 100)}%;background:${F.gasto > F.receita ? 'var(--red-solid)' : 'var(--primary)'}"></i></div><div class="s"><span><b>${pc(F.gasto / F.receita)}</b> da receita</span></div>` : ''}</div>
      <div class="metric"><div class="l">Margem</div>
        ${F.receita ? `<div class="v ${F.saldo < 0 ? 'neg' : 'pos'}">${mt(F.saldo)}</div><div class="s"><span><b>${pc(F.saldo_pct)}</b> do orçamento de ${mt(F.receita)}</span></div>`
        : `<div class="v muted">—</div><div class="s"><a href="#" data-act="missao">Definir orçamento do projecto</a></div>`}</div>
    </section>
    <div class="layout-2">
      <div class="stack">
        <section class="panel"><div class="panel-head"><h2>Requer atenção <span class="c">${att.length}</span></h2>${att.length > 8 ? `<button class="btn btn-ghost btn-sm" data-act="ver-atrasos">Ver todos ${ic('right', 'sm')}</button>` : ''}</div>
          <div class="panel-body flush"><div class="rows">${att.length ? att.slice(0, 8).map(a => `
            <div class="row"><div class="ico-box ${a.cor}">${ic(a.ic)}</div><div class="main-c"><div class="t">${a.t}</div><div class="m">${a.m}</div></div>${a.acao}</div>`).join('')
            : `<div class="empty sm"><div class="ico-box green">${ic('check')}</div><b>Tudo em dia</b>Nenhum atraso ou pendência crítica.</div>`}</div></div></section>
        <section class="panel"><div class="panel-head"><h2>Próximos dias</h2><span class="hint">entregas previstas e saídas de camiões</span></div><div class="agenda">${agenda}</div></section>
      </div>
      <div class="stack">
        <section class="panel"><div class="panel-head"><h2>Onde está a ir o dinheiro</h2><span class="hint">${mt(F.gasto)}</span></div><div class="panel-body">
          ${S.p.porCategoria.length ? S.p.porCategoria.map(x => `<div class="hbar"><span class="n">${esc(x.nome)}</span><span class="v">${mt(x.valor)}</span><span class="track"><i style="width:${x.valor / maxCat * 100}%"></i></span></div>`).join('') : '<div class="muted sm">Ainda sem custos registados.</div>'}
          <div class="legend" style="justify-content:space-between"><span>Pago <b class="num">${mt(F.pago)}</b></span><span>Por pagar <b class="num">${mt(F.por_pagar)}</b></span></div></div></section>
        <section class="panel"><div class="panel-head"><h2>Progresso por província</h2></div><div class="panel-body">
          ${S.p.porProvincia.map(x => `<div class="hbar"><span class="n">${esc(x.nome)} <span class="muted">· ${x.destinos} destinos</span></span><span class="v">${x.entregues}/${x.destinos}</span><span class="track"><i style="width:${x.destinos ? x.entregues / x.destinos * 100 : 0}%;background:var(--green-solid)"></i></span></div>`).join('')}
        </div></section>
      </div>
    </div>
  </div>`;
}
function atencao() {
  const out = [];
  const H = S.d.hoje;
  const semCam = {};
  for (const d of S.d.destinos) {
    if (['entregue', 'parcial', 'cancelado'].includes(d.estado) || d.viagens.length || !d.data_prevista || d.data_prevista < H || d.data_prevista > addDias(H, 2)) continue;
    (semCam[`${d.data_prevista}|${d.distrito}`] ||= []).push(d);
  }
  for (const [k, L] of Object.entries(semCam).sort()) {
    const [dia, dist] = k.split('|');
    out.push({ ord: 1, cor: 'amber', ic: 'truck', t: `${esc(dist)} — ${L.length} destino(s) sem camião`, m: `Entrega ${dLong(dia)} · ${nf(sum(L, x => x.benef_total))} benef. · ${esc(L.map(x => x.comunidade).join(', '))}`,
      acao: `<button class="btn btn-sm" data-act="nav" data-k="planeamento">Planear</button>` });
  }
  for (const d of S.d.destinos) {
    if (['entregue', 'cancelado'].includes(d.estado)) continue;
    if (d.data_prevista && d.data_prevista < H)
      out.push({ ord: 0, cor: 'red', ic: 'clock', t: `${esc(d.comunidade)} — atrasado ${(dt(H) - dt(d.data_prevista)) / 864e5} dia(s)`, m: `${esc(d.distrito)} · previsto ${dLong(d.data_prevista)} · ${d.viagens.length ? 'camião ' + esc(d.matriculas || '') : 'sem camião'}`,
        acao: `<div class="input-group" style="flex:none"><button class="btn btn-sm" data-act="reprogramar" data-id="${d.id}">Reprogramar</button><button class="btn btn-sm" data-act="entregue" data-id="${d.id}">${ic('check', 'sm')} Entregue</button></div>` });
    else if (!d.viagens.length && d.data_prevista && d.data_prevista <= addDias(H, 2)) continue;
    else if (d.nivel === 'critico')
      out.push({ ord: 1, cor: 'amber', ic: 'alert', t: `${esc(d.comunidade)} — ${esc(d.situacao)}`, m: `${esc(d.distrito)} · previsto ${dLong(d.data_prevista)}`, acao: `<button class="btn btn-sm" data-act="destino" data-id="${d.id}">Abrir</button>` });
  }
  const vistos = new Set();
  for (const a of S.p.alertasViagem) {
    if (vistos.has(a.viagem + a.texto)) continue; vistos.add(a.viagem + a.texto);
    out.push({ ord: 2, cor: 'blue', ic: 'truck', t: `${esc(a.codigo)} — ${esc(a.texto)}`, m: 'Dados do camião incompletos ou inconsistentes', acao: `<button class="btn btn-sm" data-act="camiao" data-id="${a.viagem}">Abrir</button>` });
  }
  for (const a of S.f.alertas.filter(a => a.nivel === 'critico'))
    out.push({ ord: 1, cor: 'red', ic: 'wallet', t: esc(a.texto), m: 'Orçamento e margem', acao: `<button class="btn btn-sm" data-act="nav" data-k="financeiro">Ver</button>` });
  return out.sort((a, b) => a.ord - b.ord);
}

// ============================================================ Planeamento (quadro por dia)
function colunasDatas() {
  const D = S.d.destinos;
  const ds = [...D.map(x => x.data_prevista), S.d.hoje].filter(Boolean).sort();
  return range(ds[0], ds.at(-1));
}
function diaDaViagem(v) {
  const ds = v.destinos.map(x => S.dMap.get(x.destino_id)?.data_prevista).filter(Boolean).sort();
  return ds[0] || v.data_saida_prevista || null;
}
function pgPlaneamento() {
  const fp = S.fBoard.provincia;
  const provs = [...new Set(S.d.destinos.map(d => d.provincia))];
  const okProv = d => !fp || d.provincia === fp;
  const viagens = S.d.viagens.filter(v => v.estado !== 'cancelada' && (!fp || v.destinos.some(x => okProv(S.dMap.get(x.destino_id)))));
  const datas = colunasDatas();
  const semData = S.d.destinos.filter(d => !d.data_prevista && okProv(d) && d.estado !== 'cancelado');
  const cols = datas.map(dia => coluna(dia, viagens.filter(v => diaDaViagem(v) === dia), S.d.destinos.filter(d => d.data_prevista === dia && okProv(d) && d.estado !== 'cancelado')));
  if (semData.length) cols.push(coluna(null, viagens.filter(v => !diaDaViagem(v)), semData));
  return head('Planeamento', 'Arraste destinos por atribuir para um camião, ou seleccione-os e crie um camião novo.',
    `<div class="seg">${['', ...provs].map(p => `<button class="${fp === p ? 'on' : ''}" data-act="fboard" data-v="${esc(p)}">${p || 'Todas'}</button>`).join('')}</div>
     <button class="btn btn-primary" data-act="camiao-novo">${ic('plus')} Novo camião</button>`) +
    `<div class="page-body"><div class="board">${cols.join('')}</div></div>`;
}
function coluna(dia, viagens, destinos) {
  const H = S.d.hoje;
  const livres = destinos.filter(d => !d.viagens.length && d.estado !== 'entregue' && d.estado !== 'parcial');
  const benef = sum(destinos, d => d.benef_total);
  const entregues = destinos.filter(d => d.estado === 'entregue' || d.estado === 'parcial').length;
  const tag = dia === H ? '<span class="tag">Hoje</span>' : dia && isWE(dia) ? '<span class="tag we">Fim de semana</span>' : '';
  return `<section class="col ${dia === H ? 'today' : ''} ${dia && dia < H ? 'past' : ''}">
    <div class="col-head"><div><div class="d">${dia ? dLong(dia) : 'Sem data'}</div><div class="s">${destinos.length} destinos${destinos.length ? ' · ' + kitTexto({ benef_baixa: sum(destinos, d => d.benef_baixa), benef_sequeiro: sum(destinos, d => d.benef_sequeiro) }) : ''}${entregues ? ` · ${entregues} entregues` : ''}</div></div>${tag}</div>
    <div class="col-body">
      ${viagens.map(cartaoCamiao).join('')}
      ${[...new Set(livres.map(d => d.provincia))].map(prov => {
        const L = livres.filter(d => d.provincia === prov);
        const ns = L.filter(d => S.bsel.has(d.id)).length;
        return `<div class="col-sec"><span>${esc(prov)} · por atribuir ${L.length}</span><span>${kitTexto({ benef_baixa: sum(L, d => d.benef_baixa), benef_sequeiro: sum(L, d => d.benef_sequeiro) })}</span></div>
        <div class="pend">${L.map(d => `<div class="pend-it" draggable="true" data-drag="${d.id}">
          <input type="checkbox" data-bsel="${d.id}" ${S.bsel.has(d.id) ? 'checked' : ''} aria-label="Seleccionar">
          <div class="nm" data-act="destino" data-id="${d.id}"><b>${esc(d.comunidade)}</b><span>${esc(d.distrito)} · ${esc(d.local_entrega || d.localidade || '')}</span></div>
          <span class="bn">${kitTag(d, true)}</span></div>`).join('')}
          <div class="pend-actions"><button class="btn btn-sm btn-primary" style="flex:1" data-act="camiao-coluna" data-dia="${dia || ''}" data-prov="${esc(prov)}">${ic('truck', 'sm')} Criar camião ${ns ? `com ${ns} seleccionado(s)` : `com ${L.length}`}</button>
          ${S.d.viagens.some(v => !['concluida', 'cancelada'].includes(v.estado)) ? `<button class="btn btn-sm btn-icon" data-act="atribuir-coluna" data-dia="${dia || ''}" data-prov="${esc(prov)}" title="Atribuir a camião existente">${ic('link', 'sm')}</button>` : ''}</div></div>`;
      }).join('')}
      ${!viagens.length && !livres.length ? `<div class="col-empty">${destinos.length ? 'Todos os destinos atribuídos' : 'Sem entregas previstas'}</div>` : ''}
    </div></section>`;
}
function cartaoCamiao(v) {
  const stops = v.destinos.map(x => S.dMap.get(x.destino_id)).filter(Boolean);
  return `<article class="truck" data-drop="${v.id}" data-act="camiao" data-id="${v.id}">
    <div class="truck-h"><div><div class="code">${esc(v.codigo)} ${plate(v.matricula)}</div><div class="who">${esc(v.transportadora || 'Sem transportadora')}${v.motorista ? ' · ' + esc(v.motorista) : ''}</div></div>${badge(v.estado_nome, NIVEL_VIAGEM[v.estado])}</div>
    <div class="stops">${stops.map(d => `<div class="stop"><i class="dot d-${d.nivel}"></i><span class="nm">${esc(d.comunidade)}</span><span class="x">${d.data_prevista !== diaDaViagem(v) ? dm(d.data_prevista) + ' · ' : ''}${kitTag(d, true)}</span></div>`).join('') || '<div class="muted sm">Sem destinos — arraste para aqui</div>'}</div>
    <div class="truck-f"><span>Saída ${v.data_saida ? dm(v.data_saida) : dm(v.data_saida_prevista)} · ≈ ${peso(v.peso_kg)}${v.capacidade_t && v.peso_kg > v.capacidade_t * 1000 ? ' <b class="neg">excede</b>' : ''}</span><b class="num">${v.custo_transporte ? mt(v.custo_transporte) : 'sem preço'}</b></div></article>`;
}
AFTER_planeamento = () => {
  const page = $('#page');
  if (page._dnd) return; page._dnd = true;
  page.addEventListener('dragstart', e => {
    const it = e.target.closest('[data-drag]'); if (!it) return;
    const id = Number(it.dataset.drag);
    const ids = S.bsel.has(id) ? [...S.bsel] : [id];
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
    it.classList.add('dragging');
  });
  page.addEventListener('dragend', e => e.target.closest?.('[data-drag]')?.classList.remove('dragging'));
  page.addEventListener('dragover', e => { const t = e.target.closest('[data-drop]'); if (!t) return; e.preventDefault(); $$('.truck.drop').forEach(x => x !== t && x.classList.remove('drop')); t.classList.add('drop'); });
  page.addEventListener('dragleave', e => { const t = e.target.closest('[data-drop]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop'); });
  page.addEventListener('drop', e => {
    const t = e.target.closest('[data-drop]'); if (!t) return;
    e.preventDefault(); t.classList.remove('drop');
    let ids; try { ids = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    atribuir(Number(t.dataset.drop), ids);
  });
};
async function atribuir(vid, ids) {
  const v = S.vMap.get(vid);
  const novos = ids.filter(id => !v.destinos.some(x => x.destino_id === id));
  if (!novos.length) return;
  await mutate(() => api(`/api/viagens/${vid}`, { method: 'PUT', body: { destinos: [...v.destinos, ...novos.map(id => ({ destino_id: id, preco: 0 }))] } }),
    `${novos.length} destino(s) atribuído(s) a ${v.codigo}`);
  ids.forEach(id => { S.bsel.delete(id); S.sel.delete(id); });
  if (v.modo_preco === 'por_destino') toast(`Defina o preço dos novos destinos em ${v.codigo}`);
}

// ============================================================ Cronograma
function pgCronograma() {
  const fp = S.fCrono.provincia, H = S.d.hoje;
  const provs = [...new Set(S.d.destinos.map(d => d.provincia))];
  const D = S.d.destinos.filter(d => !fp || d.provincia === fp);
  const ds = [...S.d.destinos.flatMap(d => [d.data_prevista, d.data_entrega]), H].filter(Boolean).sort();
  const dias = range(ds[0], ds.at(-1));
  let prov = '';
  const rows = D.map(d => {
    let g = '';
    if (d.provincia !== prov) { prov = d.provincia; const n = D.filter(x => x.provincia === prov); g = `<tr class="group"><td class="stk c0">${esc(prov)}</td><td class="stk c1">${n.length} destinos · ${kitTexto({ benef_baixa: sum(n, x => x.benef_baixa), benef_sequeiro: sum(n, x => x.benef_sequeiro) })}</td><td colspan="${dias.length + 3}"></td></tr>`; }
    const cams = d.viagens.map(id => S.vMap.get(id)?.codigo).filter(Boolean).join(' ');
    return g + `<tr class="click" data-act="destino" data-id="${d.id}" data-extra="${esc([d.provincia, d.localidade, d.estado_nome, d.matriculas, kitTexto(d), dm(d.data_prevista), dLong(d.data_prevista), d.data_entrega ? 'entregue ' + dm(d.data_entrega) : ''].join(' '))}">
      <td class="stk c0">${esc(d.distrito)}</td>
      <td class="stk c1"><b>${esc(d.comunidade)}</b> <span class="muted sm">${esc(d.posto || '')}</span></td>
      <td class="nowrap">${kitTag(d, true)}</td>
      ${dias.map(dia => {
        let c = '';
        const late = d.data_prevista && d.data_prevista < H && !['entregue', 'parcial'].includes(d.estado);
        if (dia === d.data_prevista && !(d.data_entrega && d.data_entrega !== dia && ['entregue', 'parcial'].includes(d.estado)) || dia === d.data_prevista && !d.data_entrega)
          c = `<div class="cell plan ${late ? 'late' : !cams ? 'free' : ''}" title="${cams ? 'Camião ' + esc(cams) : 'Sem camião'}">${esc(cams.split(' ')[0] || '—')}</div>`;
        if (dia === d.data_entrega && ['entregue', 'parcial'].includes(d.estado))
          c = `<div class="cell done ${d.data_prevista && dia > d.data_prevista ? 'late' : ''}" title="Entregue ${dFull(dia)}">${ic('check', 'sm')}</div>`;
        return `<td class="day ${isWE(dia) ? 'we' : ''} ${dia === H ? 'now' : ''}">${c}</td>`;
      }).join('')}
      <td class="sm">${esc(d.local_entrega || '')}</td><td>${badge(d.situacao, d.nivel)}</td></tr>`;
  }).join('');
  return head('Cronograma', 'Previsto vs realizado por comunidade. Clique numa linha para registar a entrega.',
    pesquisa('crono', 'Procurar comunidade, distrito, camião…', 'style="width:320px"') + `<div class="seg">${['', ...provs].map(p => `<button class="${fp === p ? 'on' : ''}" data-act="fcrono" data-v="${esc(p)}">${p || 'Todas'}</button>`).join('')}</div>`) + `
  <div class="page-body">
    <div class="legend" style="margin:0 0 12px"><span><i style="background:var(--green-soft);border:1px solid var(--green-line)"></i>Previsto, com camião</span><span><i style="border:1px dashed #f59e0b"></i>Previsto, sem camião</span><span><i style="background:var(--red-soft);border:1px solid var(--red-line)"></i>Data passou</span><span><i style="background:var(--green-solid)"></i>Entregue no prazo</span><span><i style="background:var(--red-solid)"></i>Entregue com atraso</span><span><i style="background:#fffaeb;border:1px solid var(--accent-line)"></i>Hoje</span></div>
    <div class="table-wrap"><table class="grid-t" data-pesq-tabela="crono"><thead><tr><th class="stk c0">Distrito</th><th class="stk c1">Comunidade</th><th>Kits</th>
      ${dias.map(dia => `<th class="day ${isWE(dia) ? 'we' : ''} ${dia === H ? 'now' : ''}">${dm(dia)}<small>${DS[dt(dia).getUTCDay()]}</small></th>`).join('')}
      <th>Local de entrega</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

// ============================================================ Destinos
const VISTAS_DEST = [
  ['todos', 'Todos', () => true],
  ['planear', 'Por planear', d => !d.viagens.length && !['entregue', 'parcial', 'cancelado'].includes(d.estado)],
  ['atrasados', 'Atrasados', d => d.data_prevista && d.data_prevista < S.d.hoje && !['entregue', 'parcial', 'cancelado'].includes(d.estado)],
  ['transito', 'Em trânsito', d => d.estado === 'em_transito'],
  ['entregues', 'Entregues', d => ['entregue', 'parcial'].includes(d.estado)],
];
function destFiltrados() {
  const F = S.fDest, q = F.q;
  const vista = VISTAS_DEST.find(v => v[0] === F.vista)[2];
  return S.d.destinos.filter(d => vista(d) && (!F.provincia || d.provincia === F.provincia) && (!F.distrito || d.distrito === F.distrito) && (!F.data || d.data_prevista === F.data) &&
    (!q || casa([d.comunidade, d.localidade, d.posto, d.distrito, d.provincia, d.local_entrega, d.matriculas, d.situacao, kitTexto(d), dm(d.data_prevista), dLong(d.data_prevista)].join(' '), q)));
}
function pgDestinos() {
  const D = S.d.destinos, F = S.fDest;
  const provs = [...new Set(D.map(d => d.provincia))].sort();
  const dists = [...new Set(D.filter(d => !F.provincia || d.provincia === F.provincia).map(d => d.distrito))].sort();
  const datas = [...new Set(D.map(d => d.data_prevista).filter(Boolean))].sort();
  const opt = (arr, v, t, lbl = x => x) => `<option value="">${t}</option>${arr.map(x => `<option value="${esc(x)}" ${v === x ? 'selected' : ''}>${esc(lbl(x))}</option>`).join('')}`;
  return head('Destinos', `${semKits() ? `${D.length} destinos · ${nf(sum(D, d => d.volumes))} volumes · ${peso(sum(D, d => d.peso_itens))}` : `${D.length} comunidades · ${nf(S.p.kpis.benef_total)} beneficiários`}`,
    `<button class="btn" data-act="destino-novo">${ic('plus')} Novo destino</button>`) + `
  <div class="page-body">
    <div class="toolbar">
      <div class="seg">${VISTAS_DEST.map(([k, t, f]) => `<button class="${F.vista === k ? 'on' : ''}" data-act="fdest-vista" data-v="${k}">${t} <span class="c">${D.filter(f).length}</span></button>`).join('')}</div>
      <span class="grow"></span>
      <div class="search">${ic('search', 'sm')}<input class="input" id="qDest" placeholder="Procurar comunidade, local, matrícula…" value="${esc(F.q)}"></div>
      <select class="select" data-fdest="provincia">${opt(provs, F.provincia, 'Província')}</select>
      <select class="select" data-fdest="distrito">${opt(dists, F.distrito, 'Distrito')}</select>
      <select class="select" data-fdest="data">${opt(datas, F.data, 'Data prevista', dLong)}</select>
    </div>
    <div class="table-wrap" id="tDest"></div>
  </div>`;
}
function tabelaDestinos() {
  const L = destFiltrados();
  const all = L.length && L.every(d => S.sel.has(d.id));
  $('#tDest').innerHTML = L.length ? `<table class="t"><thead><tr>
    <th class="w-chk"><input type="checkbox" data-selall ${all ? 'checked' : ''} aria-label="Seleccionar todos"></th>
    <th>${semKits() ? 'Destino' : 'Comunidade'}</th><th>Distrito</th><th>${semKits() ? 'Carga' : 'Kits'}</th><th>Local de entrega</th><th>Previsto</th><th>Camião</th><th>Situação</th><th class="num">Custo alocado</th></tr></thead><tbody>
    ${L.map(d => `<tr class="click ${S.sel.has(d.id) ? 'sel' : ''}" data-act="destino" data-id="${d.id}">
      <td class="w-chk"><input type="checkbox" data-sel="${d.id}" ${S.sel.has(d.id) ? 'checked' : ''} aria-label="Seleccionar"></td>
      <td><div class="t1">${esc(d.comunidade)}</div><div class="t2">${esc([d.posto, d.localidade].filter(Boolean).join(' · '))}</div></td>
      <td><div>${esc(d.distrito)}</div><div class="t2">${esc(d.provincia)}</div></td>
      <td>${kitTag(d)}</td>
      <td class="sm">${esc(d.local_entrega || '') || '<span class="muted">—</span>'}</td>
      <td class="nowrap">${dLong(d.data_prevista)}${d.data_entrega ? `<div class="t2">entregue ${dm(d.data_entrega)}</div>` : ''}</td>
      <td>${d.viagens.map(id => { const v = S.vMap.get(id); return `<div class="nowrap">${plate(v.matricula)} <span class="t2">${esc(v.codigo)}</span></div>`; }).join('') || '<span class="muted">—</span>'}</td>
      <td>${badge(d.situacao, d.nivel)}</td>
      <td class="num">${d.custo_total ? mt(d.custo_total) : '<span class="muted">—</span>'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td colspan="2">${L.length} destinos</td><td class="nowrap">${semKits() ? `${nf(sum(L, d => d.volumes))} vol · ${peso(sum(L, d => d.peso_itens))}` : kitTag({ benef_baixa: sum(L, d => d.benef_baixa), benef_sequeiro: sum(L, d => d.benef_sequeiro) })}</td><td colspan="4"></td><td class="num">${mt(sum(L, d => d.custo_total))}</td></tr></tfoot></table>`
    : `<div class="empty"><div class="ico-box">${ic('search')}</div><b>Nenhum destino encontrado</b>Ajuste os filtros ou a pesquisa.</div>`;
}
function renderSelbar() {
  $('#selbar')?.remove();
  const ids = [...S.sel].filter(id => S.dMap.has(id));
  if (S.page !== 'destinos' || !ids.length) return;
  const el = document.createElement('div');
  el.className = 'selbar'; el.id = 'selbar';
  el.innerHTML = `<span class="n">${ids.length} seleccionado(s)</span>
    <button class="btn btn-sm" data-act="sel-camiao">${ic('truck', 'sm')} Criar camião</button>
    <button class="btn btn-sm" data-act="sel-atribuir">${ic('link', 'sm')} Atribuir a camião</button>
    <span class="sep"></span>
    <button class="btn btn-sm" data-act="sel-entregue">${ic('check', 'sm')} Marcar entregue</button>
    <button class="btn btn-sm" data-act="sel-data">${ic('calendar', 'sm')} Reprogramar</button>
    <span class="sep"></span>
    <button class="btn btn-sm btn-icon" data-act="sel-limpar" title="Limpar selecção">${ic('x', 'sm')}</button>`;
  document.body.append(el);
}

// ============================================================ Camiões
const ESTADOS_CAM = [['', 'Todos'], ['planeada', 'Planeados'], ['carregada', 'Carregados'], ['em_transito', 'Em trânsito'], ['concluida', 'Concluídos'], ['cancelada', 'Cancelados']];
function pgCamioes() {
  const V = S.d.viagens, F = S.fCam;
  return head('Camiões', `${V.length} viagens subcontratadas · ${mt(sum(V, v => v.custo_transporte))} em transporte`,
    `<button class="btn btn-primary" data-act="camiao-novo">${ic('plus')} Novo camião</button>`) + `
  <div class="page-body">
    <div class="toolbar">
      <div class="seg">${ESTADOS_CAM.map(([k, t]) => `<button class="${F.estado === k ? 'on' : ''}" data-act="fcam" data-v="${k}">${t} <span class="c">${k ? V.filter(v => v.estado === k).length : V.length}</span></button>`).join('')}</div>
      <span class="grow"></span>
      <div class="search">${ic('search', 'sm')}<input class="input" id="qCam" placeholder="Matrícula, motorista, transportadora…" value="${esc(F.q)}"></div>
    </div>
    <div class="table-wrap" id="tCam"></div>
  </div>`;
}
function tabelaCamioes() {
  const F = S.fCam, q = F.q;
  const L = S.d.viagens.filter(v => (!F.estado || v.estado === F.estado) && (!q || casa([v.codigo, v.matricula, v.matricula_reboque, v.motorista, v.motorista_tel, v.transportadora, v.estado_nome, ...v.destinos.map(x => S.dMap.get(x.destino_id)?.comunidade)].join(' '), q)));
  $('#tCam').innerHTML = L.length ? `<table class="t"><thead><tr><th>Camião</th><th>Transportadora</th><th>Motorista</th><th>Saída</th><th>Destinos</th><th class="num">Carga</th><th>Estado</th><th class="num">Transporte</th><th class="num">Extras</th><th class="num">Saldo a pagar</th></tr></thead><tbody>
    ${L.map(v => { const ds = v.destinos.map(x => S.dMap.get(x.destino_id)).filter(Boolean); return `<tr class="click" data-act="camiao" data-id="${v.id}">
      <td><div class="nowrap">${plate(v.matricula)} <span class="t1">${esc(v.codigo)}</span></div></td>
      <td>${esc(v.transportadora || '') || '<span class="muted">—</span>'}</td>
      <td>${esc(v.motorista || '') || '<span class="muted">—</span>'}${v.motorista_tel ? `<div class="t2">${esc(v.motorista_tel)}</div>` : ''}</td>
      <td class="nowrap">${dLong(v.data_saida || v.data_saida_prevista)}<div class="t2">${v.data_saida ? 'real' : 'prevista'}</div></td>
      <td><div class="t1">${ds.length} destino(s)</div><div class="t2" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ds.map(d => d.comunidade).join(', '))}</div></td>
      <td class="num"><div class="t1">${nf(v.kits_baixa + v.kits_sequeiro)} kits</div><div class="t2 ${v.capacidade_t && v.peso_kg > v.capacidade_t * 1000 ? 'neg' : ''}">≈ ${peso(v.peso_kg)}${v.capacidade_t ? ` / ${nf(v.capacidade_t)} t` : ''}</div></td>
      <td>${badge(v.estado_nome, NIVEL_VIAGEM[v.estado])}</td>
      <td class="num">${v.custo_transporte ? mt(v.custo_transporte) : '<span class="muted">sem preço</span>'}</td>
      <td class="num">${v.custos_extra ? mt(v.custos_extra) : '<span class="muted">—</span>'}</td>
      <td class="num ${v.saldo_pagar > 0 ? 'neg' : ''}">${mt(v.saldo_pagar)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="5">${L.length} camiões</td><td class="num">≈ ${peso(sum(L, v => v.peso_kg))}</td><td></td><td class="num">${mt(sum(L, v => v.custo_transporte))}</td><td class="num">${mt(sum(L, v => v.custos_extra))}</td><td class="num">${mt(sum(L, v => v.saldo_pagar))}</td></tr></tfoot></table>`
    : `<div class="empty"><div class="ico-box">${ic('truck')}</div><b>Sem camiões ${F.estado || F.q ? 'neste filtro' : 'registados'}</b>Crie camiões aqui ou no quadro de planeamento.<br><button class="btn btn-primary" data-act="camiao-novo">${ic('plus')} Novo camião</button></div>`;
}

// ============================================================ Orçamento e margem
function pgFinanceiro() {
  const F = S.f;
  const usado = F.receita ? F.gasto / F.receita : null;
  const rub = S.orcEdit ? F.rubricas : F.rubricas.filter(r => r.orcado || r.gasto);
  return head('Orçamento e custos', 'Orçamento do projecto, quanto já foi gasto e a margem',
    `<button class="btn" data-act="missao">${ic('wallet')} Orçamento do projecto</button>
     <button class="btn" data-act="orc-edit">${ic('pencil')} ${S.orcEdit ? 'Cancelar' : 'Limites por rubrica (opcional)'}</button>`) + `
  <div class="page-body">
    ${F.alertas.map(a => `<div class="callout ${a.nivel}" style="margin:0 0 10px">${ic('alert')}<span>${esc(a.texto)}</span></div>`).join('')}
    <section class="metrics">
      <div class="metric"><div class="l">Orçamento do projecto</div><div class="v">${F.receita ? mt(F.receita) : '—'}</div>
        <div class="s">${F.receita ? '' : '<a href="#" data-act="missao">Definir orçamento</a>'}</div></div>
      <div class="metric"><div class="l">Gasto até agora</div><div class="v">${mt(F.gasto)}</div>
        ${F.receita ? `<div class="bar"><i style="width:${Math.min(100, usado * 100)}%;background:${usado > 1 ? 'var(--red-solid)' : 'var(--primary)'}"></i></div><div class="s"><b>${pc(usado)}</b> do orçamento</div>` : ''}</div>
      <div class="metric"><div class="l">Margem (orçamento − gasto)</div><div class="v ${F.saldo < 0 ? 'neg' : 'pos'}">${F.receita ? mt(F.saldo) : '—'}</div>
        <div class="s">${F.receita ? `<b>${pc(F.saldo_pct)}</b> do orçamento` : ''}</div></div>
      <div class="metric"><div class="l">Pago / por pagar</div><div class="v">${mt(F.pago)}</div><div class="s">Falta pagar <b>${mt(F.por_pagar)}</b></div></div>
    </section>
    <div class="layout-eq">
      <section class="panel"><div class="panel-head"><h2>Gastos por rubrica</h2>
        ${S.orcEdit ? `<button class="btn btn-primary btn-sm" data-act="orc-guardar">${ic('check', 'sm')} Guardar orçamento</button>` : ''}</div>
        <div class="panel-body flush"><table class="t budget-t"><thead><tr><th>Rubrica</th><th class="num">Orçado</th><th class="num">Gasto</th><th class="num">Pago</th>${F.orcamento || S.orcEdit ? '<th class="num">Disponível</th>' : ''}</tr></thead><tbody>
        ${rub.map(r => `<tr><td class="t1">${esc(r.nome)}</td>
          <td class="num" style="width:160px">${S.orcEdit ? `<input class="input num" data-orc="${r.categoria}" value="${r.orcado || ''}" inputmode="decimal" placeholder="0">` : r.orcado ? mt(r.orcado) : '<span class="muted">—</span>'}</td>
          <td class="num strong">${mt(r.gasto)}</td><td class="num">${mt(r.pago)}</td>
          ${F.orcamento || S.orcEdit ? `<td class="num ${r.disponivel < 0 ? 'neg' : ''}">${r.disponivel == null ? '<span class="muted">—</span>' : mt(r.disponivel)}</td>` : ''}</tr>`).join('') || '<tr><td colspan="5"><div class="empty sm">Ainda sem gastos registados.</div></td></tr>'}
        </tbody><tfoot><tr><td>Total</td><td class="num">${F.orcamento ? mt(F.orcamento) : '—'}</td><td class="num">${mt(F.gasto)}</td><td class="num">${mt(F.pago)}</td>${F.orcamento || S.orcEdit ? `<td class="num ${F.orcamento - F.gasto < 0 ? 'neg' : ''}">${F.orcamento ? mt(F.orcamento - F.gasto) : '—'}</td>` : ''}</tr></tfoot></table></div></section>
      <section class="panel"><div class="panel-head"><h2>Gasto por camião</h2>${F.porCamiao.length > 3 ? `<div class="toolbar" style="margin:0">${pesquisa('fincam', 'Procurar camião…')}</div>` : ''}</div><div class="panel-body flush">
        ${F.porCamiao.length ? `<table class="t" data-pesq-tabela="fincam"><thead><tr><th>Camião</th><th class="num">Transporte</th><th class="num">Estivas e extras</th><th class="num">Total</th><th class="num">Por pagar</th></tr></thead><tbody>
        ${F.porCamiao.map(v => `<tr class="click" data-act="camiao" data-id="${v.id}"><td><div class="nowrap">${plate(v.matricula)} <span class="t1">${esc(v.codigo)}</span></div><div class="t2">${esc(v.transportadora || '')} · ${v.destinos} destino(s)</div></td>
          <td class="num">${mt(v.transporte)}</td><td class="num">${v.extras ? mt(v.extras) : '<span class="muted">—</span>'}</td><td class="num strong">${mt(v.total)}</td><td class="num ${v.total - v.pago > 0 ? 'neg' : ''}">${mt(v.total - v.pago)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${F.porCamiao.length} camião(ões)</td><td class="num">${mt(sum(F.porCamiao, v => v.transporte))}</td><td class="num">${mt(sum(F.porCamiao, v => v.extras))}</td><td class="num">${mt(sum(F.porCamiao, v => v.total))}</td><td class="num">${mt(sum(F.porCamiao, v => v.total - v.pago))}</td></tr></tfoot></table>`
        : '<div class="empty sm">Sem camiões registados.</div>'}</div></section>
    </div>
  </div>`;
}

// ============================================================ Custos
function pgCustos() {
  const C = S.d.custos;
  const tot = sum(C, c => c.valor), pg = sum(C.filter(c => c.pago), c => c.valor);
  const est = sum(C.filter(c => c.categoria.startsWith('estiva')), c => c.valor);
  return head('Custos', 'Estivas, combustível, portagens, ajudas de custo e outras despesas do projecto',
    `<button class="btn btn-primary" data-act="custo-novo">${ic('plus')} Registar custo</button>`) + `
  <div class="page-body">
    <section class="metrics">
      <div class="metric"><div class="l">Total de custos adicionais</div><div class="v">${compact(tot)}<small>MT</small></div><div class="s">${C.length} lançamentos</div></div>
      <div class="metric"><div class="l">Estivas (carga e descarga)</div><div class="v">${compact(est)}<small>MT</small></div><div class="s">${tot ? pc(est / tot, 0) : '—'} dos custos adicionais</div></div>
      <div class="metric"><div class="l">Pago</div><div class="v">${compact(pg)}<small>MT</small></div></div>
      <div class="metric"><div class="l">Por pagar</div><div class="v ${tot - pg > 0 ? 'neg' : ''}">${compact(tot - pg)}<small>MT</small></div></div>
    </section>
    ${C.length ? `<div class="toolbar">${pesquisa('custos', 'Procurar descrição, rubrica, fornecedor, camião…')}</div>` : ''}
    <div class="table-wrap">${C.length ? `<table class="t" data-pesq-tabela="custos"><thead><tr><th>Data</th><th>Rubrica</th><th>Descrição</th><th>Pago a</th><th>Ligado a</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>
      ${C.map(c => `<tr class="click" data-act="custo" data-id="${c.id}" data-extra="${esc([dm(c.data), c.pago ? 'pago' : 'por pagar'].join(' '))}"><td class="nowrap">${dLong(c.data)}</td><td>${esc(c.categoria_nome)}</td><td>${esc(c.descricao || '')}${c.observacoes ? `<div class="t2">${esc(c.observacoes)}</div>` : ''}</td><td>${esc(c.fornecedor || '')}</td>
        <td>${c.viagem_id ? `<span class="nowrap">${plate(S.vMap.get(c.viagem_id)?.matricula)} <span class="t2">${esc(S.vMap.get(c.viagem_id)?.codigo || '')}</span></span>` : ''}${c.destino_id ? `<div class="t2">${esc(S.dMap.get(c.destino_id)?.comunidade || '')}</div>` : ''}${!c.viagem_id && !c.destino_id ? '<span class="muted">Geral</span>' : ''}</td>
        <td class="num">${nf(c.quantidade, c.quantidade % 1 ? 2 : 0)}</td><td class="num">${mt2(c.valor_unitario)}</td><td class="num strong">${mt2(c.valor)}</td>
        <td>${c.pago ? badge('Pago', 'ok') : badge('Por pagar', 'alerta')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="7">Total</td><td class="num">${mt2(tot)}</td><td></td></tr></tfoot></table>`
    : `<div class="empty"><div class="ico-box">${ic('receipt')}</div><b>Sem custos adicionais</b>Registe estivas e outras despesas — ficam ligadas ao camião ou ao destino.<br><button class="btn btn-primary" data-act="custo-novo">${ic('plus')} Registar custo</button></div>`}</div>
  </div>`;
}

// ============================================================ Transportadoras
function pgTransportadoras() {
  const por = Object.fromEntries(S.p.porTransportadora.map(t => [t.nome, t]));
  return head('Transportadoras', 'Empresas subcontratadas para o transporte',
    `${S.d.viagens.length ? `<a class="btn" href="/api/missoes/${S.missao}/transportadoras/mapa.xlsx">${ic('download')} Mapa de viagens (Excel)</a>` : ''}<button class="btn btn-primary" data-act="transp-novo">${ic('plus')} Nova transportadora</button>`) + `
  <div class="page-body">${S.transp.length ? `<div class="toolbar">${pesquisa('transp', 'Procurar empresa, NUIT, contacto…')}</div>` : ''}<div class="table-wrap">${S.transp.length ? `<table class="t" data-pesq-tabela="transp"><thead><tr><th>Empresa</th><th>NUIT</th><th>Contacto</th><th class="num">Camiões neste projecto</th><th class="num">Valor contratado</th><th class="num">Pago</th><th class="num">Saldo</th><th>Mapa</th></tr></thead><tbody>
    ${S.transp.map(t => { const x = por[t.nome] || { viagens: 0, valor: 0, pago: 0 }; return `<tr class="click" data-act="transp" data-id="${t.id}" data-extra="${esc(t.email || '')}">
      <td class="t1">${esc(t.nome)}</td><td>${esc(t.nuit || '') || '<span class="muted">—</span>'}</td>
      <td>${esc(t.contacto || '')}${t.telefone ? `<div class="t2">${esc(t.telefone)}</div>` : ''}</td>
      <td class="num">${x.viagens}</td><td class="num">${mt(x.valor)}</td><td class="num">${mt(x.pago)}</td><td class="num ${x.valor - x.pago - (x.nd || 0) > 0 ? 'neg' : ''}">${mt(x.valor - x.pago - (x.nd || 0))}${x.nd ? `<div class="t2">ND −${mt(x.nd)}</div>` : ''}</td>
      <td class="nowrap">${x.viagens ? `<a class="btn btn-xs" href="/api/missoes/${S.missao}/transportadoras/${t.id}/mapa.xlsx" title="Excel">${ic('download', 'sm')} Excel</a> <a class="btn btn-xs" href="/mapa-transportadora/${S.missao}/${t.id}" target="_blank" rel="noopener" title="Imprimir / PDF">Imprimir</a>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>`
    : `<div class="empty"><div class="ico-box">${ic('building')}</div><b>Sem transportadoras</b>Registe as empresas a quem subcontrata os camiões.<br><button class="btn btn-primary" data-act="transp-novo">${ic('plus')} Nova transportadora</button></div>`}</div></div>`;
}

function pgArtigos() {
  const D = S.d.destinos.filter(d => d.itens?.length);
  if (!D.length) return head('Kits de insumos', 'Este projecto ainda não tem kits nem artigos.') + '<div class="page-body"><div class="panel empty"><b>Sem carga definida</b>Registe os artigos de cada destino no painel do destino.</div></div>';
  const art = new Map();
  for (const d of D) for (const i of d.itens) { const k = (i.codigo || '') + '|' + i.artigo; const a = art.get(k) || { artigo: i.artigo, codigo: i.codigo, categoria: i.categoria, fornecedor: i.fornecedor, por: {}, vol: 0, kg: 0 }; a.por[d.id] = (a.por[d.id] || 0) + (i.volumes || 0); a.vol += i.volumes || 0; a.kg += i.peso_kg || 0; art.set(k, a); }
  const A = [...art.values()];
  const short = d => d.comunidade.replace(/^SDAE\s*-\s*/i, '');
  return head('Artigos a entregar', `${A.length} artigos · ${D.length} destinos · ${nf(sum(D, d => d.volumes))} volumes · ${peso(sum(D, d => d.peso_itens))}`) + `
  <div class="page-body">
    <section class="metrics">
      <div class="metric"><div class="l">Linhas de carga</div><div class="v">${sum(D, d => d.itens.length)}</div></div>
      <div class="metric"><div class="l">Volumes</div><div class="v">${nf(sum(D, d => d.volumes))}</div></div>
      <div class="metric"><div class="l">Peso total</div><div class="v">${peso(sum(D, d => d.peso_itens))}</div></div>
      <div class="metric"><div class="l">Fornecedores</div><div class="s" style="flex-direction:column">${[...new Set(A.map(a => a.fornecedor).filter(Boolean))].map(fz => `<span><b>${esc(fz)}</b></span>`).join('')}</div></div>
    </section>
    <div class="toolbar">${pesquisa('artigos', 'Procurar artigo, código, fornecedor…')}</div>
    <div class="table-wrap"><table class="t" data-pesq-tabela="artigos"><thead><tr><th>Artigo</th>${D.map(d => `<th class="num" title="${esc(d.comunidade)}">${esc(short(d))}</th>`).join('')}<th class="num">Total vol.</th><th class="num">Peso</th></tr></thead><tbody>
      ${A.map(a => `<tr><td><span class="t1">${esc(a.artigo)}</span><div class="t2">${esc([a.codigo, a.categoria, a.fornecedor].filter(Boolean).join(' · '))}</div></td>${D.map(d => `<td class="num">${a.por[d.id] ? nf(a.por[d.id], a.por[d.id] % 1 ? 1 : 0) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num strong">${nf(a.vol, a.vol % 1 ? 1 : 0)}</td><td class="num">${peso(a.kg)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Peso por destino</td>${D.map(d => `<td class="num">${peso(d.peso_itens)}</td>`).join('')}<td class="num">${nf(sum(D, d => d.volumes))}</td><td class="num">${peso(sum(D, d => d.peso_itens))}</td></tr></tfoot></table></div>
  </div>`;
}

function pgKits() {
  const K = S.kitsInfo;
  if (!K) { api(`/api/missoes/${S.missao}/kits`).then(k => { S.kitsInfo = k; if (S.page === 'kits') renderPage(); }); return head('Kits de insumos', 'A carregar…'); }
  if (!K.itens.length) return pgArtigos();
  const provs = K.porProv.map(p => p.provincia);
  const semPeso = [...new Set([...K.porConfirmar.baixa, ...K.porConfirmar.sequeiro])];
  const tabelaKit = (kit, nome) => `<section class="panel"><div class="panel-head"><h2>${nome} <span class="c">${nf(K.total.kits[kit])} kits</span></h2><span class="hint">≈ ${nf(K.peso[kit], 1)} kg por kit</span></div>
    <div class="panel-body flush"><table class="t budget-t"><thead><tr><th>Artigo</th><th>Embalagem</th><th class="num">Qtd. por kit</th><th class="num">Peso unitário (kg)</th></tr></thead><tbody>
    ${K.itens.filter(i => i.kit === kit).map(i => `<tr><td><span class="t1">${esc(i.item)}</span><div class="t2">${esc(i.descricao)}</div></td><td>${esc(i.embalagem)}</td>
      <td class="num" style="width:100px"><input class="input num" data-kq="${i.id}" value="${String(i.qtd).replace('.', ',')}" inputmode="decimal"></td>
      <td class="num" style="width:140px"><input class="input num" data-kp="${i.id}" value="${i.peso_kg == null ? '' : String(i.peso_kg).replace('.', ',')}" placeholder="por confirmar" inputmode="decimal"></td></tr>`).join('')}
    </tbody></table></div></section>`;
  return head('Kits de insumos', '1 kit por beneficiário — Kit Baixa (regadio) ou Kit Sequeiro') + `
  <div class="page-body">
    <section class="metrics">
      <div class="metric"><div class="l">Kit Baixa</div><div class="v">${nf(K.total.kits.baixa)}</div></div>
      <div class="metric"><div class="l">Kit Sequeiro</div><div class="v">${nf(K.total.kits.sequeiro)}</div></div>
      <div class="metric"><div class="l">Peso total estimado</div><div class="v">≈ ${peso(K.peso_total)}</div><div class="s">${semPeso.length ? 'sem ' + esc(semPeso.join(', ')) : 'todos os artigos com peso'}</div></div>
      <div class="metric"><div class="l">Por província</div><div class="s" style="flex-direction:column;gap:2px">${K.porProv.map(p => `<span>${esc(p.provincia)}: <b>${nf(p.kits.baixa + p.kits.sequeiro)} kits · ≈ ${peso(p.peso_kg)}</b></span>`).join('')}</div></div>
    </section>
    <section class="panel" style="margin-bottom:16px"><div class="panel-head"><h2>Quantidades a preparar</h2><div class="toolbar" style="margin:0">${pesquisa('kits', 'Procurar artigo…')}</div></div>
      <div class="panel-body flush"><table class="t" data-pesq-tabela="kits"><thead><tr><th>Artigo</th><th>Embalagem</th>${provs.map(p => `<th class="num">${esc(p)}</th>`).join('')}<th class="num">Total</th><th class="num">Peso</th></tr></thead><tbody>
      ${K.total.itens.map(i => `<tr><td><span class="t1">${esc(i.item)}</span><div class="t2">${esc(i.descricao)}</div></td><td>${esc(i.embalagem)}</td>
        ${K.porProv.map(p => `<td class="num">${nf(p.itens.find(x => x.descricao === i.descricao)?.qtd || 0)}</td>`).join('')}
        <td class="num strong">${nf(i.qtd)}</td><td class="num">${i.peso_kg == null ? '<span class="muted">—</span>' : peso(i.peso_kg)}</td></tr>`).join('')}
      </tbody></table></div></section>
    <div class="layout-eq">${tabelaKit('baixa', 'Kit Baixa (regadio)')}${tabelaKit('sequeiro', 'Kit Sequeiro')}</div>
  </div>`;
}

const NIVEL_ND = { emitida: 'info', aceite: 'ok', contestada: 'critico', anulada: 'neutro' };
function pgNotas() {
  const N = S.d.notas || [];
  const desc = sum(N.filter(n => n.conta), n => n.valor), cont = N.filter(n => n.estado === 'contestada');
  return head('Notas de débito', 'Valores a debitar às transportadoras por faltas, danos ou atrasos — descontados no pagamento do transporte',
    `<button class="btn btn-primary" data-act="nd-novo">${ic('plus')} Nova nota de débito</button>`) + `
  <div class="page-body">
    <section class="metrics">
      <div class="metric"><div class="l">A descontar às transportadoras</div><div class="v">${mt(desc)}</div><div class="s">notas emitidas e aceites</div></div>
      <div class="metric"><div class="l">Notas emitidas</div><div class="v">${N.filter(n => n.estado === 'emitida').length}</div><div class="s">aguardam resposta</div></div>
      <div class="metric"><div class="l">Contestadas</div><div class="v ${cont.length ? 'neg' : ''}">${cont.length}</div><div class="s">${cont.length ? mt(sum(cont, n => n.valor)) + ' em disputa' : 'nenhuma em disputa'}</div></div>
      <div class="metric"><div class="l">Aceites</div><div class="v">${N.filter(n => n.estado === 'aceite').length}</div></div>
    </section>
    ${N.length ? `<div class="toolbar">${pesquisa('notas', 'Procurar nº, transportadora, camião, artigo, observações…')}</div>` : ''}
    <div class="table-wrap">${N.length ? `<table class="t" data-pesq-tabela="notas"><thead><tr><th>Nº</th><th>Data</th><th>Transportadora / camião</th><th>Destino</th><th>Motivo</th><th>Artigos</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>
      ${N.map(n => { const v = S.vMap.get(n.viagem_id), d = S.dMap.get(n.destino_id); return `<tr class="click" data-act="nd" data-id="${n.id}" data-extra="${esc([n.observacoes, n.referencia, dm(n.data)].join(' '))}">
        <td class="t1 nowrap">${esc(n.numero)}</td><td class="nowrap">${dLong(n.data)}</td>
        <td><div class="t1">${esc(n.transportadora || '—')}</div><div class="t2">${v ? `${esc(v.codigo)} · ${esc(v.matricula || '')}` : ''}</div></td>
        <td>${d ? `${esc(d.comunidade)}<div class="t2">${esc(d.distrito)}</div>` : '<span class="muted">—</span>'}</td>
        <td>${esc(n.motivo_nome)}</td>
        <td class="sm">${esc(n.linhas.map(l => `${nf(l.quantidade, l.quantidade % 1 ? 2 : 0)} × ${l.artigo}`).join('; '))}${n.observacoes ? `<div class="t2" title="${esc(n.observacoes)}">${esc(n.observacoes.slice(0, 70))}${n.observacoes.length > 70 ? '…' : ''}</div>` : ''}</td>
        <td class="num strong ${n.conta ? '' : 'muted'}">${mt2(n.valor)}</td><td>${badge(n.estado_nome, NIVEL_ND[n.estado])}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="6">Total descontado (emitidas + aceites)</td><td class="num">${mt2(desc)}</td><td></td></tr></tfoot></table>`
      : `<div class="empty"><div class="ico-box">${ic('filemin')}</div><b>Sem notas de débito</b>Quando a mercadoria chegar em falta ou danificada, registe aqui o valor a debitar à transportadora.<br><button class="btn btn-primary" data-act="nd-novo">${ic('plus')} Nova nota de débito</button></div>`}</div>
  </div>`;
}

// ---------- nota de débito (drawer)
function drawerND(nd, pre = {}) {
  const novo = !nd;
  const st = { data: S.d.hoje, motivo: 'falta', estado: 'emitida', ...(nd || {}), ...pre };
  let linhas = (nd?.linhas || pre.linhas || []).map(l => ({ artigo: l.artigo, quantidade: l.quantidade, preco_unit: l.preco_unit }));
  if (!linhas.length) linhas.push({ artigo: '', quantidade: 1, preco_unit: 0 });
  let estado = st.estado;
  // catálogo: artigos dos kits com o preço das guias
  const cat = [...new Map((S.d.kits?.itens || []).map(i => [i.descricao, { artigo: i.descricao, preco: i.preco_unit || 0 }])).values()];
  const el = drawer({
    titulo: novo ? 'Nova nota de débito' : `${esc(nd.numero)} ${badge(nd.estado_nome, NIVEL_ND[nd.estado])}`,
    crumb: novo ? 'Valor a debitar à transportadora' : esc(nd.transportadora || ''),
    corpo: `
      <div class="sec"><div class="sec-h"><h4>Estado</h4></div>
        <div class="seg" id="segND">${Object.entries(S.meta.estadosND).map(([k, t]) => `<button type="button" data-e="${k}" class="${estado === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="muted sm" style="margin-top:8px">Só as notas <b>emitidas</b> ou <b>aceites</b> são descontadas no saldo a pagar à transportadora.</div></div>
      <div class="sec"><div class="sec-h"><h4>Dados</h4></div><div class="grid g2">
        ${campoHTML({ n: 'viagem_id', l: 'Camião', t: 'select', v: st.viagem_id, vazio: '— seleccionar —', o: S.d.viagens.map(v => [v.id, `${v.codigo} · ${v.matricula || 'sem matrícula'} · ${v.transportadora || 'sem transportadora'}`]) })}
        <label class="field"><span>Destino</span><select class="select" name="destino_id" id="ndDest"></select></label>
        ${campoHTML({ n: 'data', l: 'Data', t: 'date', v: st.data })}
        ${campoHTML({ n: 'motivo', l: 'Motivo', t: 'select', v: st.motivo, o: Object.entries(S.meta.motivosND) })}
        ${campoHTML({ n: 'referencia', l: 'Documento de suporte', v: st.referencia, ph: 'nº da guia, auto de recepção…', cls: 'spanall' })}
      </div></div>
      <div class="sec"><div class="sec-h"><h4>Artigos e valores</h4><button type="button" class="btn btn-sm" data-add-l>${ic('plus', 'sm')} Linha</button></div>
        <div class="picker"><table class="t"><thead><tr><th>Artigo / descrição</th><th class="num" style="width:90px">Qtd</th><th class="num" style="width:140px">Valor unit. (MT)</th><th class="num" style="width:120px">Valor</th><th style="width:36px"></th></tr></thead><tbody id="ndL"></tbody></table></div>
        <datalist id="ndCat">${cat.map(c => `<option value="${esc(c.artigo)}">`).join('')}</datalist>
        <div class="total-line"><span class="muted">Total a debitar</span><b id="ndTot">—</b></div></div>
      <div class="sec"><div class="sec-h"><h4>Observações</h4></div>${campoHTML({ n: 'observacoes', l: 'Observações', t: 'textarea', v: st.observacoes, ph: 'O que aconteceu, quem recebeu, fotografias, acordo com o motorista…' })}</div>`,
    rodape: `${novo ? '' : `<button class="btn btn-danger left" data-del>${ic('trash', 'sm')} Eliminar</button><a class="btn" href="/nd/${nd.id}" target="_blank" rel="noopener">${ic('download', 'sm')} Imprimir</a>`}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button>`,
  });
  const destinosDe = vid => { const v = S.vMap.get(Number(vid)); return v ? v.destinos.map(x => S.dMap.get(x.destino_id)).filter(Boolean) : S.d.destinos; };
  const desenharDest = () => {
    const ds = destinosDe($('[name=viagem_id]', el).value);
    $('#ndDest', el).innerHTML = '<option value="">— nenhum / vários —</option>' + ds.map(d => `<option value="${d.id}" ${String(st.destino_id) === String(d.id) ? 'selected' : ''}>${esc(d.comunidade)} (${esc(d.distrito)})</option>`).join('');
  };
  const total = () => { $('#ndTot', el).textContent = mt2(sum(linhas, l => (Number(l.quantidade) || 0) * (Number(l.preco_unit) || 0))); };
  const desenharL = () => {
    $('#ndL', el).innerHTML = linhas.map((l, i) => `<tr>
      <td><input class="input" list="ndCat" data-l="${i}" data-k="artigo" value="${esc(l.artigo)}" placeholder="Escolha um artigo ou escreva" style="height:30px"></td>
      <td class="num"><input class="input num" data-l="${i}" data-k="quantidade" value="${l.quantidade ?? ''}" inputmode="decimal" style="height:30px"></td>
      <td class="num"><input class="input num" data-l="${i}" data-k="preco_unit" value="${l.preco_unit || ''}" inputmode="decimal" style="height:30px"></td>
      <td class="num strong" data-v="${i}">${mt2((Number(l.quantidade) || 0) * (Number(l.preco_unit) || 0))}</td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-icon" data-rm-l="${i}" title="Remover">${ic('x', 'sm')}</button></td></tr>`).join('');
    total();
  };
  desenharDest(); desenharL();
  $('[name=viagem_id]', el).addEventListener('change', () => { st.destino_id = null; desenharDest(); });
  $('#segND', el).onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; estado = b.dataset.e; $$('#segND button', el).forEach(x => x.classList.toggle('on', x === b)); };
  $('#ndL', el).addEventListener('input', e => {
    const i = e.target.dataset.l; if (i == null) return;
    const k = e.target.dataset.k;
    linhas[i][k] = k === 'artigo' ? e.target.value : numero(e.target.value);
    if (k === 'artigo') { const c = cat.find(x => x.artigo === e.target.value); if (c && !Number(linhas[i].preco_unit)) { linhas[i].preco_unit = c.preco; $(`[data-l="${i}"][data-k="preco_unit"]`, el).value = String(c.preco).replace('.', ','); } }
    $(`[data-v="${i}"]`, el).textContent = mt2((Number(linhas[i].quantidade) || 0) * (Number(linhas[i].preco_unit) || 0));
    total();
  });
  $('#ndL', el).addEventListener('click', e => { const b = e.target.closest('[data-rm-l]'); if (!b) return; linhas.splice(Number(b.dataset.rmL), 1); if (!linhas.length) linhas.push({ artigo: '', quantidade: 1, preco_unit: 0 }); desenharL(); });
  $('[data-add-l]', el).onclick = () => { linhas.push({ artigo: '', quantidade: 1, preco_unit: 0 }); desenharL(); $('#ndL tr:last-child input', el).focus(); };
  $('[data-save]', el).onclick = async () => {
    const b = { ...ler($('.drawer-b', el)), estado, linhas: linhas.filter(l => String(l.artigo || '').trim()) };
    for (const k of Object.keys(b)) if (/^(artigo|quantidade|preco_unit)$/.test(k)) delete b[k];
    if (!b.viagem_id) return toast('Escolha o camião', true);
    if (!b.linhas.length) return toast('Indique pelo menos um artigo', true);
    await mutate(() => novo ? api(`/api/missoes/${S.missao}/notas-debito`, { method: 'POST', body: b }) : api(`/api/notas-debito/${nd.id}`, { method: 'PUT', body: b }), novo ? 'Nota de débito registada' : 'Nota de débito actualizada');
    fecharCamada();
  };
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!await dialogo({ titulo: `Eliminar ${esc(nd.numero)}?`, texto: 'Para manter o histórico, prefira marcar como Anulada.', ok: 'Eliminar', perigo: true })) return;
    await mutate(() => api(`/api/notas-debito/${nd.id}`, { method: 'DELETE' }), 'Nota eliminada'); fecharCamada();
  });
}

const NIVEL_PROJ = { por_implementar: 'alerta', em_curso: 'info', concluido: 'ok' };
const unidP = (p, v) => (p.unidade === 'kits' ? `${nf(v)} kits` : p.unidade === 'kg' ? peso(v) : `${nf(v)} destinos`);
function pgProjectos() {
  const P = S.proj || [];
  const t = k => sum(P, p => p[k]);
  const orc = t('receita'), gas = t('custos'), mg = orc - gas;
  const grupos = [['em_curso', 'Em curso'], ['por_implementar', 'Por implementar'], ['concluido', 'Concluídos']];
  return head('Todos os projectos', 'Orçamento, gasto e margem de cada projecto',
    `<a class="btn" href="/api/projectos/mapa.xlsx">${ic('download')} Excel</a><a class="btn" href="/mapa-projectos" target="_blank" rel="noopener">Imprimir / PDF</a><button class="btn btn-primary" data-act="missao-nova">${ic('plus')} Novo projecto</button>`) + `
  <div class="page-body">
    <section class="metrics m5">
      <div class="metric"><div class="l">Projectos</div><div class="v">${P.length}</div><div class="s">${grupos.map(([k, n]) => `<span>${n.toLowerCase()} <b>${P.filter(p => p.estado === k).length}</b></span>`).join('')}</div></div>
      <div class="metric"><div class="l">Orçamento</div><div class="v">${compact(orc)}<small>MT</small></div><div class="s">${P.filter(p => !p.receita).length ? `<span>${P.filter(p => !p.receita).length} sem orçamento</span>` : 'soma dos projectos'}</div></div>
      <div class="metric"><div class="l">Gasto</div><div class="v">${compact(gas)}<small>MT</small></div><div class="bar">${orc ? `<i style="width:${Math.min(100, gas / orc * 100)}%;background:${gas > orc ? 'var(--red-solid)' : 'var(--primary)'}"></i>` : ''}</div><div class="s"><span><b>${orc ? pc(gas / orc, 0) : '—'}</b> do orçamento</span></div></div>
      <div class="metric"><div class="l">Margem</div><div class="v ${mg < 0 ? 'neg' : 'pos'}">${compact(mg)}<small>MT</small></div><div class="s"><span><b>${orc ? pc(mg / orc) : '—'}</b> do orçamento</span></div></div>
      <div class="metric"><div class="l">Por pagar</div><div class="v">${compact(t('custos_por_pagar'))}<small>MT</small></div><div class="s"><span>pago <b>${compact(t('custos_pagos'))}</b></span></div></div>
    </section>
    <div class="toolbar">${pesquisa('proj', 'Procurar projecto, cliente, província…')}</div>
    <div class="table-wrap"><table class="t" data-pesq-tabela="proj"><thead><tr><th>Projecto</th><th>Estado</th><th>Execução</th><th>Por entregar</th><th class="num">Orçamento</th><th class="num">Gasto</th><th class="num">Margem</th><th class="num">Margem %</th><th class="num">Por pagar</th></tr></thead><tbody>
      ${P.map(p => { const m = p.receita - p.custos, mp = p.receita ? m / p.receita : null; return `<tr class="click" data-act="abrir-proj" data-id="${p.id}" data-extra="${esc(p.provincias.join(' ') + ' ' + p.estado_nome)}">
        <td><div class="t1">${esc(p.nome)}</div><div class="t2">${esc([p.cliente, p.provincias.join(', ')].filter(Boolean).join(' · '))}</div></td>
        <td>${badge(p.estado_nome, NIVEL_PROJ[p.estado])}<div class="t2">${dm(p.inicio)} – ${dm(p.fim)}</div></td>
        <td style="min-width:140px"><div class="bar" style="margin:0 0 4px"><i style="width:${Math.round(p.execucao * 100)}%;background:var(--green-solid)"></i></div><div class="t2">${Math.round(p.execucao * 100)}% · ${p.destinos_entregues}/${p.destinos} destinos</div></td>
        <td><div class="t1">${unidP(p, p.por_entregar_unid)}</div>${p.sem_data ? `<div class="t2">${p.sem_data} sem data</div>` : ''}</td>
        <td class="num">${p.receita ? mt(p.receita) : '<span class="muted">por definir</span>'}</td>
        <td class="num">${mt(p.custos)}${p.receita ? `<div class="t2">${pc(p.custos / p.receita, 0)} do orçamento</div>` : ''}</td>
        <td class="num strong ${p.receita && m < 0 ? 'neg' : 'pos'}">${p.receita ? mt(m) : '—'}</td>
        <td class="num strong ${p.receita && m < 0 ? 'neg' : ''}">${p.receita ? pc(mp) : '—'}</td>
        <td class="num">${mt(p.custos_por_pagar)}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td colspan="4">${P.length} projecto(s)</td><td class="num">${mt(orc)}</td><td class="num">${mt(gas)}</td><td class="num">${mt(mg)}</td><td class="num">${orc ? pc(mg / orc) : '—'}</td><td class="num">${mt(t('custos_por_pagar'))}</td></tr></tfoot></table></div>
    <div class="muted sm" style="margin-top:10px">Margem = orçamento − gasto registado (camiões, estivas e outros custos, menos notas de débito).</div>
  </div>`;
}

function pgUtilizadores() {
  if (S.eu?.perfil !== 'superadmin') return head('Utilizadores', 'Só o superadmin pode gerir utilizadores.');
  const U = S.utilizadores;
  if (!U) { api('/api/utilizadores').then(u => { S.utilizadores = u; if (S.page === 'utilizadores') renderPage(); }).catch(e => toast(e.message, true)); return head('Utilizadores', 'A carregar…'); }
  return head('Utilizadores', 'Quem pode entrar no sistema e com que perfil',
    `<button class="btn btn-primary" data-act="util-novo">${ic('plus')} Novo utilizador</button>`) + `
  <div class="page-body">
    <div class="toolbar">${pesquisa('util', 'Procurar nome, utilizador, email…')}<span class="grow"></span><span class="muted sm"><b>Superadmin</b>: tudo, incluindo utilizadores · <b>Utilizador</b>: trabalho do dia-a-dia</span></div>
    <div class="table-wrap"><table class="t" data-pesq-tabela="util"><thead><tr><th>Nome</th><th>Utilizador</th><th>Email</th><th>Perfil</th><th>Estado</th><th>Último acesso</th></tr></thead><tbody>
      ${U.map(u => `<tr class="click" data-act="util" data-id="${u.id}"><td><span class="t1">${esc(u.nome)}</span>${u.id === S.eu.id ? ' <span class="t2">(eu)</span>' : ''}${u.observacoes ? `<div class="t2">${esc(u.observacoes)}</div>` : ''}</td><td class="mono">${esc(u.utilizador)}</td><td>${esc(u.email || '')}</td>
        <td>${badge(u.perfil_nome, u.perfil === 'superadmin' ? 'violet' : 'neutro')}</td><td>${u.activo ? badge('Activo', 'ok') : badge('Desactivado', 'neutro')}${u.mudar_senha ? '<div class="t2">vai mudar a palavra-passe</div>' : ''}</td>
        <td class="nowrap">${u.ultimo_acesso ? esc(u.ultimo_acesso.slice(0, 16).replace('T', ' ')) : '<span class="muted">nunca</span>'}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
}
async function dialogoUtilizador(u) {
  const r = await dialogo({ titulo: u ? `Editar ${esc(u.nome)}` : 'Novo utilizador', ok: 'Guardar', campos: [
    { n: 'nome', l: 'Nome', v: u?.nome }, { n: 'utilizador', l: 'Utilizador (para entrar)', v: u?.utilizador, attr: u ? 'disabled' : 'autocomplete="off"' },
    { n: 'email', l: 'Email', t: 'email', v: u?.email },
    { n: 'perfil', l: 'Perfil', t: 'select', v: u?.perfil || 'utilizador', o: [['utilizador', 'Utilizador — trabalho do dia-a-dia'], ['superadmin', 'Superadmin — tudo, incluindo utilizadores']] },
    ...(u ? [{ n: 'activo', l: 'Estado', t: 'select', v: u.activo ? '1' : '0', o: [['1', 'Activo'], ['0', 'Desactivado (não consegue entrar)']] }] : []),
    { n: 'senha', l: u ? 'Nova palavra-passe (deixe vazio para manter)' : 'Palavra-passe inicial', t: 'password', ph: 'mínimo 8 caracteres', attr: 'autocomplete="new-password"' },
    { n: 'observacoes', l: 'Observações', t: 'textarea', v: u?.observacoes } ] });
  if (!r) return;
  if (u) { r.activo = r.activo === '1'; delete r.utilizador; if (!r.senha) delete r.senha; }
  try {
    await (u ? api(`/api/utilizadores/${u.id}`, { method: 'PUT', body: r }) : api('/api/utilizadores', { method: 'POST', body: r }));
    toast(u ? 'Utilizador actualizado' : 'Utilizador criado — vai pedir para mudar a palavra-passe no 1.º acesso');
    S.utilizadores = null; renderPage();
  } catch (e) { toast(e.message, true); }
}
async function mudarSenha(obrigatorio) {
  const r = await dialogo({ titulo: obrigatorio ? 'Defina a sua palavra-passe' : 'Mudar palavra-passe', ok: 'Guardar',
    texto: obrigatorio ? 'Está a usar uma palavra-passe temporária. Escolha uma nova para continuar.' : '',
    campos: [{ n: 'atual', l: 'Palavra-passe actual', t: 'password', attr: 'autocomplete="current-password"' },
      { n: 'nova', l: 'Nova palavra-passe', t: 'password', ph: 'mínimo 8 caracteres', attr: 'autocomplete="new-password"' },
      { n: 'confirma', l: 'Repita a nova', t: 'password', attr: 'autocomplete="new-password"' }] });
  if (!r) { if (obrigatorio) setTimeout(() => mudarSenha(true), 300); return; }
  if (r.nova !== r.confirma) { toast('As duas palavras-passe não coincidem', true); return mudarSenha(obrigatorio); }
  try { await api('/api/auth/senha', { method: 'POST', body: r }); S.eu.mudar_senha = false; toast('Palavra-passe actualizada'); }
  catch (e) { toast(e.message, true); return mudarSenha(obrigatorio); }
}
// tema: claro | escuro | sistema (guardado por utilizador neste browser)
const chaveTema = () => 'tema' + (S.eu ? ':' + S.eu.id : '');
function temaEscolhido() { try { return localStorage.getItem(chaveTema()) || localStorage.getItem('tema') || 'sistema'; } catch { return 'sistema'; } }
function aplicarTema() {
  const t = temaEscolhido();
  document.documentElement.dataset.theme = t === 'sistema' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => temaEscolhido() === 'sistema' && aplicarTema());
function menuConta(btn) {
  document.getElementById('menu-conta')?.remove();
  const t = temaEscolhido();
  const m = document.createElement('div'); m.id = 'menu-conta'; m.className = 'menu-conta';
  m.innerHTML = `<div class="mc-h"><b>${esc(S.eu.nome)}</b><small>${esc(S.eu.utilizador)} · ${S.eu.perfil === 'superadmin' ? 'Superadmin' : 'Utilizador'}</small></div>
    <div class="mc-l">Tema</div>
    <div class="seg mc-tema">${[['light', 'Claro'], ['dark', 'Escuro'], ['sistema', 'Sistema']].map(([k, n]) => `<button data-tema="${k}" class="${t === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <button class="mc-i" data-mc="senha">${ic('settings', 'sm')} Mudar palavra-passe</button>
    <button class="mc-i mc-sair" data-mc="sair">${ic('right', 'sm')} Sair</button>`;
  document.body.append(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, r.left) + 'px'; m.style.bottom = (innerHeight - r.top + 6) + 'px';
  const fechar = e => { if (!m.contains(e.target) && !btn.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', fechar); } };
  setTimeout(() => document.addEventListener('mousedown', fechar));
  m.onclick = async e => {
    const tm = e.target.closest('[data-tema]');
    if (tm) { try { localStorage.setItem(chaveTema(), tm.dataset.tema); localStorage.setItem('tema', tm.dataset.tema); } catch {} aplicarTema(); $$('[data-tema]', m).forEach(b => b.classList.toggle('on', b === tm)); return; }
    const a = e.target.closest('[data-mc]'); if (!a) return;
    m.remove();
    if (a.dataset.mc === 'senha') mudarSenha(false);
    if (a.dataset.mc === 'sair') { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login.html'; }
  };
}

const PAGES = { utilizadores: pgUtilizadores, projectos: pgProjectos, notas: pgNotas, kits: pgKits, overview: pgOverview, planeamento: pgPlaneamento, cronograma: pgCronograma, destinos: pgDestinos, camioes: pgCamioes, financeiro: pgFinanceiro, custos: pgCustos, transportadoras: pgTransportadoras };
var AFTER_planeamento;
const AFTER = {
  planeamento: () => AFTER_planeamento(),
  destinos: () => {
    tabelaDestinos();
    const q = $('#qDest'); q.oninput = () => { S.fDest.q = q.value; tabelaDestinos(); };
  },
  camioes: () => { tabelaCamioes(); const q = $('#qCam'); q.oninput = () => { S.fCam.q = q.value; tabelaCamioes(); }; },
};

// ============================================================ camada: drawers e diálogos
function fecharCamada() { $('#layer').innerHTML = ''; if (S.stale) load(); }
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('.dialog')) { $('.dialog').remove(); $$('.scrim.top').forEach(x => x.remove()); return; }
  if ($('.drawer')) fecharCamada();
});
function drawer({ titulo, crumb = '', corpo, rodape, wide }) {
  $('#layer').innerHTML = `<div class="scrim" data-close></div><aside class="drawer ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="drawer-h"><div class="tt"><h3>${titulo}</h3>${crumb ? `<div class="crumb">${crumb}</div>` : ''}</div><button class="btn btn-ghost btn-icon" data-close aria-label="Fechar">${ic('x')}</button></div>
    <div class="drawer-b">${corpo}</div><div class="drawer-f">${rodape}</div></aside>`;
  const el = $('.drawer');
  $$('[data-close]', $('#layer')).forEach(b => (b.onclick = fecharCamada));
  return el;
}
function dialogo({ titulo, texto = '', campos = [], ok = 'Confirmar', perigo = false }) {
  return new Promise(res => {
    const sc = document.createElement('div'); sc.className = 'scrim top';
    const d = document.createElement('div'); d.className = 'dialog'; d.setAttribute('role', 'dialog');
    d.innerHTML = `<div class="dialog-b"><h3>${titulo}</h3>${texto ? `<p>${texto}</p>` : ''}<div class="grid">${campos.map(c => campoHTML(c)).join('')}</div></div>
      <div class="dialog-f"><button class="btn" data-x>Cancelar</button><button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button></div>`;
    document.body.append(sc, d);
    const fim = v => { sc.remove(); d.remove(); res(v); };
    sc.onclick = () => fim(null);
    $('[data-x]', d).onclick = () => fim(null);
    $('[data-ok]', d).onclick = () => fim(ler(d));
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); fim(ler(d)); } });
    setTimeout(() => ($('input,select,textarea', d) || $('[data-ok]', d)).focus(), 20);
  });
}
// campo: {n, l, t, v, o (opções [[v,t]]), ph, hint, cls, suf}
function campoHTML(c) {
  const v = c.v ?? '';
  let inp;
  if (c.t === 'select') inp = `<select class="select" name="${c.n}">${c.vazio != null ? `<option value="">${esc(c.vazio)}</option>` : ''}${c.o.map(([k, t]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  else if (c.t === 'textarea') inp = `<textarea class="textarea" name="${c.n}" placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
  else if (c.t === 'check') return `<label class="check ${c.cls || ''}"><input type="checkbox" name="${c.n}" ${v ? 'checked' : ''}> ${esc(c.l)}</label>`;
  else inp = `<input class="input ${c.t === 'number' ? 'num' : ''}" name="${c.n}" type="${c.t === 'number' ? 'text' : c.t || 'text'}" ${c.t === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(c.ph || '')}" ${c.attr || ''}>`;
  if (c.suf) inp = `<div class="suffix">${inp}<em>${c.suf}</em></div>`;
  return `<label class="field ${c.cls || ''}"><span>${esc(c.l)}</span>${inp}${c.hint ? `<small>${c.hint}</small>` : ''}</label>`;
}
const numero = v => (v === '' || v == null ? '' : String(v).replace(/\s/g, '').replace(',', '.'));
function ler(el) {
  const o = {};
  $$('[name]', el).forEach(i => { o[i.name] = i.type === 'checkbox' ? i.checked : i.classList.contains('num') ? numero(i.value) : i.value; });
  return o;
}

// ---------- destino
function drawerDestino(d) {
  const novo = !d;
  d = d || { estado: 'pendente', provincia: S.fDest.provincia || '' };
  const E = S.meta.estadosDestino;
  let estado = d.estado;
  const recPorBenef = 0;
  const cams = (d.viagens || []).map(id => S.vMap.get(id)).filter(Boolean);
  const el = drawer({
    titulo: novo ? 'Novo destino' : `${esc(d.comunidade)} ${badge(d.situacao, d.nivel)}`,
    crumb: novo ? '' : [d.provincia, d.distrito, d.posto, d.localidade].filter(Boolean).map(esc).join(' › '),
    corpo: `
      ${!novo && d.nivel !== 'ok' ? `<div class="callout ${d.nivel}">${ic(d.nivel === 'critico' ? 'alert' : 'info')}<span>${esc(d.situacao)}${d.data_prevista ? ` — previsto para ${dLong(d.data_prevista)}` : ''}.</span></div>` : ''}
      <div class="sec"><div class="sec-h"><h4>Entrega</h4>${!novo && !['entregue'].includes(d.estado) ? `<div class="input-group" style="flex:none"><button class="btn btn-sm" data-repartir title="Registar o que já foi entregue e deixar o restante como nova entrega">${ic('board', 'sm')} Repartir entrega</button><button class="btn btn-sm" data-ent-hoje>${ic('check', 'sm')} Entregue hoje</button></div>` : ''}</div>
        <div class="seg" id="segEstado" style="margin-bottom:14px">${Object.entries(E).map(([k, t]) => `<button type="button" data-e="${k}" class="${estado === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="grid g2">
          ${campoHTML({ n: 'data_prevista', l: 'Data prevista', t: 'date', v: d.data_prevista })}
          ${campoHTML({ n: 'data_entrega', l: 'Data de entrega', t: 'date', v: d.data_entrega, hint: 'preenchida automaticamente ao marcar entregue' })}
          ${campoHTML({ n: 'benef_atendidos', l: 'Beneficiários atendidos', t: 'number', v: d.benef_atendidos ?? '', ph: d.benef_total ?? '' })}
          ${campoHTML({ n: 'recebido_por', l: 'Recebido por', v: d.recebido_por, ph: 'nome / função' })}
        </div></div>
      ${novo ? '' : `<div class="sec"><div class="sec-h"><h4>Camião</h4>${S.d.viagens.some(v => !['concluida', 'cancelada'].includes(v.estado)) ? `<button class="btn btn-sm" data-atrib>${ic('link', 'sm')} ${cams.length ? 'Adicionar a outro' : 'Atribuir'}</button>` : ''}</div>
        ${cams.length ? `<div class="rows" style="border:1px solid var(--line);border-radius:10px">${cams.map(v => `<div class="row click" data-act="camiao" data-id="${v.id}"><div class="ico-box">${ic('truck')}</div><div class="main-c"><div class="t">${esc(v.codigo)} ${plate(v.matricula)}</div><div class="m">${esc(v.transportadora || 'Sem transportadora')} · ${esc(v.motorista || 'sem motorista')}${v.motorista_tel ? ' · ' + esc(v.motorista_tel) : ''}</div></div>${badge(v.estado_nome, NIVEL_VIAGEM[v.estado])}</div>`).join('')}</div>`
        : `<div class="callout neutro" style="margin:0">${ic('truck')}<span>Ainda sem camião atribuído. Use o <a href="#" data-act="nav" data-k="planeamento">quadro de planeamento</a> ou o botão acima.</span></div>`}</div>
      ${d.kits_baixa || d.kits_sequeiro || !d.itens?.length ? `<div class="sec"><div class="sec-h"><h4>Kits a entregar</h4></div><div class="kv"><div><span>Kit Baixa</span><b>${nf(d.kits_baixa)}</b></div><div><span>Kit Sequeiro</span><b>${nf(d.kits_sequeiro)}</b></div><div><span>Peso estimado</span><b>≈ ${peso(d.peso_kg)}</b></div></div></div>` : ''}
      <div class="sec"><div class="sec-h"><h4>Artigos a entregar ${d.itens?.length ? `<span class="muted">· ${nf(d.volumes, d.volumes % 1 ? 1 : 0)} volumes · ${peso(d.peso_itens)}</span>` : ''}</h4><button type="button" class="btn btn-sm" data-item-add>${ic('plus', 'sm')} Artigo</button></div>
        ${d.itens?.length ? `<div class="picker"><table class="t"><thead><tr><th>Artigo</th><th>Fornecedor</th><th class="num">Volumes</th><th class="num">Peso</th><th></th></tr></thead><tbody>${d.itens.map(i => `<tr class="click" data-item="${i.id}"><td><span class="t1">${esc(i.artigo)}</span><div class="t2">${esc([i.categoria, i.codigo, i.lote ? 'lote ' + i.lote : ''].filter(Boolean).join(' · '))}</div>${i.observacoes ? `<div class="t2">${esc(i.observacoes)}</div>` : ''}</td><td>${esc(i.fornecedor || '')}</td><td class="num">${nf(i.volumes, i.volumes % 1 ? 1 : 0)}</td><td class="num">${peso(i.peso_kg)}</td><td style="width:36px"><button type="button" class="btn btn-ghost btn-xs btn-icon" data-item-del="${i.id}" title="Remover">${ic('x', 'sm')}</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="muted sm">Sem artigos. Use "Artigo" para registar a carga deste destino (produto, volumes e peso).</div>'}</div>
      <div class="sec"><div class="sec-h"><h4>Custo</h4><small>parte do camião repartida por beneficiários</small></div>
        <div class="kv"><div><span>Transporte</span><b>${mt(d.custo_transporte)}</b></div><div><span>Estivas e outros</span><b>${mt(d.custo_outros)}</b></div><div><span>Custo total</span><b>${mt(d.custo_total)}</b></div>
        ${recPorBenef ? `<div><span>Receita</span><b>${mt((d.benef_total || 0) * recPorBenef)}</b></div><div><span>Margem</span><b class="${(d.benef_total || 0) * recPorBenef - d.custo_total < 0 ? 'neg' : 'pos'}">${mt((d.benef_total || 0) * recPorBenef - d.custo_total)}</b></div>` : ''}</div></div>`}
      <div class="sec"><div class="sec-h"><h4>Localização e beneficiários</h4></div><div class="grid g2">
        ${campoHTML({ n: 'comunidade', l: 'Comunidade', v: d.comunidade })}${campoHTML({ n: 'local_entrega', l: 'Local de entrega', v: d.local_entrega })}
        ${campoHTML({ n: 'provincia', l: 'Província', v: d.provincia })}${campoHTML({ n: 'distrito', l: 'Distrito', v: d.distrito })}
        ${campoHTML({ n: 'posto', l: 'Posto Administrativo', v: d.posto })}${campoHTML({ n: 'localidade', l: 'Localidade', v: d.localidade })}
      </div><div class="grid g3" style="margin-top:12px">
        ${campoHTML({ n: 'benef_total', l: 'Beneficiários (total)', t: 'number', v: d.benef_total ?? '' })}${campoHTML({ n: 'benef_baixa', l: 'Baixa', t: 'number', v: d.benef_baixa ?? '' })}${campoHTML({ n: 'benef_sequeiro', l: 'Sequeiro', t: 'number', v: d.benef_sequeiro ?? '' })}
      </div></div>
      <div class="sec"><div class="sec-h"><h4>Observações</h4></div>${campoHTML({ n: 'observacoes', l: '', t: 'textarea', v: d.observacoes, ph: 'Notas, reprogramações, contactos no local…' }).replace('<span></span>', '')}</div>`,
    rodape: `${novo ? '' : `<button class="btn btn-danger left" data-del>${ic('trash', 'sm')} Eliminar</button>`}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button>`,
  });
  $('#segEstado', el).onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; estado = b.dataset.e; $$('#segEstado button', el).forEach(x => x.classList.toggle('on', x === b)); if (['entregue', 'parcial'].includes(estado) && !$('[name=data_entrega]', el).value) $('[name=data_entrega]', el).value = S.d.hoje; };
  $('[data-save]', el).onclick = async () => {
    const b = { ...ler($('.drawer-b', el)), estado };
    if (!b.comunidade) return toast('Indique a comunidade', true);
    await mutate(() => novo ? api(`/api/missoes/${S.missao}/destinos`, { method: 'POST', body: b }) : api(`/api/destinos/${d.id}`, { method: 'PUT', body: b }), novo ? 'Destino criado' : 'Destino actualizado');
    fecharCamada();
  };
  $('[data-ent-hoje]', el)?.addEventListener('click', async () => { await mutate(() => api(`/api/destinos/${d.id}`, { method: 'PUT', body: { estado: 'entregue', data_entrega: S.d.hoje } }), `${d.comunidade}: entrega registada`); fecharCamada(); });
  const formItem = async (it) => dialogo({ titulo: it ? 'Editar artigo' : 'Novo artigo', ok: 'Guardar', campos: [
    { n: 'artigo', l: 'Artigo / descrição', v: it?.artigo }, { n: 'codigo', l: 'Código', v: it?.codigo }, { n: 'categoria', l: 'Categoria', v: it?.categoria },
    { n: 'volumes', l: 'Nº de volumes', t: 'number', v: it?.volumes ?? '' }, { n: 'peso_kg', l: 'Peso total (kg)', t: 'number', v: it?.peso_kg ?? '' },
    { n: 'lote', l: 'Lote', v: it?.lote }, { n: 'fornecedor', l: 'Fornecedor', v: it?.fornecedor }, { n: 'observacoes', l: 'Observações', t: 'textarea', v: it?.observacoes } ] });
  $('[data-item-add]', el)?.addEventListener('click', async () => {
    const r = await formItem(null); if (!r) return;
    await mutate(() => api(`/api/destinos/${d.id}/itens`, { method: 'POST', body: r }), 'Artigo adicionado'); drawerDestino(S.dMap.get(d.id));
  });
  el.addEventListener('click', async e => {
    const del = e.target.closest('[data-item-del]');
    if (del) { e.stopPropagation(); if (!await dialogo({ titulo: 'Remover artigo?', ok: 'Remover', perigo: true })) return; await mutate(() => api(`/api/itens/${del.dataset.itemDel}`, { method: 'DELETE' }), 'Artigo removido'); return drawerDestino(S.dMap.get(d.id)); }
    const tr = e.target.closest('[data-item]'); if (!tr) return;
    const it = d.itens.find(x => x.id === Number(tr.dataset.item));
    const r = await formItem(it); if (!r) return;
    await mutate(() => api(`/api/itens/${it.id}`, { method: 'PUT', body: r }), 'Artigo actualizado'); drawerDestino(S.dMap.get(d.id));
  });
  $('[data-repartir]', el)?.addEventListener('click', async () => {
    const b0 = d.benef_baixa || 0, s0 = d.benef_sequeiro || 0;
    const r = await dialogo({ titulo: `Repartir entrega — ${esc(d.comunidade)}`, ok: 'Repartir',
      texto: `Previsto: <b>${kitTexto(d)}</b>. Indique o que já foi entregue; o restante passa a uma nova entrega pendente (${esc(d.comunidade.replace(/ \(\d+\.ª entrega\)$/, ''))} — 2.ª entrega).`,
      campos: [
        { n: 'baixa', l: `Kits Baixa entregues (de ${b0})`, t: 'number', v: b0 ? '' : 0 },
        { n: 'sequeiro', l: `Kits Sequeiro entregues (de ${s0})`, t: 'number', v: d.estado === 'parcial' && !b0 ? d.benef_atendidos ?? '' : '' },
        { n: 'data_entrega', l: 'Data da entrega', t: 'date', v: d.data_entrega || S.d.hoje },
        { n: 'data_prevista', l: 'Data prevista para o restante', t: 'date', v: d.data_prevista && d.data_prevista >= S.d.hoje ? d.data_prevista : '' },
        { n: 'observacoes', l: 'Observações do restante', ph: 'ex.: aguarda guia da AQI' },
      ] });
    if (!r) return;
    await mutate(() => api(`/api/destinos/${d.id}/repartir`, { method: 'POST', body: r }), 'Entrega repartida');
    fecharCamada();
  });
  $('[data-atrib]', el)?.addEventListener('click', async () => { if (await escolherCamiao([d.id])) fecharCamada(); });
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!await dialogo({ titulo: 'Eliminar destino?', texto: `${esc(d.comunidade)} será removido do projecto e dos camiões.`, ok: 'Eliminar', perigo: true })) return;
    await mutate(() => api(`/api/destinos/${d.id}`, { method: 'DELETE' }), 'Destino eliminado'); fecharCamada();
  });
}
async function escolherCamiao(ids) {
  const V = S.d.viagens.filter(v => !['concluida', 'cancelada'].includes(v.estado));
  if (!V.length) { toast('Não há camiões abertos. Crie um novo.', true); return false; }
  const r = await dialogo({ titulo: 'Atribuir a camião', texto: `${ids.length} destino(s) serão adicionados ao camião escolhido.`, ok: 'Atribuir',
    campos: [{ n: 'v', l: 'Camião', t: 'select', v: V[0].id, o: V.map(v => [v.id, `${v.codigo} · ${v.matricula || 'sem matrícula'} · ${v.transportadora || 'sem transportadora'} · ${v.destinos.length} destinos`]) }] });
  if (!r) return false;
  await atribuir(Number(r.v), ids);
  return true;
}

// ---------- camião
const PASSOS = [['planeada', 'Planeado'], ['carregada', 'Carregado'], ['em_transito', 'Em trânsito'], ['concluida', 'Concluído']];
function drawerCamiao(v, pre = {}) {
  const novo = !v;
  const st = { modo_preco: 'global', estado: 'planeada', origem: S.d.viagens.at(-1)?.origem || '', ...(v || {}), ...pre };
  let estado = st.estado, modo = st.modo_preco;
  let sel = (pre.destinos || v?.destinos || []).map(x => ({ destino_id: x.destino_id, preco: x.preco || 0 }));
  const custosV = v ? S.d.custos.filter(c => c.viagem_id === v.id) : [];
  const el = drawer({
    wide: true,
    titulo: novo ? 'Novo camião' : `${esc(v.codigo)} ${plate(v.matricula)} ${badge(v.estado_nome, NIVEL_VIAGEM[v.estado])}`,
    crumb: novo ? 'Viagem subcontratada' : `${esc(v.transportadora || 'Sem transportadora')}${v.motorista ? ' · ' + esc(v.motorista) : ''}`,
    corpo: `
      <div class="sec"><div class="sec-h"><h4>Estado da viagem</h4><button type="button" class="btn btn-ghost btn-sm ${estado === 'cancelada' ? 'btn-danger' : ''}" data-cancel>${estado === 'cancelada' ? 'Reactivar' : 'Cancelar viagem'}</button></div>
        <div class="stepper" id="passos"></div>
        <div class="grid g3" style="margin-top:12px">
          ${campoHTML({ n: 'data_saida_prevista', l: 'Saída prevista', t: 'date', v: st.data_saida_prevista })}
          ${campoHTML({ n: 'data_saida', l: 'Saída real', t: 'date', v: st.data_saida })}
          ${campoHTML({ n: 'data_regresso', l: 'Conclusão / regresso', t: 'date', v: st.data_regresso })}
        </div></div>
      <div class="sec"><div class="sec-h"><h4>Transportadora e veículo</h4></div><div class="grid g3">
        <label class="field"><span>Transportadora</span><div class="input-group"><select class="select" name="transportadora_id"><option value="">Seleccionar…</option>${S.transp.map(t => `<option value="${t.id}" ${String(st.transportadora_id) === String(t.id) ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select><button type="button" class="btn btn-icon" data-nova-t title="Nova transportadora">${ic('plus')}</button></div></label>
        ${campoHTML({ n: 'matricula', l: 'Matrícula', v: st.matricula, ph: 'AAA-000-MC', attr: 'list="lMat" style="text-transform:uppercase"' })}
        ${campoHTML({ n: 'matricula_reboque', l: 'Reboque', v: st.matricula_reboque, ph: 'opcional', attr: 'style="text-transform:uppercase"' })}
        ${campoHTML({ n: 'motorista', l: 'Motorista', v: st.motorista, attr: 'list="lMot"' })}
        ${campoHTML({ n: 'motorista_tel', l: 'Telefone do motorista', t: 'tel', v: st.motorista_tel, ph: '84 000 0000' })}
        ${campoHTML({ n: 'capacidade_t', l: 'Capacidade', t: 'number', v: st.capacidade_t ?? '', suf: 't' })}
        ${campoHTML({ n: 'origem', l: 'Origem / armazém', v: st.origem })}
        ${campoHTML({ n: 'carga', l: 'Carga', v: st.carga, ph: 'kits de insumos…', cls: 'span2' })}
      </div><datalist id="lMat"></datalist><datalist id="lMot"></datalist></div>
      <div class="sec"><div class="sec-h"><h4>Destinos <span class="muted" id="cntSel"></span></h4>
        <div class="seg" id="segModo"><button type="button" data-m="global" class="${modo === 'global' ? 'on' : ''}">Valor global</button><button type="button" data-m="por_destino" class="${modo === 'por_destino' ? 'on' : ''}">Preço por destino</button></div></div>
        <div id="selecionados"></div>
        <div class="picker" style="margin-top:12px"><div class="picker-h"><div class="search" style="flex:1">${ic('search', 'sm')}<input class="input" id="qPick" placeholder="Adicionar destinos — procurar por comunidade, distrito, data…"></div>
          <label class="check sm" style="white-space:nowrap"><input type="checkbox" id="soLivres" checked> Só sem camião</label></div><div class="picker-b" id="pick"></div></div></div>
      <div class="sec"><div class="sec-h"><h4>Carga</h4>${novo ? '<small>a guia de carga fica disponível depois de criar o camião</small>' : `<a class="btn btn-sm" href="/guia/${v.id}" target="_blank" rel="noopener">${ic('download', 'sm')} Guia de carga</a>`}</div>
        <div class="kv" id="carga"></div><div id="cargaAviso"></div></div>
      <div class="sec"><div class="sec-h"><h4>Preço e pagamento</h4></div>
        <div class="grid g3">
          <div id="boxGlobal">${campoHTML({ n: 'preco_global', l: 'Valor global da viagem', t: 'number', v: st.preco_global || '', suf: 'MT' })}</div>
          ${campoHTML({ n: 'adiantamento', l: 'Adiantamento pago', t: 'number', v: st.adiantamento || '', suf: 'MT' })}
          ${campoHTML({ n: 'valor_pago', l: 'Restante pago', t: 'number', v: st.valor_pago || '', suf: 'MT' })}
        </div>
        <div class="total-line"><span><span class="muted">Valor do transporte</span><br><b id="totT">—</b></span><span style="text-align:right"><span class="muted">Saldo a pagar</span><br><b id="saldoT">—</b></span><span style="text-align:right"><span class="muted">Custo por beneficiário</span><br><b id="porB">—</b></span></div>
        <div style="margin-top:12px">${campoHTML({ n: 'observacoes', l: 'Observações', t: 'textarea', v: st.observacoes, ph: 'Condições acordadas, contactos, rota…' })}</div></div>
      ${novo ? '' : `<div class="sec"><div class="sec-h"><h4>Notas de débito</h4><button type="button" class="btn btn-sm" data-nd-add>${ic('plus', 'sm')} Nota de débito</button></div>
        ${v.notas?.length ? `<table class="mini-t">${v.notas.map(id => S.d.notas.find(n => n.id === id)).map(n => `<tr class="click" data-act="nd" data-id="${n.id}" style="cursor:pointer"><td><b>${esc(n.numero)}</b> · ${esc(n.motivo_nome)}<div class="muted sm">${esc(n.linhas.map(l => `${nf(l.quantidade)} × ${l.artigo}`).join('; '))}</div></td><td class="num" style="text-align:right">${mt2(n.valor)}<div>${badge(n.estado_nome, NIVEL_ND[n.estado])}</div></td></tr>`).join('')}</table>`
        : '<div class="muted sm">Sem notas de débito. Registe aqui faltas ou danos na mercadoria transportada.</div>'}</div>`}
      ${novo ? '' : `<div class="sec"><div class="sec-h"><h4>Estivas e outros custos deste camião</h4><button type="button" class="btn btn-sm" data-custo-add>${ic('plus', 'sm')} Adicionar</button></div>
        ${custosV.length ? `<table class="mini-t">${custosV.map(c => `<tr class="click" data-act="custo" data-id="${c.id}" style="cursor:pointer"><td>${esc(c.categoria_nome)}<div class="muted sm">${esc(c.descricao || '')} · ${dLong(c.data)}</div></td><td class="num" style="text-align:right">${mt2(c.valor)}<div>${c.pago ? badge('Pago', 'ok') : badge('Por pagar', 'alerta')}</div></td></tr>`).join('')}</table>`
        : '<div class="muted sm">Sem custos adicionais. Registe aqui as estivas de carga e descarga.</div>'}</div>`}`,
    rodape: `${novo ? '' : `<button class="btn btn-danger left" data-del>${ic('trash', 'sm')} Eliminar</button>`}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>${novo ? 'Criar camião' : 'Guardar alterações'}</button>`,
  });

  const desenharPassos = () => {
    const iA = PASSOS.findIndex(p => p[0] === estado);
    $('#passos', el).innerHTML = PASSOS.map(([k, t], i) => `<button type="button" data-p="${k}" class="${k === estado ? 'on' : i < iA ? 'done' : ''}">${i < iA ? ic('check', 'sm') : ''}${t}</button>`).join('') +
      (estado === 'cancelada' ? '<button type="button" class="cancel on">Cancelada</button>' : '');
  };
  desenharPassos();
  $('#passos', el).onclick = e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    estado = b.dataset.p;
    if (estado === 'em_transito' && !$('[name=data_saida]', el).value) $('[name=data_saida]', el).value = S.d.hoje;
    if (estado === 'concluida' && !$('[name=data_regresso]', el).value) $('[name=data_regresso]', el).value = S.d.hoje;
    desenharPassos();
  };
  $('[data-cancel]', el).onclick = () => { estado = estado === 'cancelada' ? 'planeada' : 'cancelada'; desenharPassos(); };

  const total = () => {
    const t = modo === 'por_destino' ? sum(sel, x => x.preco) : Number(numero($('[name=preco_global]', el).value)) || 0;
    const pago = (Number(numero($('[name=adiantamento]', el).value)) || 0) + (Number(numero($('[name=valor_pago]', el).value)) || 0) + (v?.nd_desconto || 0);
    const benef = sum(sel, x => S.dMap.get(x.destino_id)?.benef_total);
    $('#totT', el).textContent = mt2(t);
    $('#saldoT', el).textContent = mt2(t - pago);
    $('#saldoT', el).className = t - pago > 0 ? 'neg' : '';
    $('#porB', el).textContent = benef ? mt(t / benef) : '—';
    $('#boxGlobal', el).style.visibility = modo === 'global' ? 'visible' : 'hidden';
    $('#cntSel', el).textContent = `· ${sel.length} · ${nf(benef)} beneficiários`;
    const ds = sel.map(x => S.dMap.get(x.destino_id)).filter(Boolean);
    const kb = sum(ds, d => d.kits_baixa), ks = sum(ds, d => d.kits_sequeiro), kgT = sum(ds, d => d.peso_kg);
    const cap = Number(numero($('[name=capacidade_t]', el).value)) || 0;
    const excede = cap && kgT > cap * 1000;
    $('#carga', el).innerHTML = `<div><span>Kit Baixa</span><b>${nf(kb)}</b></div><div><span>Kit Sequeiro</span><b>${nf(ks)}</b></div><div><span>Peso estimado</span><b class="${excede ? 'neg' : ''}">≈ ${peso(kgT)}${cap ? ` de ${nf(cap)} t` : ''}</b></div>`;
    const semPeso = [...new Set([...(kb ? S.d.kits.porConfirmar.baixa : []), ...(ks ? S.d.kits.porConfirmar.sequeiro : [])])];
    $('#cargaAviso', el).innerHTML = (excede ? `<div class="callout critico">${ic('alert')}<span>A carga estimada (${peso(kgT)}) ultrapassa a capacidade do camião (${nf(cap)} t).</span></div>` : '') +
      (semPeso.length && kgT ? `<div class="muted sm" style="margin-top:8px">Peso calculado sem: ${esc(semPeso.join(', '))}. Pode indicar o peso destes artigos em <a href="#" data-act="nav" data-k="kits">Kits de insumos</a>.</div>` : '');
  };
  const desenharSel = () => {
    const box = $('#selecionados', el);
    box.innerHTML = sel.length ? `<div class="picker"><table class="t"><thead><tr><th style="width:28px">#</th><th>Comunidade</th><th>Distrito</th><th>Previsto</th><th>Kits</th>${modo === 'por_destino' ? '<th class="num" style="width:150px">Preço (MT)</th>' : ''}<th style="width:40px"></th></tr></thead><tbody>
      ${sel.map((x, i) => { const d = S.dMap.get(x.destino_id); return `<tr><td class="muted">${i + 1}</td><td><span class="t1">${esc(d.comunidade)}</span><div class="t2">${esc(d.local_entrega || '')}</div></td><td>${esc(d.distrito)}</td><td class="nowrap">${dLong(d.data_prevista)}</td><td class="nowrap">${kitTag(d, true)}</td>
        ${modo === 'por_destino' ? `<td class="num"><input class="input num" data-preco="${d.id}" value="${x.preco || ''}" inputmode="decimal" placeholder="0" style="height:30px"></td>` : ''}
        <td><button type="button" class="btn btn-ghost btn-xs btn-icon" data-rm="${d.id}" title="Remover">${ic('x', 'sm')}</button></td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="callout neutro" style="margin:0">${ic('pin')}<span>Nenhum destino ainda. Adicione abaixo — pode juntar vários destinos no mesmo camião.</span></div>`;
    total();
  };
  const desenharPick = () => {
    const q = $('#qPick', el).value, so = $('#soLivres', el).checked;
    const ids = new Set(sel.map(x => x.destino_id));
    const L = S.d.destinos.filter(d => !ids.has(d.id) && d.estado !== 'cancelado' && (!so || !d.viagens.length) &&
      (!q || casa([d.comunidade, d.distrito, d.provincia, d.local_entrega, dm(d.data_prevista), dLong(d.data_prevista)].join(' '), q)))
      .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)));
    $('#pick', el).innerHTML = L.length ? `<table class="t"><tbody>${L.map(d => `<tr class="click" data-add="${d.id}"><td><span class="t1">${esc(d.comunidade)}</span> <span class="t2">${esc(d.distrito)} · ${esc(d.provincia)}</span></td><td class="nowrap">${dLong(d.data_prevista)}</td><td class="nowrap">${kitTag(d, true)}</td><td>${d.viagens.length ? `<span class="t2">em ${esc(d.viagens.map(id => S.vMap.get(id)?.codigo).join(', '))}</span>` : ''}</td><td style="width:90px;text-align:right"><button type="button" class="btn btn-xs">${ic('plus', 'sm')} Adicionar</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty sm">Nenhum destino disponível com este filtro.</div>';
  };
  desenharSel(); desenharPick();
  $('#segModo', el).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; modo = b.dataset.m; $$('#segModo button', el).forEach(x => x.classList.toggle('on', x === b)); desenharSel(); };
  $('#qPick', el).oninput = desenharPick; $('#soLivres', el).onchange = desenharPick;
  $('#pick', el).onclick = e => { const r = e.target.closest('[data-add]'); if (!r) return; sel.push({ destino_id: Number(r.dataset.add), preco: 0 }); desenharSel(); desenharPick(); };
  $('#selecionados', el).onclick = e => { const b = e.target.closest('[data-rm]'); if (!b) return; sel = sel.filter(x => x.destino_id !== Number(b.dataset.rm)); desenharSel(); desenharPick(); };
  $('#selecionados', el).oninput = e => { const id = e.target.dataset.preco; if (!id) return; sel.find(x => x.destino_id === Number(id)).preco = Number(numero(e.target.value)) || 0; total(); };
  $$('[name=preco_global],[name=adiantamento],[name=valor_pago],[name=capacidade_t]', el).forEach(i => (i.oninput = total));

  $('[data-nova-t]', el).onclick = async () => {
    const r = await dialogo({ titulo: 'Nova transportadora', ok: 'Criar', campos: [{ n: 'nome', l: 'Nome da empresa' }, { n: 'nuit', l: 'NUIT' }, { n: 'telefone', l: 'Telefone' }] });
    if (!r?.nome) return;
    const { id } = await api('/api/transportadoras', { method: 'POST', body: r });
    S.transp = await api('/api/transportadoras');
    $('[name=transportadora_id]', el).add(new Option(r.nome, id, true, true));
    toast('Transportadora criada');
  };
  api('/api/frota-conhecida').then(frota => {
    $('#lMat', el).innerHTML = [...new Set(frota.map(f => f.matricula))].map(m => `<option value="${esc(m)}">`).join('');
    $('#lMot', el).innerHTML = [...new Set(frota.map(f => f.motorista).filter(Boolean))].map(m => `<option value="${esc(m)}">`).join('');
    $('[name=matricula]', el).addEventListener('change', e => {
      const f = frota.find(x => x.matricula === e.target.value.trim().toUpperCase()); if (!f) return;
      for (const k of ['motorista', 'motorista_tel', 'capacidade_t']) if (!$(`[name=${k}]`, el).value && f[k]) $(`[name=${k}]`, el).value = f[k];
      if (!$('[name=transportadora_id]', el).value && f.transportadora_id) $('[name=transportadora_id]', el).value = f.transportadora_id;
      toast('Dados do motorista preenchidos a partir de viagens anteriores');
    });
  });
  $('[data-nd-add]', el)?.addEventListener('click', () => drawerND(null, { viagem_id: v.id }));
  $('[data-custo-add]', el)?.addEventListener('click', () => drawerCusto(null, { viagem_id: v.id, categoria: 'estiva_descarga' }, () => drawerCamiao(S.vMap.get(v.id))));
  $('[data-save]', el).onclick = async () => {
    const b = { ...ler($('.drawer-b', el)), estado, modo_preco: modo, destinos: sel };
    delete b[''];
    if (!sel.length && !await dialogo({ titulo: 'Guardar sem destinos?', texto: 'Este camião ainda não tem destinos atribuídos.', ok: 'Guardar mesmo assim' })) return;
    await mutate(() => novo ? api(`/api/missoes/${S.missao}/viagens`, { method: 'POST', body: b }) : api(`/api/viagens/${v.id}`, { method: 'PUT', body: b }), novo ? 'Camião criado' : 'Camião actualizado');
    if (pre.destinos) { pre.destinos.forEach(x => { S.sel.delete(x.destino_id); S.bsel.delete(x.destino_id); }); }
    fecharCamada();
  };
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!await dialogo({ titulo: `Eliminar ${esc(v.codigo)}?`, texto: 'Os destinos voltam a ficar sem camião. Os custos associados ficam como custos gerais.', ok: 'Eliminar', perigo: true })) return;
    await mutate(() => api(`/api/viagens/${v.id}`, { method: 'DELETE' }), 'Camião eliminado'); fecharCamada();
  });
}

// ---------- custo
function drawerCusto(c, pre = {}, voltar) {
  const novo = !c;
  const st = { quantidade: 1, data: S.d.hoje, categoria: 'estiva_descarga', ...(c || {}), ...pre };
  const el = drawer({
    titulo: novo ? 'Registar custo' : 'Editar custo',
    crumb: st.viagem_id ? `Camião ${esc(S.vMap.get(Number(st.viagem_id))?.codigo || '')}` : '',
    corpo: `<div class="sec"><div class="grid g2">
      ${campoHTML({ n: 'categoria', l: 'Rubrica', t: 'select', v: st.categoria, o: Object.entries(S.meta.categorias) })}
      ${campoHTML({ n: 'data', l: 'Data', t: 'date', v: st.data })}
      ${campoHTML({ n: 'descricao', l: 'Descrição', v: st.descricao, ph: 'ex.: 6 estivadores — descarga em Mudumeia', cls: 'spanall' })}
      ${campoHTML({ n: 'quantidade', l: 'Quantidade', t: 'number', v: st.quantidade, hint: 'pessoas, dias, litros…' })}
      ${campoHTML({ n: 'valor_unitario', l: 'Valor unitário', t: 'number', v: st.valor_unitario || '', suf: 'MT' })}
    </div><div class="total-line"><span class="muted">Total</span><b id="totC">—</b></div></div>
    <div class="sec"><div class="sec-h"><h4>Ligação</h4><small>sem destino, o valor é repartido pelos destinos do camião</small></div><div class="grid g2">
      ${campoHTML({ n: 'viagem_id', l: 'Camião', t: 'select', v: st.viagem_id, vazio: '— nenhum (custo geral) —', o: S.d.viagens.map(v => [v.id, `${v.codigo} · ${v.matricula || 'sem matrícula'}`]) })}
      ${campoHTML({ n: 'destino_id', l: 'Destino', t: 'select', v: st.destino_id, vazio: '— todos os do camião —', o: S.d.destinos.map(d => [d.id, `${d.comunidade} (${d.distrito})`]) })}
      ${campoHTML({ n: 'fornecedor', l: 'Pago a', v: st.fornecedor, ph: 'nome / empresa' })}
      <div class="field"><span>&nbsp;</span>${campoHTML({ n: 'pago', l: 'Já foi pago', t: 'check', v: st.pago })}</div>
    </div></div>
    <div class="sec"><div class="sec-h"><h4>Observações</h4></div>${campoHTML({ n: 'observacoes', l: 'Observações', t: 'textarea', v: st.observacoes, ph: 'Recibo, contacto, condições…' })}</div>`,
    rodape: `${novo ? '' : `<button class="btn btn-danger left" data-del>${ic('trash', 'sm')} Eliminar</button>`}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button>`,
  });
  const calc = () => { const f = ler(el); $('#totC', el).textContent = mt2((Number(f.quantidade) || 0) * (Number(f.valor_unitario) || 0)); };
  calc(); el.addEventListener('input', calc);
  const fim = () => (voltar ? voltar() : fecharCamada());
  $('[data-save]', el).onclick = async () => {
    const b = ler($('.drawer-b', el));
    await mutate(() => novo ? api(`/api/missoes/${S.missao}/custos`, { method: 'POST', body: b }) : api(`/api/custos/${c.id}`, { method: 'PUT', body: b }), 'Custo guardado');
    fim();
  };
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!await dialogo({ titulo: 'Eliminar custo?', ok: 'Eliminar', perigo: true })) return;
    await mutate(() => api(`/api/custos/${c.id}`, { method: 'DELETE' }), 'Custo eliminado'); fim();
  });
}

// ---------- transportadora
function drawerTransp(t) {
  const novo = !t;
  const vs = t ? S.d.viagens.filter(v => v.transportadora_id === t.id) : [];
  const el = drawer({
    titulo: novo ? 'Nova transportadora' : esc(t.nome), crumb: novo ? '' : `${t.n_viagens} viagem(ns) registadas`,
    corpo: `<div class="sec"><div class="grid g2">
      ${campoHTML({ n: 'nome', l: 'Nome da empresa', v: t?.nome, cls: 'spanall' })}${campoHTML({ n: 'nuit', l: 'NUIT', v: t?.nuit })}${campoHTML({ n: 'contacto', l: 'Pessoa de contacto', v: t?.contacto })}
      ${campoHTML({ n: 'telefone', l: 'Telefone', t: 'tel', v: t?.telefone })}${campoHTML({ n: 'email', l: 'Email', t: 'email', v: t?.email })}
      ${campoHTML({ n: 'observacoes', l: 'Observações', t: 'textarea', v: t?.observacoes, cls: 'spanall' })}</div></div>
      ${vs.length ? `<div class="sec"><div class="sec-h"><h4>Camiões neste projecto</h4></div><table class="mini-t">${vs.map(v => `<tr><td>${esc(v.codigo)} ${plate(v.matricula)}</td><td>${badge(v.estado_nome, NIVEL_VIAGEM[v.estado])}</td><td class="num" style="text-align:right">${mt(v.custo_transporte)}</td></tr>`).join('')}</table></div>` : ''}`,
    rodape: `${!novo && !t.n_viagens ? `<button class="btn btn-danger left" data-del>${ic('trash', 'sm')} Eliminar</button>` : ''}${!novo && vs.length ? `<a class="btn left" href="/api/missoes/${S.missao}/transportadoras/${t.id}/mapa.xlsx">${ic('download', 'sm')} Mapa (Excel)</a><a class="btn" href="/mapa-transportadora/${S.missao}/${t.id}" target="_blank" rel="noopener">Imprimir mapa</a>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button>`,
  });
  $('[data-save]', el).onclick = async () => {
    const b = ler(el); if (!b.nome) return toast('Indique o nome', true);
    await mutate(() => novo ? api('/api/transportadoras', { method: 'POST', body: b }) : api(`/api/transportadoras/${t.id}`, { method: 'PUT', body: b }), 'Transportadora guardada');
    fecharCamada();
  };
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!await dialogo({ titulo: 'Eliminar transportadora?', ok: 'Eliminar', perigo: true })) return;
    await mutate(() => api(`/api/transportadoras/${t.id}`, { method: 'DELETE' }), 'Eliminada'); fecharCamada();
  });
}

// ---------- missão (dados + receita)
function drawerMissao(m) {
  const novo = !m;
  m = m || { receita_modo: 'global' };
  let modo = m.receita_modo || 'global';
  const benef = novo ? 0 : S.p.kpis.benef_total;
  const el = drawer({
    titulo: novo ? 'Novo projecto' : 'Definições do projecto',
    corpo: `<div class="sec"><div class="sec-h"><h4>Identificação</h4></div><div class="grid g2">
      ${campoHTML({ n: 'nome', l: 'Nome do projecto', v: m.nome, cls: 'spanall' })}
      ${campoHTML({ n: 'cliente', l: 'Cliente / financiador', v: m.cliente })}
      <div></div>
      ${campoHTML({ n: 'data_inicio', l: 'Início', t: 'date', v: m.data_inicio })}${campoHTML({ n: 'data_fim', l: 'Fim', t: 'date', v: m.data_fim })}
      ${campoHTML({ n: 'descricao', l: 'Descrição', t: 'textarea', v: m.descricao, cls: 'spanall' })}</div></div>
    <div class="sec"><div class="sec-h"><h4>Orçamento do projecto</h4><small>valor do projecto (quanto o cliente paga)</small></div>
      <div class="seg" id="segRec" style="margin-bottom:12px"><button type="button" data-m="global" class="${modo === 'global' ? 'on' : ''}">Valor global</button><button type="button" data-m="por_beneficiario" class="${modo === 'por_beneficiario' ? 'on' : ''}">Por beneficiário</button></div>
      <div class="grid g2">
        <div id="rGlobal">${campoHTML({ n: 'receita_valor', l: 'Valor global contratado', t: 'number', v: m.receita_valor || '', suf: 'MT' })}</div>
        <div id="rUnit">${campoHTML({ n: 'receita_unit', l: 'Preço por beneficiário', t: 'number', v: m.receita_unit || '', suf: 'MT', hint: `${nf(benef)} beneficiários previstos` })}</div>
      </div>
      <div class="total-line"><span class="muted">Receita total prevista</span><b id="recT">—</b></div></div>
    ${novo ? '' : `<div class="sec"><div class="callout neutro" style="margin:0">${ic('info')}<span>O orçamento de custos por rubrica é definido em <a href="#" data-act="nav" data-k="financeiro">Orçamento e margem</a>.</span></div></div>`}`,
    rodape: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save>${novo ? 'Criar projecto' : 'Guardar'}</button>`,
  });
  const upd = () => {
    $('#rGlobal', el).hidden = modo !== 'global'; $('#rUnit', el).hidden = modo !== 'por_beneficiario';
    const f = ler(el);
    $('#recT', el).textContent = mt(modo === 'global' ? Number(f.receita_valor) || 0 : (Number(f.receita_unit) || 0) * benef);
  };
  upd(); el.addEventListener('input', upd);
  $('#segRec', el).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; modo = b.dataset.m; $$('#segRec button', el).forEach(x => x.classList.toggle('on', x === b)); upd(); };
  $('[data-save]', el).onclick = async () => {
    const b = { ...ler($('.drawer-b', el)), receita_modo: modo };
    if (!b.nome) return toast('Indique o nome do projecto', true);
    if (novo) {
      const { id } = await api('/api/missoes', { method: 'POST', body: b });
      S.missoes = await api('/api/missoes'); S.missao = id; localStorage.setItem('missao', id);
      fecharCamada(); await load(); toast('Projecto criado — adicione os destinos'); return;
    }
    await mutate(() => api(`/api/missoes/${m.id}`, { method: 'PUT', body: b }), 'Projecto actualizado');
    S.missoes = await api('/api/missoes'); render();
    fecharCamada();
  };
}

// ============================================================ acções (delegação)
const ACT = {
  nav: el => { if ($('.drawer')) fecharCamada(); S.page = el.dataset.k; localStorage.setItem('pagina', S.page); history.replaceState(null, '', '#' + S.page); render(); window.scrollTo(0, 0); },
  destino: el => drawerDestino(S.dMap.get(Number(el.dataset.id))),
  'destino-novo': () => drawerDestino(null),
  camiao: el => drawerCamiao(S.vMap.get(Number(el.dataset.id))),
  'camiao-novo': () => drawerCamiao(null),
  custo: el => drawerCusto(S.d.custos.find(c => c.id === Number(el.dataset.id))),
  'custo-novo': () => drawerCusto(null),
  'conta-menu': el => menuConta(el),
  'util-novo': () => dialogoUtilizador(null),
  util: el => dialogoUtilizador((S.utilizadores || []).find(u => u.id === Number(el.dataset.id))),
  'abrir-proj': el => { S.missao = Number(el.dataset.id); localStorage.setItem('missao', S.missao); S.sel.clear(); S.bsel.clear(); S.page = 'overview'; history.replaceState(null, '', '#overview'); load(); },
  'missao-nova': () => drawerMissao(null),
  'fact-nova': () => dialogoFactura(null),
  fact: el => dialogoFactura(((S.proj || []).find(x => x.id == S.missao)?.facturas || []).find(x => x.id === Number(el.dataset.id))),
  nd: el => drawerND(S.d.notas.find(n => n.id === Number(el.dataset.id))),
  'nd-novo': () => drawerND(null),
  transp: el => drawerTransp(S.transp.find(t => t.id === Number(el.dataset.id))),
  'transp-novo': () => drawerTransp(null),
  missao: () => drawerMissao(S.d.missao),
  fboard: el => { S.fBoard.provincia = el.dataset.v; renderPage(); },
  fcrono: el => { S.fCrono.provincia = el.dataset.v; renderPage(); },
  fcam: el => { S.fCam.estado = el.dataset.v; renderPage(); },
  'fdest-vista': el => { S.fDest.vista = el.dataset.v; renderPage(); },
  'ver-atrasos': () => { S.fDest.vista = 'atrasados'; ACT.nav({ dataset: { k: 'destinos' } }); },
  entregue: async el => { const d = S.dMap.get(Number(el.dataset.id)); const r = await dialogo({ titulo: `Registar entrega — ${esc(d.comunidade)}`, ok: 'Registar', campos: [{ n: 'data_entrega', l: 'Data de entrega', t: 'date', v: S.d.hoje }, { n: 'benef_atendidos', l: 'Beneficiários atendidos', t: 'number', v: d.benef_total ?? '' }] }); if (r) mutate(() => api(`/api/destinos/${d.id}`, { method: 'PUT', body: { ...r, estado: 'entregue' } }), 'Entrega registada'); },
  reprogramar: el => reprogramar([Number(el.dataset.id)]),
  'camiao-coluna': el => {
    const dia = el.dataset.dia || null;
    const livres = S.d.destinos.filter(d => (d.data_prevista || null) === dia && !d.viagens.length && !['entregue', 'parcial', 'cancelado'].includes(d.estado) && (!el.dataset.prov || d.provincia === el.dataset.prov));
    const escolhidos = livres.filter(d => S.bsel.has(d.id));
    const L = escolhidos.length ? escolhidos : livres;
    const longe = L.some(d => d.provincia === 'Inhambane');
    drawerCamiao(null, { destinos: L.map(d => ({ destino_id: d.id })), data_saida_prevista: dia ? (longe ? addDias(dia, -1) : dia) : null,
      observacoes: [...new Set(L.map(d => d.local_entrega).filter(Boolean))].length ? 'Locais: ' + [...new Set(L.map(d => d.local_entrega).filter(Boolean))].join('; ') : '' });
  },
  'atribuir-coluna': el => {
    const dia = el.dataset.dia || null;
    const livres = S.d.destinos.filter(d => (d.data_prevista || null) === dia && !d.viagens.length && !['entregue', 'parcial', 'cancelado'].includes(d.estado) && (!el.dataset.prov || d.provincia === el.dataset.prov));
    const esc_ = livres.filter(d => S.bsel.has(d.id));
    escolherCamiao((esc_.length ? esc_ : livres).map(d => d.id));
  },
  'sel-camiao': () => drawerCamiao(null, { destinos: [...S.sel].map(id => ({ destino_id: id })) }),
  'sel-atribuir': async () => { if (await escolherCamiao([...S.sel])) { S.sel.clear(); renderPage(); } },
  'sel-entregue': async () => {
    const ids = [...S.sel];
    const r = await dialogo({ titulo: `Marcar ${ids.length} destino(s) como entregues`, ok: 'Marcar entregues', campos: [{ n: 'data_entrega', l: 'Data de entrega', t: 'date', v: S.d.hoje }] });
    if (!r) return;
    await mutate(() => api('/api/destinos/lote', { method: 'POST', body: { ids, estado: 'entregue', data_entrega: r.data_entrega } }), `${ids.length} entrega(s) registada(s)`);
    S.sel.clear(); renderPage();
  },
  'sel-data': () => reprogramar([...S.sel]),
  'sel-limpar': () => { S.sel.clear(); renderPage(); },
  'orc-edit': () => { S.orcEdit = !S.orcEdit; renderPage(); },
  'orc-guardar': async () => {
    const linhas = $$('[data-orc]').map(i => ({ categoria: i.dataset.orc, valor: Number(numero(i.value)) || 0, notas: $(`[data-orcn="${i.dataset.orc}"]`)?.value || '' }));
    await mutate(() => api(`/api/missoes/${S.missao}/orcamento`, { method: 'PUT', body: { linhas } }), 'Orçamento guardado');
    S.orcEdit = false; renderPage();
  },
};
async function dialogoFactura(fx) {
  const r = await dialogo({ titulo: fx ? `Factura ${esc(fx.numero || '')}` : 'Registar factura ao cliente', ok: 'Guardar', campos: [
    { n: 'numero', l: 'Nº da factura', v: fx?.numero }, { n: 'data', l: 'Data', t: 'date', v: fx?.data || S.d.hoje },
    { n: 'valor', l: 'Valor (MT)', t: 'number', v: fx?.valor ?? '' },
    { n: 'estado', l: 'Estado', t: 'select', v: fx?.estado || 'emitida', o: [['emitida', 'Emitida'], ['paga', 'Paga'], ['anulada', 'Anulada']] },
    { n: 'data_pagamento', l: 'Data de pagamento', t: 'date', v: fx?.data_pagamento },
    { n: 'observacoes', l: 'Observações', t: 'textarea', v: fx?.observacoes, ph: 'Entregas abrangidas, nº de PO, contacto…' } ] });
  if (!r) return;
  if (r.estado === 'paga' && !r.data_pagamento) r.data_pagamento = S.d.hoje;
  await mutate(() => fx ? api(`/api/facturas/${fx.id}`, { method: 'PUT', body: r }) : api(`/api/missoes/${S.missao}/facturas`, { method: 'POST', body: r }), 'Factura guardada');
}
async function reprogramar(ids) {
  const d0 = S.dMap.get(ids[0]);
  const r = await dialogo({ titulo: ids.length > 1 ? `Reprogramar ${ids.length} destinos` : `Reprogramar ${esc(d0.comunidade)}`, ok: 'Reprogramar',
    campos: [{ n: 'data', l: 'Nova data prevista', t: 'date', v: d0.data_prevista && d0.data_prevista > S.d.hoje ? d0.data_prevista : addDias(S.d.hoje, 1) }, { n: 'motivo', l: 'Motivo', ph: 'fica registado nas observações' }] });
  if (!r?.data) return;
  await mutate(async () => {
    for (const id of ids) {
      const d = S.dMap.get(id);
      const nota = `Reprogramado de ${dm(d.data_prevista)} para ${dm(r.data)}${r.motivo ? ': ' + r.motivo : ''}`;
      await api(`/api/destinos/${id}`, { method: 'PUT', body: { data_prevista: r.data, observacoes: [d.observacoes, nota].filter(Boolean).join(' | ') } });
    }
  }, `${ids.length} destino(s) reprogramado(s)`);
  S.sel.clear(); renderPage();
}

document.addEventListener('click', e => {
  if (e.target.closest('input[type=checkbox]')) return;
  if (e.target.closest('a[href]:not([href="#"])')) return;
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  e.preventDefault();
  ACT[el.dataset.act](el, e);
});
document.addEventListener('input', e => {
  const id = e.target.dataset?.pesq;
  if (id) { S.pesq[id] = e.target.value; aplicarPesquisa(id); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sel) { const id = Number(t.dataset.sel); t.checked ? S.sel.add(id) : S.sel.delete(id); t.closest('tr').classList.toggle('sel', t.checked); renderSelbar(); }
  else if (t.hasAttribute('data-selall')) { destFiltrados().forEach(d => (t.checked ? S.sel.add(d.id) : S.sel.delete(d.id))); tabelaDestinos(); renderSelbar(); }
  else if (t.dataset.bsel) { const id = Number(t.dataset.bsel); t.checked ? S.bsel.add(id) : S.bsel.delete(id); renderPage(); }
  else if (t.dataset.kq || t.dataset.kp) {
    const id = t.dataset.kq || t.dataset.kp, campo = t.dataset.kq ? 'qtd' : 'peso_kg';
    mutate(() => api(`/api/kit-itens/${id}`, { method: 'PUT', body: { [campo]: numero(t.value) } }), 'Kit actualizado').then(() => renderPage());
  }
  else if (t.dataset.fdest) { S.fDest[t.dataset.fdest] = t.value; if (t.dataset.fdest === 'provincia') S.fDest.distrito = ''; renderPage(); }
});

window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (PAGES[k] && k !== S.page) ACT.nav({ dataset: { k } }); });
boot().catch(e => { document.body.innerHTML = `<div class="empty"><b>Não foi possível carregar</b>${esc(e.message)}</div>`; });
