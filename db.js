// Base de dados SQLite (node:sqlite, sem dependências nativas)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'distribuicao.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS missoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cliente TEXT,
  descricao TEXT,
  orcamento REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS destinos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  provincia TEXT, distrito TEXT, posto TEXT, localidade TEXT, comunidade TEXT NOT NULL,
  benef_total INTEGER DEFAULT 0, benef_baixa INTEGER DEFAULT 0, benef_sequeiro INTEGER DEFAULT 0,
  local_entrega TEXT,
  data_prevista TEXT,
  estado TEXT DEFAULT 'pendente',      -- pendente | em_transito | entregue | parcial | adiado | cancelado
  data_entrega TEXT,
  benef_atendidos INTEGER,
  recebido_por TEXT,
  observacoes TEXT,
  ordem INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transportadoras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL, nuit TEXT, contacto TEXT, telefone TEXT, email TEXT, observacoes TEXT
);
CREATE TABLE IF NOT EXISTS viagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  codigo TEXT,
  transportadora_id INTEGER REFERENCES transportadoras(id) ON DELETE SET NULL,
  matricula TEXT, matricula_reboque TEXT, motorista TEXT, motorista_tel TEXT,
  capacidade_t REAL, carga TEXT,
  origem TEXT,
  data_saida_prevista TEXT, data_saida TEXT, data_regresso TEXT,
  estado TEXT DEFAULT 'planeada',      -- planeada | carregada | em_transito | concluida | cancelada
  modo_preco TEXT DEFAULT 'global',    -- global | por_destino
  preco_global REAL DEFAULT 0,
  adiantamento REAL DEFAULT 0,
  valor_pago REAL DEFAULT 0,
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS viagem_destinos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viagem_id INTEGER NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  destino_id INTEGER NOT NULL REFERENCES destinos(id) ON DELETE CASCADE,
  preco REAL DEFAULT 0,
  ordem INTEGER DEFAULT 0,
  UNIQUE(viagem_id, destino_id)
);
CREATE TABLE IF NOT EXISTS custos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  viagem_id INTEGER REFERENCES viagens(id) ON DELETE SET NULL,
  destino_id INTEGER REFERENCES destinos(id) ON DELETE SET NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  fornecedor TEXT,
  quantidade REAL DEFAULT 1,
  valor_unitario REAL DEFAULT 0,
  data TEXT,
  pago INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
`);

// ---------- Migrações: orçamento e receita ----------
const colsMissao = db.prepare('PRAGMA table_info(missoes)').all().map(c => c.name);
for (const [c, def] of [
  ['receita_modo', "TEXT DEFAULT 'global'"],   // global | por_beneficiario
  ['receita_valor', 'REAL DEFAULT 0'],         // valor global contratado
  ['receita_unit', 'REAL DEFAULT 0'],          // MT por beneficiário
  ['margem_alvo', 'REAL DEFAULT 0'],           // % de margem desejada
  ['data_inicio', 'TEXT'], ['data_fim', 'TEXT'],
]) if (!colsMissao.includes(c)) db.exec(`ALTER TABLE missoes ADD COLUMN ${c} ${def}`);
db.exec(`CREATE TABLE IF NOT EXISTS orcamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  valor REAL DEFAULT 0,
  notas TEXT,
  UNIQUE(missao_id, categoria)
)`);

// ---------- Kits de insumos (1 kit por beneficiário: Baixa ou Sequeiro) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS kit_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  kit TEXT NOT NULL,            -- baixa | sequeiro
  categoria TEXT, item TEXT, descricao TEXT, embalagem TEXT,
  qtd REAL DEFAULT 1,           -- unidades por kit
  peso_kg REAL,                 -- peso de cada unidade (null = por confirmar)
  ordem INTEGER DEFAULT 0
)`);
function seedKits(mid) {
  // Fonte: Composicao_Kits_Insumos.pdf (Adicional Logistics, Out 2026)
  const K = {
    baixa: [
      ['Sementes', 'Milho', 'MILHO HÍBRIDO DKC777, 2 kg (SUPER)', 'saco 2 kg', 3, 2],
      ['Sementes', 'Feijão vulgar', 'FEIJÃO VULGAR BONUS 1 kg', 'pacote 1 kg', 2, 1],
      ['Sementes', 'Amendoim', 'AMENDOIM NAMETIL 1 kg', 'pacote 1 kg', 2, 1],
      ['Sementes', 'Cebola', 'CEBOLA TEXAS GRANO, 10 g', 'saqueta 10 g', 2, 0.01],
      ['Sementes', 'Repolho', 'REPOLHO COPENHAGEN MARKET, 10 g', 'saqueta 10 g', 2, 0.01],
      ['Fertilizantes', 'Ureia', 'UREIA 46% 50 kg - AGRO', 'saco 50 kg', 1, 50],
      ['Pesticidas', 'Mancozeb', 'NUTRIZEB 80% WP 1 kg (MANCOZEB)', 'pacote 1 kg', 1, 1],
      ['Pesticidas', 'Lambda-cialotrina', 'KARATE 5% SC 250 ml', 'frasco 250 ml', 1, 0.25],
      ['Pesticidas', 'Imidaclopride', 'NUTRIMIDA 20% SL 1 L', 'frasco 1 L', 1, 1],
      ['Ferramentas', 'Pulverizador', 'PULVERIZADOR 16 L', 'unidade', 1, null],
      ['Ferramentas', 'Regador', 'REGADOR PLÁSTICO 10 L', 'unidade', 1, null],
    ],
    sequeiro: [
      ['Sementes', 'Milho', 'MILHO HÍBRIDO LAKE 401, 2 kg', 'saco 2 kg', 3, 2],
      ['Sementes', 'Abóbora', 'ABÓBORA FLAT WHITE BOER, 10 g STARKE', 'saqueta 10 g', 2, 0.01],
      ['Sementes', 'Amendoim', 'AMENDOIM NAMETIL 1 kg', 'pacote 1 kg', 2, 1],
      ['Sementes', 'Feijão nhemba', 'FEIJÃO NHEMBA IT 16, 1 kg', 'pacote 1 kg', 3, 1],
      ['Fertilizantes', 'NPK', 'COMPOSTO NPK 12-24-12 50 kg - AGRO', 'saco 50 kg', 1, 50],
      ['Pesticidas', 'Mancozeb', 'NUTRIZEB 80% WP 1 kg (MANCOZEB)', 'pacote 1 kg', 1, 1],
      ['Pesticidas', 'Lambda-cialotrina', 'KARATE 5% SC 250 ml', 'frasco 250 ml', 1, 0.25],
      ['Pesticidas', 'Imidaclopride', 'NUTRIMIDA 20% SL 1 L', 'frasco 1 L', 1, 1],
      ['Ferramentas', 'Pulverizador', 'PULVERIZADOR 16 L', 'unidade', 1, null],
      ['Ferramentas', 'Regador', 'REGADOR PLÁSTICO 10 L', 'unidade', 1, null],
    ],
  };
  const ins = db.prepare('INSERT INTO kit_itens (missao_id, kit, categoria, item, descricao, embalagem, qtd, peso_kg, ordem) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [kit, L] of Object.entries(K)) L.forEach((r, i) => ins.run(mid, kit, ...r, i + 1));
}

// ---------- Notas de débito a transportadores (faltas, danos, atrasos…) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS notas_debito (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  numero TEXT,
  viagem_id INTEGER REFERENCES viagens(id) ON DELETE SET NULL,
  transportadora_id INTEGER REFERENCES transportadoras(id) ON DELETE SET NULL,
  destino_id INTEGER REFERENCES destinos(id) ON DELETE SET NULL,
  data TEXT,
  motivo TEXT DEFAULT 'falta',       -- falta | dano | atraso | outro
  estado TEXT DEFAULT 'emitida',     -- emitida | aceite | contestada | anulada
  referencia TEXT,                   -- nº da guia / documento de suporte
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS nd_linhas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nd_id INTEGER NOT NULL REFERENCES notas_debito(id) ON DELETE CASCADE,
  artigo TEXT, quantidade REAL DEFAULT 0, preco_unit REAL DEFAULT 0, ordem INTEGER DEFAULT 0
);`);
// Facturação ao cliente, por projecto
db.exec(`CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  missao_id INTEGER NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
  numero TEXT, data TEXT, valor REAL DEFAULT 0,
  estado TEXT DEFAULT 'emitida',     -- emitida | paga | anulada
  data_pagamento TEXT, observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
// Carga por artigo em cada destino (projectos sem kits, ex.: PROCAVA)
db.exec(`CREATE TABLE IF NOT EXISTS destino_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destino_id INTEGER NOT NULL REFERENCES destinos(id) ON DELETE CASCADE,
  categoria TEXT, artigo TEXT NOT NULL, codigo TEXT,
  volumes REAL DEFAULT 0, peso_kg REAL DEFAULT 0, lote TEXT, fornecedor TEXT,
  observacoes TEXT, ordem INTEGER DEFAULT 0
)`);
// observações em todos os registos
if (!db.prepare('PRAGMA table_info(custos)').all().some(c => c.name === 'observacoes')) db.exec('ALTER TABLE custos ADD COLUMN observacoes TEXT');
// preço unitário dos artigos (valores líquidos das guias da AQI, Out 2026)
if (!db.prepare('PRAGMA table_info(kit_itens)').all().some(c => c.name === 'preco_unit')) db.exec('ALTER TABLE kit_itens ADD COLUMN preco_unit REAL');
function preencherPrecos() {
  const P = [['DKC777', 400], ['FEIJÃO VULGAR', 387], ['AMENDOIM', 315], ['CEBOLA', 52.56], ['REPOLHO', 46.72], ['UREIA', 3105.68], ['MANCOZEB', 375],
    ['KARATE', 400], ['NUTRIMIDA', 1150], ['PULVERIZADOR', 850], ['REGADOR', 280], ['LAKE 401', 400], ['ABÓBORA', 80], ['NHEMBA', 180], ['NPK', 3150.68]];
  const up = db.prepare('UPDATE kit_itens SET preco_unit=? WHERE preco_unit IS NULL AND descricao LIKE ?');
  for (const [k, v] of P) up.run(v, `%${k}%`);
}

// ---------- Dados iniciais: cronograma Maputo, Gaza & Inhambane (Out 2026) ----------
function seed() {
  const n = db.prepare('SELECT COUNT(*) c FROM missoes').get().c;
  if (n > 0) return;
  const m = db.prepare('INSERT INTO missoes (nome, cliente, descricao, orcamento) VALUES (?,?,?,?)')
    .run('Distribuição de insumos — Maputo, Gaza & Inhambane', '', 'Cronograma 19/10 a 28/10/2026', 0);
  const mid = m.lastInsertRowid;
  const Y = '2026-10-';
  // [provincia, distrito, posto, localidade, comunidade, total, baixa, sequeiro, local entrega, dia, obs]
  const L = [
    ['Maputo','Magude','Motaze','Motaze','Mangadlane',1,0,1,'',26],
    ['Maputo','Magude','Motaze','Motaze','Chibelane',2,0,2,'',26],
    ['Maputo','Magude','Magude Sede','Matchabe','Facazissa',8,0,8,'',26],
    ['Maputo','Magude','Magude Sede','Macubulane','Macubulane',3,0,3,'',27,'Cronograma marca 27 e 28/10'],
    ['Maputo','Magude','Magude Sede','Guarrimbene','Guarrimbene',3,0,3,'',27,'Cronograma marca 27 e 28/10'],
    ['Maputo','Magude','Magude Sede','Maguiguana','Maguiguana',2,0,2,'',26],
    ['Maputo','Manhiça','Manhiça Sede','Manhiça Sede','Nhambi',16,0,16,'Nhambi',22],
    ['Maputo','Manhiça','Manhiça Sede','Manhiça Sede','Gulana',1,0,1,'Nhambi',22],
    ['Maputo','Manhiça','Maluana','Maluana','Dluana',2,0,2,'Posto de Maluana',22],
    ['Maputo','Manhiça','Maluana','Maluana','Bairro 3',3,0,3,'Posto de Maluana',22],
    ['Maputo','Manhiça','Maluana','Maluana','Bairro 1',2,0,2,'Posto de Maluana',22],
    ['Maputo','Manhiça','Maluana','Maluana','Barrica',25,0,25,'Posto de Maluana',22],
    ['Maputo','Manhiça','Maluana','Maluana','Mahumane',1,0,1,'Posto de Maluana',22],
    ['Maputo','Marracuene','Marracuene Sede','Matalana','Matalane',85,0,85,'Matalane',21],
    ['Maputo','Marracuene','Marracuene Sede','Matalana','Pazimane',32,0,32,'Matalane',21],
    ['Maputo','Marracuene','Marracuene Sede','Matalana','Ndixe',6,0,6,'Matalane',21],
    ['Maputo','Marracuene','Marracuene Sede','Matalana','Gimo-Ocossa',2,0,2,'',21],
    ['Maputo','Moamba','Pessene','Pessene','Nwambalambate',5,0,5,'Por confirmar',27,'Reprogramado de 19/10 para 27/10'],
    ['Maputo','Moamba','Pessene','Pessene','Lhanguene',10,0,10,'Por confirmar',27,'Reprogramado de 19/10 para 27/10'],
    ['Maputo','Moamba','Pessene','Pessene','Boanine',25,0,25,'Por confirmar',27,'Reprogramado de 19/10 para 27/10'],
    ['Maputo','Moamba','Pessene','Pessene','Ngolhoza',1,0,1,'Por confirmar',28,'Reprogramado de 20/10 para 28/10'],
    ['Maputo','Moamba','Pessene','Pessene','Pessene (Uaimbela)',6,0,6,'Por confirmar',27,'Reprogramado de 19/10 para 27/10'],
    ['Maputo','Moamba','Pessene','Mahulane','Mucapane',45,0,45,'',28,'Reprogramado de 20/10 para 28/10'],
    ['Maputo','Moamba','Pessene','Mahulane','Chiboene',11,0,11,'',28,'Reprogramado de 20/10 para 28/10'],
    ['Maputo','Boane','Matola Rio','Mulotana','Beluluane',1,0,1,'',23],
    ['Maputo','Boane','Matola Rio','Mulotana','Zilinga',10,0,10,'',23],
    ['Maputo','Boane','Matola Rio','Mulotana','Mavoco 2 & 4',13,0,13,'',23],
    ['Maputo','Boane','Matola Rio','Mulotana','Mulotana',12,0,12,'',23],
    ['Gaza','Chibuto','Changanine','Hate-Hate','Maharila',4,0,4,'Posto Administrativo de Changanine',27,'Data corrigida de 24/10 para 27/10 (24/10 era erro do cronograma)'],
    ['Gaza','Chibuto','Alto Changane','Alto Changane','Madjekuzi',1,0,1,'Centro de Saúde de Meboi',26],
    ['Gaza','Chibuto','Alto Changane','Alto Changane','Munhuane',19,0,19,'Centro de Saúde de Meboi',26],
    ['Gaza','Chibuto','Godide','Godide Sede','Cambanhane',13,8,5,'Localidade de Godide Sede',26],
    ['Gaza','Chibuto','Godide','Godide Sede','Mbawane',20,20,0,'Localidade de Godide Sede',26],
    ['Gaza','Chibuto','Godide','Godide Sede','Chidzavane',7,0,7,'Centro de Saúde de Meboi',26],
    ['Gaza','Chibuto','Chibuto Sede','Canhavano','Mudumeia',288,288,0,'Antiga Escola Básica de Mudumeia',28],
    ['Gaza','Chibuto','Chaimite','Mukhotuene','Macalawane',123,123,0,'Escola Secundária de Maguiguane',23],
    ['Gaza','Chibuto','Chaimite','Mukhotuene','Sanguate',57,57,0,'Escola Secundária de Maguiguane',23],
    ['Gaza','Bilene','Mazivila','Mazivila','Nhamusse',10,0,10,'Localidade de Mazivila',21],
    ['Gaza','Bilene','Mazivila','Mazivila','Bairro 3/Chivalo A',4,0,4,'Localidade de Mazivila',21],
    ['Gaza','Bilene','Mazivila','Olombe','Macanhe/Tlhacula',2,0,2,'Localidade de Mazivila',21],
    ['Gaza','Chókwè','Xilembene','Chiduachine','Chalucuane',7,7,0,'Localidade de Chilembene',22],
    ['Gaza','Chókwè','Xilembene','Chiduachine','Sangena',1,1,0,'Localidade de Chilembene',22],
    ['Gaza','Chókwè','Xilembene','Chiduachine','Zuza',6,6,0,'Localidade de Chilembene',22],
    ['Gaza','Chókwè','Xilembene','Xilembene','Muzai',80,0,80,'Linha TTP',21],
    ['Gaza','Chókwè','Lionde','Conhane','Chiaquelane',22,0,22,'Localidade de Conhane',21],
    ['Inhambane','Vilankulo','Vilankulo Sede','Pambara','Pambara / Makandza - Viru',13,0,13,'Pambara-sede',21],
    ['Inhambane','Vilankulo','Mapinhane','Muabsa','Malatisse',2,0,2,'Localidade de Muabsa',21],
    ['Inhambane','Funhalouro','Funhalouro Sede','Mucuine','Malave',6,0,6,'Círculo de Mbanguine',23],
    ['Inhambane','Funhalouro','Funhalouro Sede','Mucuine','Banguine',9,0,9,'Círculo de Mbanguine',23],
    ['Inhambane','Funhalouro','Funhalouro Sede','Mucuine','Chidanoane',2,0,2,'Círculo de Mbanguine',23],
    ['Inhambane','Panda','Mawayela','Macavelane','Bombene',3,0,3,'Localidade de Macavelane',22],
    ['Inhambane','Panda','Mawayela','Macavelane','Magaiza',1,0,1,'Localidade de Macavelane',22],
  ];
  const ins = db.prepare(`INSERT INTO destinos (missao_id, provincia, distrito, posto, localidade, comunidade,
    benef_total, benef_baixa, benef_sequeiro, local_entrega, data_prevista, observacoes, ordem)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  L.forEach((r, i) => ins.run(mid, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8],
    r[9] ? Y + String(r[9]).padStart(2, '0') : null, r[10] || null, i + 1));
}
seed();
if (db.prepare('SELECT id FROM missoes WHERE id=1').get() && !db.prepare('SELECT COUNT(*) c FROM kit_itens WHERE missao_id=1').get().c) seedKits(1);
preencherPrecos();

module.exports = db;
