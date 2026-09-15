/**
 * Processos judiciais — API pública do DataJud (CNJ). Gratuita.
 *
 * Limite importante, e vale dizer sem rodeio: o DataJud **não permite buscar
 * processo por CPF ou CNPJ**. A base nacional expõe metadados da capa
 * (número, classe, assuntos, órgão julgador, movimentos) e omite os
 * documentos das partes de propósito. Nome de parte só aparece em parte dos
 * tribunais, de forma irregular.
 *
 * Então aqui há duas consultas, com honestidade sobre o que cada uma é:
 *  - por número de processo: confiável, é o caso de uso oficial da API;
 *  - por nome de parte: tentativa, varia por tribunal, pode não achar nada
 *    mesmo existindo processo.
 *
 * Busca judicial por documento, de forma abrangente, só existe em serviço
 * pago (Escavador, Jusbrasil, Digesto). Não há substituto público.
 */
import { config } from '../config.ts';
import { buscarJson } from '../core/http.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { Processo } from '../core/types.ts';
import { somenteDigitos } from '../core/documents.ts';

/**
 * Aliases dos índices por tribunal. A API tem um índice por tribunal; para
 * varrer o país inteiro seria uma chamada por índice, o que é lento e pesado.
 * Por padrão varremos os tribunais de maior volume; dá para passar o tribunal
 * explicitamente na consulta para ir direto ao ponto.
 */
const TRIBUNAIS_PADRAO = [
  'api_publica_tjsp', 'api_publica_tjrj', 'api_publica_tjmg', 'api_publica_tjrs',
  'api_publica_tjpr', 'api_publica_tjba', 'api_publica_tjsc', 'api_publica_tjgo',
  'api_publica_trf1', 'api_publica_trf2', 'api_publica_trf3',
];

interface RespostaDataJud {
  hits?: {
    hits?: Array<{
      _source?: {
        numeroProcesso?: string;
        tribunal?: string;
        classe?: { nome?: string };
        assuntos?: Array<{ nome?: string }>;
        orgaoJulgador?: { nome?: string };
        dataAjuizamento?: string;
        dataHoraUltimaAtualizacao?: string;
        grau?: string;
      };
    }>;
  };
}

function normalizar(resposta: RespostaDataJud): Processo[] {
  return (resposta.hits?.hits ?? []).flatMap((hit) => {
    const f = hit._source;
    if (!f?.numeroProcesso) return [];
    return [
      {
        numero: f.numeroProcesso,
        tribunal: f.tribunal ?? null,
        classe: f.classe?.nome ?? null,
        assuntos: (f.assuntos ?? []).map((a) => a.nome).filter((n): n is string => !!n),
        orgaoJulgador: f.orgaoJulgador?.nome ?? null,
        dataAjuizamento: f.dataAjuizamento ?? null,
        ultimaAtualizacao: f.dataHoraUltimaAtualizacao ?? null,
        grau: f.grau ?? null,
      },
    ];
  });
}

async function consultarIndice(indice: string, corpo: unknown): Promise<Processo[]> {
  const resposta = await buscarJson<RespostaDataJud>(
    `${config.datajud.baseUrl}/${indice}/_search`,
    {
      metodo: 'POST',
      corpo,
      cabecalhos: { authorization: `APIKey ${config.datajud.apiKey}` },
      tempoLimiteMs: 12_000,
      tentativas: 2,
    },
  );
  return normalizar(resposta);
}

/** Entrada: "numero:00008323520184013301" ou "nome:FULANO DE TAL[:tribunal]". */
async function buscar(entrada: string): Promise<{ processos: Processo[]; aviso: string | null } | null> {
  const [modo = '', valor = '', tribunal = ''] = entrada.split(':');

  if (modo === 'numero') {
    const numero = somenteDigitos(valor);
    const corpo = { size: 10, query: { match: { numeroProcesso: numero } } };
    const indices = tribunal ? [`api_publica_${tribunal}`] : TRIBUNAIS_PADRAO;

    for (const indice of indices) {
      try {
        const processos = await consultarIndice(indice, corpo);
        if (processos.length > 0) return { processos, aviso: null };
      } catch {
        // índice fora do ar ou inexistente: segue para o próximo
      }
    }
    return null;
  }

  if (modo === 'nome') {
    const corpo = {
      size: 20,
      query: { match_phrase: { 'partes.nome': valor } },
    };
    const indices = tribunal ? [`api_publica_${tribunal}`] : TRIBUNAIS_PADRAO.slice(0, 4);
    const encontrados: Processo[] = [];

    for (const indice of indices) {
      try {
        encontrados.push(...(await consultarIndice(indice, corpo)));
      } catch {
        /* idem */
      }
    }
    if (encontrados.length === 0) return null;
    return {
      processos: encontrados,
      aviso:
        'Busca por nome de parte no DataJud é parcial: nem todo tribunal publica ' +
        'as partes. Ausência de resultado não significa ausência de processo.',
    };
  }

  return null;
}

export const conectorProcessosDataJud: Conector<{ processos: Processo[]; aviso: string | null }> = {
  id: 'datajud-processos',
  produto: 'processos',
  descricao: 'DataJud/CNJ — metadados de processos judiciais (gratuito)',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 20,
  disponivel() {
    if (!config.datajud.apiKey) {
      return {
        ok: false,
        motivo: 'fonte_sem_credencial',
        detalhe:
          'Falta DATAJUD_API_KEY. A chave é pública e divulgada pelo CNJ: ' +
          'https://datajud-wiki.cnj.jus.br/api-publica/acesso',
      };
    }
    return { ok: true };
  },
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorProcessosDataJud);
