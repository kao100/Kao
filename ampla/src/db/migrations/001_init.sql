-- ---------------------------------------------------------------------------
-- Núcleo da plataforma: contas do painel, chaves de API e auditoria.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuarios (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL,
  senha_hash    TEXT NOT NULL,
  papel         TEXT NOT NULL DEFAULT 'operador'
                CHECK (papel IN ('admin', 'operador', 'auditor')),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessoes (
  token      TEXT PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes (expira_em);

-- A chave em si nunca é gravada: guardamos o hash e um prefixo legível
-- para o usuário reconhecer a chave no painel.
CREATE TABLE IF NOT EXISTS chaves_api (
  id             BIGSERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  prefixo        TEXT NOT NULL UNIQUE,
  hash           TEXT NOT NULL,
  ambiente       TEXT NOT NULL DEFAULT 'producao'
                 CHECK (ambiente IN ('producao', 'sandbox')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  limite_diario  INTEGER NOT NULL DEFAULT 10000,
  produtos       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  criado_por     BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em    TIMESTAMPTZ,
  ultimo_uso_em  TIMESTAMPTZ
);

-- Registro de auditoria. A LGPD exige saber quem consultou o quê, quando e
-- com que finalidade. Toda consulta passa por aqui, inclusive as que vieram
-- do cache e as que não acharam nada.
CREATE TABLE IF NOT EXISTS consultas (
  id                BIGSERIAL PRIMARY KEY,
  consulta_id       UUID NOT NULL UNIQUE,
  produto           TEXT NOT NULL,
  documento         TEXT NOT NULL,
  documento_tipo    TEXT,
  finalidade        TEXT NOT NULL,
  chave_id          BIGINT REFERENCES chaves_api(id) ON DELETE SET NULL,
  usuario_id        BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  ip                INET,
  origem            TEXT NOT NULL CHECK (origem IN ('cache', 'fonte', 'nenhuma')),
  encontrado        BOOLEAN NOT NULL,
  fontes            JSONB NOT NULL DEFAULT '[]'::JSONB,
  custo_centavos    INTEGER NOT NULL DEFAULT 0,
  latencia_ms       INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultas_criado ON consultas (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_documento ON consultas (documento);
CREATE INDEX IF NOT EXISTS idx_consultas_chave ON consultas (chave_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_produto ON consultas (produto, criado_em DESC);

-- Controle das cargas de dados abertos.
CREATE TABLE IF NOT EXISTS ingestoes (
  id           BIGSERIAL PRIMARY KEY,
  fonte        TEXT NOT NULL,
  referencia   TEXT,
  linhas       BIGINT NOT NULL DEFAULT 0,
  iniciado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ,
  erro         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingestoes_fonte ON ingestoes (fonte, iniciado_em DESC);
