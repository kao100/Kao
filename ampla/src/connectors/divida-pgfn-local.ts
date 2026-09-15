/**
 * Dívida ativa da União — base própria dos dados abertos da PGFN.
 *
 * Entra no produto de compliance porque responde uma pergunta diferente das
 * sanções: não "foi punido", mas "deve para a União". Local, custo zero.
 *
 * Como na base da Receita, o CPF vem mascarado na divulgação oficial — logo o
 * resultado para pessoa física só é devolvido com o nome conferido.
 *
 * Carga: `npm run ingest:pgfn`.
 */
import { consultarSql, umaLinha } from '../db/pool.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCompliance } from '../core/types.ts';
import { identificarDocumento, somenteDigitos, cpfParaMascaraReceita } from '../core/documents.ts';

const SQL_POR_DOCUMENTO = `
  SELECT nome, valor, data_inscricao, referencia
    FROM pgfn_devedores
   WHERE cpf_cnpj = $1
   LIMIT 1000
`;

const SQL_REFERENCIA = `
  SELECT referencia FROM pgfn_devedores WHERE referencia IS NOT NULL LIMIT 1
`;

async function buscar(entrada: string): Promise<DadosCompliance | null> {
  const [documentoBruto = '', nome = ''] = entrada.split('|');
  const documento = somenteDigitos(documentoBruto);
  const tipo = identificarDocumento(documento);
  if (tipo === 'invalido') return null;

  // A PGFN publica o CNPJ inteiro, mas mascara o CPF.
  const chave = tipo === 'cnpj' ? documento : cpfParaMascaraReceita(documento);

  let linhas: Array<{
    nome: string | null;
    valor: number | null;
    data_inscricao: string | null;
    referencia: string | null;
  }>;
  try {
    linhas = await consultarSql(SQL_POR_DOCUMENTO, [chave]);
  } catch {
    return null; // base ainda não carregada
  }

  // Máscara de CPF não identifica ninguém sozinha: exige nome conferido.
  const relevantes =
    tipo === 'cnpj'
      ? linhas
      : nome
        ? linhas.filter((l) => (l.nome ?? '').toUpperCase().includes(nome.toUpperCase().trim()))
        : [];

  const referencia =
    relevantes[0]?.referencia ??
    (await umaLinha<{ referencia: string }>(SQL_REFERENCIA))?.referencia ??
    null;

  return {
    documento,
    nome: relevantes[0]?.nome ?? null,
    pep: null,
    sancoes: [],
    dividaAtiva: {
      inscrito: relevantes.length > 0,
      quantidade: relevantes.length,
      valorTotal: relevantes.reduce((total, l) => total + (l.valor ?? 0), 0) || null,
      atualizadoEm: referencia,
    },
    alertas: [],
  };
}

export const conectorDividaPgfn: Conector<DadosCompliance> = {
  id: 'pgfn-divida-ativa',
  produto: 'compliance',
  descricao: 'PGFN — devedores inscritos em dívida ativa da União (base própria, gratuito)',
  tipoFonte: 'local',
  custoCentavos: 0,
  ordem: 10,
  disponivel: () => ({ ok: true }),
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorDividaPgfn);
