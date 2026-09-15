/**
 * CNPJ pela base própria (dados abertos da Receita Federal).
 *
 * Este é o conector que paga o projeto: resolve a consulta de CNPJ inteira
 * — cadastro, endereço, CNAE, Simples/MEI e quadro societário — sem nenhuma
 * chamada externa, sem crédito e sem mensalidade. Enquanto a base estiver
 * carregada, nenhuma consulta de CNPJ precisa de fornecedor pago.
 *
 * Carga: `npm run ingest:cnpj`.
 */
import { consultarSql, umaLinha } from '../db/pool.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCnpj, Socio } from '../core/types.ts';
import { somenteDigitos, formatarCnpj } from '../core/documents.ts';
import {
  descreverSituacao,
  descreverPorte,
  descreverTipoSocio,
  simOuNao,
} from './receita-dominios.ts';

interface LinhaEstabelecimento {
  cnpj_basico: string;
  cnpj_ordem: string;
  cnpj_dv: string;
  matriz_filial: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  motivo_situacao_cadastral: string | null;
  motivo_descricao: string | null;
  data_inicio_atividade: string | null;
  cnae_principal: string | null;
  cnae_principal_descricao: string | null;
  cnae_secundaria: string | null;
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  uf: string | null;
  municipio_descricao: string | null;
  ddd_1: string | null;
  telefone_1: string | null;
  ddd_2: string | null;
  telefone_2: string | null;
  email: string | null;
  razao_social: string | null;
  natureza_juridica: string | null;
  natureza_descricao: string | null;
  capital_social: number | null;
  porte: string | null;
  opcao_simples: string | null;
  data_opcao_simples: string | null;
  opcao_mei: string | null;
}

const SQL_ESTABELECIMENTO = `
  SELECT e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv, e.matriz_filial, e.nome_fantasia,
         e.situacao_cadastral, e.data_situacao_cadastral, e.motivo_situacao_cadastral,
         mot.descricao AS motivo_descricao,
         e.data_inicio_atividade, e.cnae_principal,
         cna.descricao AS cnae_principal_descricao,
         e.cnae_secundaria, e.tipo_logradouro, e.logradouro, e.numero, e.complemento,
         e.bairro, e.cep, e.uf, mun.descricao AS municipio_descricao,
         e.ddd_1, e.telefone_1, e.ddd_2, e.telefone_2, e.email,
         emp.razao_social, emp.natureza_juridica,
         nat.descricao AS natureza_descricao,
         emp.capital_social, emp.porte,
         sim.opcao_simples, sim.data_opcao_simples, sim.opcao_mei
    FROM rf_estabelecimentos e
    LEFT JOIN rf_empresas     emp ON emp.cnpj_basico = e.cnpj_basico
    LEFT JOIN rf_simples      sim ON sim.cnpj_basico = e.cnpj_basico
    LEFT JOIN rf_cnaes        cna ON cna.codigo = e.cnae_principal
    LEFT JOIN rf_naturezas    nat ON nat.codigo = emp.natureza_juridica
    LEFT JOIN rf_municipios   mun ON mun.codigo = e.municipio
    LEFT JOIN rf_motivos      mot ON mot.codigo = e.motivo_situacao_cadastral
   WHERE e.cnpj_basico = $1 AND e.cnpj_ordem = $2 AND e.cnpj_dv = $3
`;

const SQL_SOCIOS = `
  SELECT s.identificador_socio, s.nome_socio, s.cpf_cnpj_socio,
         s.qualificacao_socio, q.descricao AS qualificacao_descricao,
         s.data_entrada_sociedade, s.faixa_etaria,
         s.nome_representante, s.representante_legal
    FROM rf_socios s
    LEFT JOIN rf_qualificacoes q ON q.codigo = s.qualificacao_socio
   WHERE s.cnpj_basico = $1
   ORDER BY s.nome_socio
`;

const SQL_CNAES_SECUNDARIOS = `
  SELECT codigo, descricao FROM rf_cnaes WHERE codigo = ANY($1::text[])
`;

async function montarCnaesSecundarios(lista: string | null) {
  const codigos = (lista ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (codigos.length === 0) return [];

  const descricoes = await consultarSql<{ codigo: string; descricao: string | null }>(
    SQL_CNAES_SECUNDARIOS,
    [codigos],
  );
  const mapa = new Map(descricoes.map((d) => [d.codigo, d.descricao]));
  return codigos.map((codigo) => ({ codigo, descricao: mapa.get(codigo) ?? null }));
}

function montarTelefone(ddd: string | null, numero: string | null): string | null {
  const d = somenteDigitos(ddd ?? '');
  const n = somenteDigitos(numero ?? '');
  if (!n) return null;
  return d ? `(${d}) ${n}` : n;
}

async function buscar(cnpj: string): Promise<DadosCnpj | null> {
  const digitos = somenteDigitos(cnpj);
  const basico = digitos.slice(0, 8);
  const ordem = digitos.slice(8, 12);
  const dv = digitos.slice(12, 14);

  const linha = await umaLinha<LinhaEstabelecimento>(SQL_ESTABELECIMENTO, [basico, ordem, dv]);
  if (!linha) return null;

  const socios = await consultarSql<{
    identificador_socio: string | null;
    nome_socio: string | null;
    cpf_cnpj_socio: string | null;
    qualificacao_socio: string | null;
    qualificacao_descricao: string | null;
    data_entrada_sociedade: string | null;
    faixa_etaria: string | null;
    nome_representante: string | null;
    representante_legal: string | null;
  }>(SQL_SOCIOS, [basico]);

  const logradouroCompleto = [linha.tipo_logradouro, linha.logradouro]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    cnpj: formatarCnpj(digitos),
    razaoSocial: linha.razao_social ?? '',
    nomeFantasia: linha.nome_fantasia || null,
    situacaoCadastral: descreverSituacao(linha.situacao_cadastral),
    dataSituacaoCadastral: linha.data_situacao_cadastral,
    motivoSituacao: linha.motivo_descricao || null,
    matriz: (linha.matriz_filial ?? '1').trim() === '1',
    dataAbertura: linha.data_inicio_atividade,
    naturezaJuridica: linha.natureza_juridica
      ? { codigo: linha.natureza_juridica, descricao: linha.natureza_descricao }
      : null,
    porte: descreverPorte(linha.porte),
    capitalSocial: linha.capital_social,
    cnaePrincipal: linha.cnae_principal
      ? { codigo: linha.cnae_principal, descricao: linha.cnae_principal_descricao }
      : null,
    cnaesSecundarios: await montarCnaesSecundarios(linha.cnae_secundaria),
    endereco: {
      logradouro: logradouroCompleto || null,
      numero: linha.numero || null,
      complemento: linha.complemento || null,
      bairro: linha.bairro || null,
      municipio: linha.municipio_descricao || null,
      uf: linha.uf || null,
      cep: linha.cep ? somenteDigitos(linha.cep) : null,
    },
    telefones: [
      montarTelefone(linha.ddd_1, linha.telefone_1),
      montarTelefone(linha.ddd_2, linha.telefone_2),
    ].filter((t): t is string => t !== null),
    email: linha.email || null,
    simplesNacional: {
      optante: simOuNao(linha.opcao_simples),
      desde: linha.data_opcao_simples,
      mei: simOuNao(linha.opcao_mei),
    },
    socios: socios.map<Socio>((s) => ({
      nome: s.nome_socio ?? '',
      // A Receita já publica o CPF de sócio mascarado (***123456**).
      // Repassamos exatamente como veio: não temos, nem queremos ter, o
      // CPF completo a partir desta fonte.
      documento: s.cpf_cnpj_socio || null,
      tipo: descreverTipoSocio(s.identificador_socio),
      qualificacao: s.qualificacao_descricao || s.qualificacao_socio || null,
      entradaEm: s.data_entrada_sociedade,
      faixaEtaria: s.faixa_etaria || null,
      representanteLegal: s.nome_representante
        ? { nome: s.nome_representante, documento: s.representante_legal || null }
        : null,
    })),
  };
}

/** A base existe e tem dados? Sem isso, a cascata pula direto para o fallback. */
let baseCarregada: boolean | null = null;
export async function verificarBaseReceita(): Promise<boolean> {
  try {
    const linha = await umaLinha<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM rf_estabelecimentos LIMIT 1) AS existe`,
    );
    baseCarregada = linha?.existe ?? false;
  } catch {
    baseCarregada = false;
  }
  return baseCarregada;
}

export const conectorCnpjLocal: Conector<DadosCnpj> = {
  id: 'receita-cnpj-local',
  produto: 'cnpj',
  descricao: 'Base própria dos dados abertos do CNPJ da Receita Federal',
  tipoFonte: 'local',
  custoCentavos: 0,
  ordem: 10,
  disponivel() {
    if (baseCarregada === false) {
      return {
        ok: false,
        motivo: 'fonte_indisponivel',
        detalhe: 'Base da Receita ainda não carregada. Rode: npm run ingest:cnpj',
      };
    }
    return { ok: true };
  },
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorCnpjLocal);
