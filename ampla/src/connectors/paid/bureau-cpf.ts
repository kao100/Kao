/**
 * Bureau de crédito — cadastral completo e score.
 *
 * DESLIGADO por padrão. É o único caminho legítimo para nome, endereço,
 * telefone, renda presumida, score e negativação: esses dados não existem em
 * fonte pública e não há como contorná-los tecnicamente.
 *
 * O conector fala um formato genérico de propósito. A ideia é que trocar
 * Serasa por Boa Vista, Quod ou SPC seja reescrever só este arquivo — a
 * normalização para `DadosCpf` protege o resto do sistema do fornecedor.
 */
import { config } from '../../config.ts';
import { buscarJson, ErroHttp } from '../../core/http.ts';
import { registrar, type Conector } from '../../core/registry.ts';
import type { DadosCpf } from '../../core/types.ts';
import { formatarCpf } from '../../core/documents.ts';
import { separarEntradaCpf } from '../cpf-local.ts';

interface RespostaBureau {
  nome?: string;
  dataNascimento?: string;
  nomeMae?: string;
  situacaoReceita?: string;
  obito?: boolean;
  telefones?: Array<{ ddd?: string; numero?: string }>;
  emails?: string[];
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
  faixaRenda?: string;
}

async function buscar(entrada: string): Promise<DadosCpf | null> {
  const { cpf } = separarEntradaCpf(entrada);
  try {
    const r = await buscarJson<RespostaBureau>(`${config.bureau.baseUrl}/cpf/${cpf}`, {
      cabecalhos: { authorization: `Bearer ${config.bureau.token}` },
      tempoLimiteMs: 12_000,
    });

    const e = r.endereco;
    return {
      cpf: formatarCpf(cpf),
      valido: true,
      nome: r.nome ?? null,
      situacaoCadastral: r.situacaoReceita ?? null,
      nascimento: r.dataNascimento ?? null,
      nomeMae: r.nomeMae ?? null,
      telefones: (r.telefones ?? [])
        .map((t) => [t.ddd, t.numero].filter(Boolean).join(' ').trim())
        .filter(Boolean),
      emails: r.emails ?? [],
      endereco: e
        ? {
            logradouro: e.logradouro ?? null,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            municipio: e.cidade ?? null,
            uf: e.uf ?? null,
            cep: e.cep ?? null,
          }
        : null,
      faixaRenda: r.faixaRenda ?? null,
      obito: r.obito ?? null,
      participacoesSocietarias: [],
      camposIndisponiveis: [],
    };
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 404) return null;
    throw erro;
  }
}

export const conectorBureauCpf: Conector<DadosCpf> = {
  id: 'bureau-cpf',
  produto: 'cpf',
  descricao: 'Bureau de crédito — cadastral completo (pago, por consulta)',
  tipoFonte: 'paga',
  custoCentavos: 24,
  ordem: 110,
  disponivel() {
    if (!config.bureau.habilitado) {
      return {
        ok: false,
        motivo: 'fonte_desabilitada',
        detalhe: 'BUREAU_ENABLED=false — nenhuma chamada e nenhum custo.',
      };
    }
    if (!config.bureau.token || !config.bureau.baseUrl) {
      return { ok: false, motivo: 'fonte_sem_credencial', detalhe: 'Falta BUREAU_TOKEN.' };
    }
    return { ok: true };
  },
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorBureauCpf);
