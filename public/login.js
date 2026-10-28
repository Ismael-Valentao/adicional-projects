// Ecrã de login
const f = document.getElementById('f'), erro = document.getElementById('erro');
f.addEventListener('submit', async e => {
  e.preventDefault();
  erro.style.display = 'none';
  const b = f.querySelector('button'); b.disabled = true; b.textContent = 'A entrar…';
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível entrar');
    const voltar = new URLSearchParams(location.search).get('voltar');
    location.href = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/';
  } catch (x) {
    erro.textContent = x.message; erro.style.display = 'block';
    b.disabled = false; b.textContent = 'Entrar';
    f.senha.select();
  }
});
