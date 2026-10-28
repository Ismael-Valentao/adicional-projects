// Copia todos os dados de data/distribuicao.db (SQLite) para o MySQL do .env, mantendo os ids.
// Uso: node scripts/migrar_sqlite_para_mysql.js [--substituir]
//   --substituir  apaga primeiro os dados que já existam no MySQL (excepto utilizadores)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = require('../db');

const ORDEM = ['missoes', 'transportadoras', 'destinos', 'viagens', 'viagem_destinos', 'custos', 'orcamento', 'kit_itens', 'notas_debito', 'nd_linhas', 'destino_itens', 'facturas'];

(async () => {
  const src = new DatabaseSync(path.join(__dirname, '..', 'data', 'distribuicao.db'), { readOnly: true });
  await db.init();
  const c = await db.pool.getConnection();
  try {
    const existentes = (await c.query('SELECT COUNT(*) n FROM missoes'))[0][0].n;
    if (existentes && !process.argv.includes('--substituir')) throw new Error(`O MySQL já tem ${existentes} projecto(s). Use --substituir para apagar e copiar de novo.`);
    await c.query('SET FOREIGN_KEY_CHECKS=0');
    await c.beginTransaction();
    for (const t of [...ORDEM].reverse()) await c.query(`DELETE FROM ${t}`);
    const relatorio = [];
    for (const t of ORDEM) {
      const existe = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (!existe) { relatorio.push([t, 0, 'não existe no SQLite']); continue; }
      const linhas = src.prepare(`SELECT * FROM ${t}`).all();
      const colsMy = new Set((await c.query(`SHOW COLUMNS FROM ${t}`))[0].map(x => x.Field));
      const cols = linhas.length ? Object.keys(linhas[0]).filter(k => colsMy.has(k)) : [];
      for (let i = 0; i < linhas.length; i += 200) {
        const lote = linhas.slice(i, i + 200);
        await c.query(`INSERT INTO ${t} (${cols.map(k => '`' + k + '`').join(',')}) VALUES ?`, [lote.map(r => cols.map(k => r[k] ?? null))]);
      }
      const n = (await c.query(`SELECT COUNT(*) n FROM ${t}`))[0][0].n;
      relatorio.push([t, linhas.length, n === linhas.length ? 'ok' : `ERRO: MySQL tem ${n}`]);
    }
    await c.commit();
    await c.query('SET FOREIGN_KEY_CHECKS=1');
    console.table(relatorio.map(([tabela, sqlite, estado]) => ({ tabela, linhas: sqlite, estado })));
  } catch (e) { await c.rollback().catch(() => {}); console.error('MIGRAÇÃO FALHOU:', e.message); process.exitCode = 1; }
  finally { c.release(); await db.pool.end(); }
})();
