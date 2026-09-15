/**
 * SERPRO — Consulta CPF (situação cadastral na Receita Federal).
 *
 * DESLIGADO por padrão. Enquanto SERPRO_CPF_ENABLED=false este conector não
 * faz chamada nenhuma, não gera custo e responde 'fonte_desabilitada' — a
 * cascata simplesmente pula este degrau.
 *
 * Quando a Ampla fechar o contrato (pay-per-use, sem mensalidade), basta
 * preencher as variáveis no .env. Nenhuma outra linha do sistema muda.
 *
 * O mapeamento abaixo segue o contrato publicado do serviço; confirme os
 * nomes de campo contra a documentação vigente na primeira chamada real.
 */
import { config } from '../../config.ts';
import { buscarJson, ErroHttp } from '../../core/http.ts';
import { registrar, type Conector } from '../../core/registry.ts';
import type { DadosCpf } from '../../core/types.ts';
import { formatarCpf } from '../../core/documents.ts';
import { separarEntradaCpf } from '../cpf-local.ts';

interface RespostaSerpro {
  ni: string;
  nome: string;
  situacao: { codigo: string; descricao: string };
  nascimento?: string;
  obito?: string;
}

async function buscar(entrada: string): Promise<DadosCpf | null> {
  const { cpf } = separarEntradaCpf(entrada);
  try {
    const r = await buscarJson<RespostaSerpro>(`${config.serproCpf.baseUrl}/cpf/${cpf}`, {
      cabecalhos: { authorization: `Bearer ${config.serproCpf.token}` },
      tempoLimiteMs: 10_000,
    });

    return {
      cpf: formatarCpf(cpf),
      valido: true,
      nome: r.nome ?? null,
      situacaoCadastral: r.situacao?.descricao ?? null,
      nascimento: r.nascimento ?? null,
      nomeMae: null,
      telefones: [],
      emails: [],
      endereco: null,
      faixaRenda: null,
      obito: r.obito ? true : null,
      participacoesSocietarias: [],
      // O SERPRO entrega situação cadastral e nome, mas não contato nem renda.
      camposIndisponiveis: ['nomeMae', 'telefones', 'emails', 'endereco', 'faixaRenda'],
    };
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 404) return null;
    throw erro;
  }
}

export const conectorSerproCpf: Conector<DadosCpf> = {
  id: 'serpro-cpf',
  produto: 'cpf',
  descricao: 'SERPRO — situação cadastral do CPF na Receita Federal (pago, por consulta)',
  tipoFonte: 'paga',
  // Ajuste para o preço real do contrato: o painel usa isto para calcular
  // quanto cada consulta custou e quanto o cache economizou.
  custoCentavos: 10,
  ordem: 100,
  disponivel() {
    if (!config.serproCpf.habilitado) {
      return {
        ok: false,
        motivo: 'fonte_desabilitada',
        detalhe: 'SERPRO_CPF_ENABLED=false — nenhuma chamada e nenhum custo.',
      };
    }
    if (!config.serproCpf.token || !config.serproCpf.baseUrl) {
      return { ok: false, motivo: 'fonte_sem_credencial', detalhe: 'Falta SERPRO_CPF_TOKEN.' };
    }
    return { ok: true };
  },
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorSerproCpf);
