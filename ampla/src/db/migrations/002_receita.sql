-- ---------------------------------------------------------------------------
-- Base própria: dados abertos do CNPJ da Receita Federal.
--
-- É o coração da economia do projeto. Uma vez carregada, toda consulta de
-- CNPJ é resolvida localmente em milissegundos e com custo zero — sem chamada
-- externa, sem crédito, sem mensalidade.
--
-- Layout oficial dos arquivos:
-- https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rf_empresas (
  cnpj_basico              CHAR(8) PRIMARY KEY,
  razao_social             TEXT,
  natureza_juridica        TEXT,
  qualificacao_responsavel TEXT,
  capital_social           NUMERIC(18,2),
  porte                    TEXT,
  ente_federativo          TEXT
);

CREATE TABLE IF NOT EXISTS rf_estabelecimentos (
  cnpj_basico                CHAR(8) NOT NULL,
  cnpj_ordem                 CHAR(4) NOT NULL,
  cnpj_dv                    CHAR(2) NOT NULL,
  matriz_filial              TEXT,
  nome_fantasia              TEXT,
  situacao_cadastral         TEXT,
  data_situacao_cadastral    DATE,
  motivo_situacao_cadastral  TEXT,
  nome_cidade_exterior       TEXT,
  pais                       TEXT,
  data_inicio_atividade      DATE,
  cnae_principal             TEXT,
  cnae_secundaria            TEXT,
  tipo_logradouro            TEXT,
  logradouro                 TEXT,
  numero                     TEXT,
  complemento                TEXT,
  bairro                     TEXT,
  cep                        TEXT,
  uf                         CHAR(2),
  municipio                  TEXT,
  ddd_1                      TEXT,
  telefone_1                 TEXT,
  ddd_2                      TEXT,
  telefone_2                 TEXT,
  ddd_fax                    TEXT,
  fax                        TEXT,
  email                      TEXT,
  situacao_especial          TEXT,
  data_situacao_especial     DATE,
  PRIMARY KEY (cnpj_basico, cnpj_ordem, cnpj_dv)
);
CREATE INDEX IF NOT EXISTS idx_estab_basico ON rf_estabelecimentos (cnpj_basico);
CREATE INDEX IF NOT EXISTS idx_estab_cep ON rf_estabelecimentos (cep);
CREATE INDEX IF NOT EXISTS idx_estab_cnae ON rf_estabelecimentos (cnae_principal);
CREATE INDEX IF NOT EXISTS idx_estab_uf_mun ON rf_estabelecimentos (uf, municipio);

CREATE TABLE IF NOT EXISTS rf_socios (
  cnpj_basico                CHAR(8) NOT NULL,
  identificador_socio        TEXT,
  nome_socio                 TEXT,
  cpf_cnpj_socio             TEXT,
  qualificacao_socio         TEXT,
  data_entrada_sociedade     DATE,
  pais                       TEXT,
  representante_legal        TEXT,
  nome_representante         TEXT,
  qualificacao_representante TEXT,
  faixa_etaria               TEXT
);
CREATE INDEX IF NOT EXISTS idx_socios_basico ON rf_socios (cnpj_basico);
-- Permite o caminho reverso: dado um CPF, em que empresas ele é sócio.
-- A Receita divulga o CPF mascarado (***123456**), então a busca é por essa
-- máscara combinada com o nome — nunca pelo CPF completo, que ela não publica.
CREATE INDEX IF NOT EXISTS idx_socios_documento ON rf_socios (cpf_cnpj_socio);
CREATE INDEX IF NOT EXISTS idx_socios_nome ON rf_socios (nome_socio);

CREATE TABLE IF NOT EXISTS rf_simples (
  cnpj_basico          CHAR(8) PRIMARY KEY,
  opcao_simples        TEXT,
  data_opcao_simples   DATE,
  data_exclusao_simples DATE,
  opcao_mei            TEXT,
  data_opcao_mei       DATE,
  data_exclusao_mei    DATE
);

-- Tabelas auxiliares de domínio (código → descrição).
CREATE TABLE IF NOT EXISTS rf_cnaes        (codigo TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE IF NOT EXISTS rf_naturezas    (codigo TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE IF NOT EXISTS rf_qualificacoes(codigo TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE IF NOT EXISTS rf_municipios   (codigo TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE IF NOT EXISTS rf_paises       (codigo TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE IF NOT EXISTS rf_motivos      (codigo TEXT PRIMARY KEY, descricao TEXT);

-- ---------------------------------------------------------------------------
-- Devedores inscritos em dívida ativa da União (PGFN, dados abertos).
-- Divulgação oficial e pública; o CPF vem mascarado na origem.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pgfn_devedores (
  id              BIGSERIAL PRIMARY KEY,
  cpf_cnpj        TEXT NOT NULL,
  nome            TEXT,
  tipo_pessoa     TEXT,
  tipo_devedor    TEXT,
  unidade         TEXT,
  numero_inscricao TEXT,
  tipo_situacao   TEXT,
  situacao        TEXT,
  receita_principal TEXT,
  data_inscricao  DATE,
  indicador_ajuizado TEXT,
  valor           NUMERIC(18,2),
  referencia      TEXT
);
CREATE INDEX IF NOT EXISTS idx_pgfn_documento ON pgfn_devedores (cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_pgfn_nome ON pgfn_devedores (nome);
