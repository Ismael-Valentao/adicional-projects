// Ecrã de login
const f = document.getElementById('f'), erro = document.getElementById('erro'), btn = f.querySelector('.entrar');
const ICON = {
  olho: '<svg class="i" viewBox="0 0 24 24"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>',
  olhoFechado: '<svg class="i" viewBox="0 0 24 24"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="m2 2 20 20"/></svg>',
  sol: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  lua: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
};

// mostrar / ocultar palavra-passe
const olho = document.getElementById('olho');
olho.innerHTML = ICON.olho;
olho.onclick = () => {
  const ver = f.senha.type === 'password';
  f.senha.type = ver ? 'text' : 'password';
  olho.innerHTML = ver ? ICON.olhoFechado : ICON.olho;
  olho.title = olho.ariaLabel = ver ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe';
  f.senha.focus();
};

// aviso de Caps Lock
const caps = document.getElementById('caps');
const verCaps = e => { if (e.getModifierState) caps.style.display = e.getModifierState('CapsLock') ? 'flex' : 'none'; };
f.senha.addEventListener('keydown', verCaps); f.senha.addEventListener('keyup', verCaps);
f.senha.addEventListener('blur', () => (caps.style.display = 'none'));

// tema claro / escuro
const temaBtn = document.getElementById('tema');
const pintarTema = () => { const escuro = document.documentElement.dataset.theme === 'dark'; temaBtn.innerHTML = escuro ? ICON.sol : ICON.lua; temaBtn.title = escuro ? 'Tema claro' : 'Tema escuro'; };
pintarTema();
temaBtn.onclick = () => {
  const novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('tema', novo); } catch {}
  pintarTema();
};

const mostrarErro = msg => {
  erro.querySelector('span').textContent = msg; erro.style.display = 'flex';
  f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
};
const aCarregar = on => { btn.disabled = on; btn.querySelector('.spin').style.display = on ? 'block' : 'none'; btn.querySelector('.txt').textContent = on ? 'A entrar…' : 'Entrar'; };

f.addEventListener('submit', async e => {
  e.preventDefault();
  erro.style.display = 'none';
  if (!f.utilizador.value.trim()) { mostrarErro('Indique o utilizador ou o email.'); return f.utilizador.focus(); }
  if (!f.senha.value) { mostrarErro('Indique a palavra-passe.'); return f.senha.focus(); }
  aCarregar(true);
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utilizador: f.utilizador.value.trim(), senha: f.senha.value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível entrar. Tente de novo.');
    const voltar = new URLSearchParams(location.search).get('voltar');
    location.href = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/';
  } catch (x) {
    mostrarErro(x.message === 'Failed to fetch' ? 'Sem ligação ao servidor. Verifique a internet e tente de novo.' : x.message);
    aCarregar(false);
    f.senha.select();
  }
});
