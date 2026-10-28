// Autenticação: sessão em cookie httpOnly (JWT), perfis superadmin | utilizador
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const PERFIS = { superadmin: 'Superadmin', utilizador: 'Utilizador' };
const COOKIE = 'sessao';
const HORAS = 12;
const PROD = process.env.NODE_ENV === 'production';
const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) { console.error('JWT_SECRET em falta no ambiente — o servidor não pode arrancar sem ele.'); process.exit(1); }

const publico = u => u && { id: u.id, nome: u.nome, utilizador: u.utilizador, email: u.email, perfil: u.perfil, perfil_nome: PERFIS[u.perfil] || u.perfil, activo: !!u.activo, mudar_senha: !!u.mudar_senha, ultimo_acesso: u.ultimo_acesso, observacoes: u.observacoes };

function definirCookie(res, u) {
  const token = jwt.sign({ id: u.id }, SEGREDO, { expiresIn: `${HORAS}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: HORAS * 3600 * 1000 });
}

// lê o utilizador da sessão (e confirma na BD que continua activo)
async function lerSessao(req) {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  try {
    const { id } = jwt.verify(t, SEGREDO);
    const u = await db.prepare('SELECT * FROM utilizadores WHERE id=? AND activo=1').get(id);
    return u || null;
  } catch { return null; }
}

// protege tudo excepto o login: API → 401 JSON; páginas → redirecciona para o login
function exigirSessao(abertas = []) {
  return async (req, res, next) => {
    if (abertas.some(p => (p.endsWith('*') ? req.path.startsWith(p.slice(0, -1)) : req.path === p))) return next();
    const u = await lerSessao(req);
    if (!u) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'Sessão expirada — inicie sessão novamente' });
      return res.redirect('/login.html?voltar=' + encodeURIComponent(req.originalUrl));
    }
    req.user = u;
    next();
  };
}
const soSuperadmin = (req, res, next) => (req.user?.perfil === 'superadmin' ? next() : res.status(403).json({ erro: 'Só o superadmin pode fazer isto' }));

async function hash(senha) { return bcrypt.hash(senha, 10); }
function validarSenha(s) { if (!s || String(s).length < 8) throw new Error('A palavra-passe tem de ter pelo menos 8 caracteres'); }

// cria o primeiro superadmin quando não há utilizadores
async function garantirAdmin() {
  const n = (await db.prepare('SELECT COUNT(*) n FROM utilizadores').get()).n;
  if (n) return null;
  const senha = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  await db.prepare('INSERT INTO utilizadores (nome, utilizador, email, senha_hash, perfil, mudar_senha) VALUES (?,?,?,?,?,1)')
    .run(process.env.ADMIN_NOME || 'Ismael Chiziane', process.env.ADMIN_UTILIZADOR || 'admin', process.env.ADMIN_EMAIL || 'ismaeladicional@gmail.com', await hash(senha), 'superadmin');
  console.log(`Superadmin inicial criado: utilizador "${process.env.ADMIN_UTILIZADOR || 'admin'}"${process.env.ADMIN_PASSWORD ? ' (palavra-passe de ADMIN_PASSWORD)' : `, palavra-passe temporária: ${senha}`}`);
  return senha;
}

function rotas(app, wrap) {
  app.post('/api/auth/login', wrap(async (req, res) => {
    const id = String(req.body.utilizador || '').trim().toLowerCase(), senha = String(req.body.senha || '');
    const u = await db.prepare('SELECT * FROM utilizadores WHERE (LOWER(utilizador)=? OR LOWER(email)=?) AND activo=1').get(id, id);
    if (!u || !(await bcrypt.compare(senha, u.senha_hash))) { await new Promise(r => setTimeout(r, 600)); res.status(401); return { erro: 'Utilizador ou palavra-passe incorrectos' }; }
    await db.prepare('UPDATE utilizadores SET ultimo_acesso=NOW() WHERE id=?').run(u.id);
    definirCookie(res, u);
    return { utilizador: publico(u) };
  }));
  app.post('/api/auth/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
  app.get('/api/auth/eu', wrap(req => ({ utilizador: publico(req.user), perfis: PERFIS })));
  app.post('/api/auth/senha', wrap(async (req, res) => {
    const { atual, nova } = req.body;
    if (!(await bcrypt.compare(String(atual || ''), req.user.senha_hash))) throw new Error('A palavra-passe actual não está correcta');
    validarSenha(nova);
    await db.prepare('UPDATE utilizadores SET senha_hash=?, mudar_senha=0 WHERE id=?').run(await hash(nova), req.user.id);
    definirCookie(res, req.user);
    return { ok: true };
  }));

  // gestão de utilizadores (superadmin)
  app.get('/api/utilizadores', soSuperadmin, wrap(async () => (await db.prepare('SELECT * FROM utilizadores ORDER BY nome').all()).map(publico)));
  app.post('/api/utilizadores', soSuperadmin, wrap(async req => {
    const b = req.body;
    if (!String(b.nome || '').trim() || !String(b.utilizador || '').trim()) throw new Error('Indique o nome e o utilizador');
    if (!PERFIS[b.perfil]) b.perfil = 'utilizador';
    validarSenha(b.senha);
    if (await db.prepare('SELECT id FROM utilizadores WHERE LOWER(utilizador)=LOWER(?)').get(b.utilizador.trim())) throw new Error('Esse nome de utilizador já existe');
    const r = await db.prepare('INSERT INTO utilizadores (nome, utilizador, email, senha_hash, perfil, mudar_senha, observacoes) VALUES (?,?,?,?,?,1,?)')
      .run(b.nome.trim(), b.utilizador.trim(), b.email || null, await hash(b.senha), b.perfil, b.observacoes || null);
    return { id: r.lastInsertRowid };
  }));
  app.put('/api/utilizadores/:id', soSuperadmin, wrap(async req => {
    const id = Number(req.params.id), b = req.body;
    const alvo = await db.prepare('SELECT * FROM utilizadores WHERE id=?').get(id);
    if (!alvo) throw new Error('Utilizador não encontrado');
    const perfil = PERFIS[b.perfil] ? b.perfil : alvo.perfil;
    const activo = b.activo === undefined ? alvo.activo : (b.activo ? 1 : 0);
    if (id === req.user.id && (perfil !== 'superadmin' || !activo)) throw new Error('Não pode retirar o seu próprio acesso de superadmin');
    if (alvo.perfil === 'superadmin' && (perfil !== 'superadmin' || !activo)) {
      const n = (await db.prepare("SELECT COUNT(*) n FROM utilizadores WHERE perfil='superadmin' AND activo=1 AND id<>?").get(id)).n;
      if (!n) throw new Error('Tem de existir pelo menos um superadmin activo');
    }
    await db.prepare('UPDATE utilizadores SET nome=?, email=?, perfil=?, activo=?, observacoes=? WHERE id=?')
      .run(String(b.nome ?? alvo.nome).trim(), b.email ?? alvo.email, perfil, activo, b.observacoes ?? alvo.observacoes, id);
    if (b.senha) { validarSenha(b.senha); await db.prepare('UPDATE utilizadores SET senha_hash=?, mudar_senha=1 WHERE id=?').run(await hash(b.senha), id); }
    return { ok: true };
  }));
}

module.exports = { exigirSessao, soSuperadmin, rotas, garantirAdmin, PERFIS };
