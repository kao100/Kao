/**
 * Dados de demonstração.
 *
 * A carga real da Receita leva horas e ~90 GB. Este seed insere algumas
 * empresas reais (dados públicos do CNPJ) só para que dê para subir a
 * plataforma, clicar no painel e ver a cascata funcionando em minutos.
 *
 *   node --experimental-strip-types ingest/seed-demo.ts
 */
import { consultarSql, pool } from '../src/db/pool.ts';
import { migrar } from '../src/db/migrate.ts';
import { log } from '../src/core/logger.ts';

await migrar();

await consultarSql(`
  INSERT INTO rf_cnaes (codigo, descricao) VALUES
    ('6201501', 'Desenvolvimento de programas de computador sob encomenda'),
    ('4711302', 'Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados'),
    ('6422100', 'Bancos múltiplos, com carteira comercial')
  ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao
`);

await consultarSql(`
  INSERT INTO rf_naturezas (codigo, descricao) VALUES
    ('2062', 'Sociedade Empresária Limitada'),
    ('2054', 'Sociedade Anônima Fechada'),
    ('2038', 'Sociedade Anônima Aberta')
  ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao
`);

await consultarSql(`
  INSERT INTO rf_municipios (codigo, descricao) VALUES
    ('7107', 'SAO PAULO'), ('6001', 'RIO DE JANEIRO'), ('4123', 'BELO HORIZONTE')
  ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao
`);

await consultarSql(`
  INSERT INTO rf_qualificacoes (codigo, descricao) VALUES
    ('49', 'Sócio-Administrador'), ('22', 'Sócio'), ('10', 'Diretor')
  ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao
`);

await consultarSql(`
  INSERT INTO rf_empresas (cnpj_basico, razao_social, natureza_juridica, capital_social, porte) VALUES
    ('19131243', 'ASSOCIACAO BRASILEIRA DE JORNALISMO INVESTIGATIVO', '2062', 0, '05'),
    ('00000000', 'EMPRESA DEMONSTRACAO LTDA', '2062', 100000, '03')
  ON CONFLICT (cnpj_basico) DO NOTHING
`);

await consultarSql(`
  INSERT INTO rf_estabelecimentos
    (cnpj_basico, cnpj_ordem, cnpj_dv, matriz_filial, nome_fantasia, situacao_cadastral,
     data_situacao_cadastral, data_inicio_atividade, cnae_principal, tipo_logradouro,
     logradouro, numero, bairro, cep, uf, municipio, ddd_1, telefone_1, email)
  VALUES
    ('19131243', '0001', '97', '1', 'ABRAJI', '02', '2013-10-03', '2013-10-03', '6201501',
     'RUA', 'BARAO DE ITAPETININGA', '140', 'REPUBLICA', '01042000', 'SP', '7107',
     '11', '33333333', 'contato@exemplo.org'),
    ('00000000', '0001', '91', '1', 'DEMO', '02', '2020-01-01', '2020-01-01', '4711302',
     'AVENIDA', 'PAULISTA', '1000', 'BELA VISTA', '01310100', 'SP', '7107',
     '11', '22222222', 'demo@exemplo.com')
  ON CONFLICT (cnpj_basico, cnpj_ordem, cnpj_dv) DO NOTHING
`);

await consultarSql(`
  INSERT INTO rf_simples (cnpj_basico, opcao_simples, data_opcao_simples, opcao_mei)
  VALUES ('19131243', 'N', NULL, 'N'), ('00000000', 'S', '2020-01-10', 'N')
  ON CONFLICT (cnpj_basico) DO NOTHING
`);

// CPF mascarado exatamente como a Receita publica: ***982247** é 529.982.247-25,
// o CPF de teste usado na suíte.
await consultarSql(`
  INSERT INTO rf_socios
    (cnpj_basico, identificador_socio, nome_socio, cpf_cnpj_socio, qualificacao_socio,
     data_entrada_sociedade, faixa_etaria)
  VALUES
    ('00000000', '2', 'MARIA DEMONSTRACAO DA SILVA', '***982247**', '49', '2020-01-01', '5'),
    ('00000000', '2', 'JOAO EXEMPLO SOUZA', '***111222**', '22', '2021-06-15', '4')
`);

await consultarSql(`
  INSERT INTO pgfn_devedores (cpf_cnpj, nome, tipo_pessoa, valor, data_inscricao, referencia)
  VALUES ('00000000000191', 'EMPRESA DEMONSTRACAO LTDA', 'PJ', 45320.18, '2023-05-10', '2026T2')
`);

log.info('seed de demonstração carregado', {
  cnpjs: ['19.131.243/0001-97', '00.000.000/0001-91'],
});
await pool.end();
