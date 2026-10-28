// Base de dados MySQL/MariaDB (mysql2). API: db.prepare(sql).all/get/run (assíncronas), db.tx(fn), db.init()
require('dotenv').config();
const mysql = require('mysql2/promise');
const { AsyncLocalStorage } = require('async_hooks');

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: Number(process.env.DB_POOL) || 8,
  charset: 'utf8mb4', dateStrings: true, decimalNumbers: true, connectTimeout: 20000,
});

// dentro de db.tx(), todas as consultas usam a mesma ligação (transacção)
const als = new AsyncLocalStorage();
const exe = () => als.getStore() || pool;

function prepare(sql) {
  return {
    all: async (...p) => (await exe().query(sql, p))[0],
    get: async (...p) => (await exe().query(sql, p))[0][0],
    run: async (...p) => { const [r] = await exe().query(sql, p); return { lastInsertRowid: r.insertId, changes: r.affectedRows }; },
  };
}
async function tx(fn) {
  if (als.getStore()) return fn();
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const r = await als.run(c, fn);
    await c.commit();
    return r;
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS missoes (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, cliente VARCHAR(255), descricao TEXT,
    orcamento DOUBLE DEFAULT 0, receita_modo VARCHAR(30) DEFAULT 'global', receita_valor DOUBLE DEFAULT 0, receita_unit DOUBLE DEFAULT 0,
    margem_alvo DOUBLE DEFAULT 0, data_inicio VARCHAR(10), data_fim VARCHAR(10), criado_em DATETIME DEFAULT CURRENT_TIMESTAMP) ${T}`,
  `CREATE TABLE IF NOT EXISTS transportadoras (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, nuit VARCHAR(40), contacto VARCHAR(255), telefone VARCHAR(60),
    email VARCHAR(255), observacoes TEXT) ${T}`,
  `CREATE TABLE IF NOT EXISTS destinos (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL,
    provincia VARCHAR(120), distrito VARCHAR(120), posto VARCHAR(160), localidade VARCHAR(160), comunidade VARCHAR(255) NOT NULL,
    benef_total INT DEFAULT 0, benef_baixa INT DEFAULT 0, benef_sequeiro INT DEFAULT 0, local_entrega VARCHAR(255),
    data_prevista VARCHAR(10), estado VARCHAR(20) DEFAULT 'pendente', data_entrega VARCHAR(10), benef_atendidos INT,
    recebido_por VARCHAR(255), observacoes TEXT, ordem INT DEFAULT 0,
    INDEX (missao_id), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS viagens (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, codigo VARCHAR(40), transportadora_id INT NULL,
    matricula VARCHAR(40), matricula_reboque VARCHAR(40), motorista VARCHAR(160), motorista_tel VARCHAR(60),
    capacidade_t DOUBLE, carga VARCHAR(255), origem VARCHAR(255),
    data_saida_prevista VARCHAR(10), data_saida VARCHAR(10), data_regresso VARCHAR(10),
    estado VARCHAR(20) DEFAULT 'planeada', modo_preco VARCHAR(20) DEFAULT 'global',
    preco_global DOUBLE DEFAULT 0, adiantamento DOUBLE DEFAULT 0, valor_pago DOUBLE DEFAULT 0, observacoes TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (missao_id), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE,
    FOREIGN KEY (transportadora_id) REFERENCES transportadoras(id) ON DELETE SET NULL) ${T}`,
  `CREATE TABLE IF NOT EXISTS viagem_destinos (
    id INT AUTO_INCREMENT PRIMARY KEY, viagem_id INT NOT NULL, destino_id INT NOT NULL, preco DOUBLE DEFAULT 0, ordem INT DEFAULT 0,
    UNIQUE KEY (viagem_id, destino_id),
    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE, FOREIGN KEY (destino_id) REFERENCES destinos(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS custos (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, viagem_id INT NULL, destino_id INT NULL,
    categoria VARCHAR(60) NOT NULL, descricao TEXT, fornecedor VARCHAR(255), quantidade DOUBLE DEFAULT 1, valor_unitario DOUBLE DEFAULT 0,
    data VARCHAR(10), pago TINYINT DEFAULT 0, observacoes TEXT, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (missao_id), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE,
    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE SET NULL, FOREIGN KEY (destino_id) REFERENCES destinos(id) ON DELETE SET NULL) ${T}`,
  `CREATE TABLE IF NOT EXISTS orcamento (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, categoria VARCHAR(60) NOT NULL, valor DOUBLE DEFAULT 0, notas TEXT,
    UNIQUE KEY (missao_id, categoria), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS kit_itens (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, kit VARCHAR(20) NOT NULL,
    categoria VARCHAR(80), item VARCHAR(160), descricao VARCHAR(255), embalagem VARCHAR(80),
    qtd DOUBLE DEFAULT 1, peso_kg DOUBLE NULL, preco_unit DOUBLE NULL, ordem INT DEFAULT 0,
    INDEX (missao_id), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS notas_debito (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, numero VARCHAR(30), viagem_id INT NULL, transportadora_id INT NULL, destino_id INT NULL,
    data VARCHAR(10), motivo VARCHAR(20) DEFAULT 'falta', estado VARCHAR(20) DEFAULT 'emitida', referencia VARCHAR(255), observacoes TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (missao_id), FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE,
    FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE SET NULL, FOREIGN KEY (transportadora_id) REFERENCES transportadoras(id) ON DELETE SET NULL,
    FOREIGN KEY (destino_id) REFERENCES destinos(id) ON DELETE SET NULL) ${T}`,
  `CREATE TABLE IF NOT EXISTS nd_linhas (
    id INT AUTO_INCREMENT PRIMARY KEY, nd_id INT NOT NULL, artigo VARCHAR(255), quantidade DOUBLE DEFAULT 0, preco_unit DOUBLE DEFAULT 0, ordem INT DEFAULT 0,
    FOREIGN KEY (nd_id) REFERENCES notas_debito(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS destino_itens (
    id INT AUTO_INCREMENT PRIMARY KEY, destino_id INT NOT NULL, categoria VARCHAR(120), artigo VARCHAR(255) NOT NULL, codigo VARCHAR(60),
    volumes DOUBLE DEFAULT 0, peso_kg DOUBLE DEFAULT 0, lote VARCHAR(60), fornecedor VARCHAR(160), observacoes TEXT, ordem INT DEFAULT 0,
    FOREIGN KEY (destino_id) REFERENCES destinos(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS facturas (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, numero VARCHAR(60), data VARCHAR(10), valor DOUBLE DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'emitida', data_pagamento VARCHAR(10), observacoes TEXT, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (missao_id) REFERENCES missoes(id) ON DELETE CASCADE) ${T}`,
  // utilizadores e acesso
  `CREATE TABLE IF NOT EXISTS utilizadores (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(160) NOT NULL, utilizador VARCHAR(80) NOT NULL UNIQUE, email VARCHAR(160),
    senha_hash VARCHAR(100) NOT NULL, perfil VARCHAR(20) NOT NULL DEFAULT 'operador', activo TINYINT NOT NULL DEFAULT 1,
    mudar_senha TINYINT NOT NULL DEFAULT 0, ultimo_acesso DATETIME NULL, observacoes TEXT, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP) ${T}`,
];

async function init() {
  for (const sql of ESQUEMA) await pool.query(sql);
}

module.exports = { prepare, tx, init, pool };
