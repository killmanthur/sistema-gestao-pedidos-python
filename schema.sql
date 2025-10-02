-- schema.sql

DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS sugestoes;

CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    quantidade INTEGER,
    descricao TEXT,
    marca TEXT,
    vendedor TEXT NOT NULL,
    status TEXT NOT NULL,
    tipo_req TEXT NOT NULL,
    comprador TEXT,
    data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_finalizacao TIMESTAMP
);

CREATE TABLE sugestoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    quantidade TEXT,
    marca TEXT,
    descricao TEXT,
    status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_credentials (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    password TEXT NOT NULL
);