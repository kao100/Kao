/**
 * Produto CPF — agrega o que é gratuito e só então, se ainda faltar campo,
 * escala para a fonte paga.
 *
 * A função `suficiente` é o freio de custo: se o gratuito já respondeu tudo
 * que o chamador pediu em `campos`, a cascata para antes do SERPRO e do
 * bureau. Numa operação real é isso que segura a fatura.
 */
import { rotear } from '../core/router.ts';
import { validarCpf, somenteDigitos } from '../core/documents.ts';
import { erros } from '../core/errors.ts';
import type { DadosCpf, RespostaConsulta } from '../core/types.ts';

export function mesclarCpf(parciais: Array<{ fonte: string; dados: DadosCpf }>): DadosCpf | null {
  if (parciais.length === 0) return null;

  // Começa pelo gratuito e deixa as fontes seguintes preencherem as lacunas —
  // nunca sobrescrever um valor que já veio.
  const resultado: DadosCpf = { ...parciais[0]!.dados };

  for (const { dados } of parciais.slice(1)) {
    resultado.nome ??= dados.nome;
    resultado.situacaoCadastral ??= dados.situacaoCadastral;
    resultado.nascimento ??= dados.nascimento;
    resultado.nomeMae ??= dados.nomeMae;
    resultado.faixaRenda ??= dados.faixaRenda;
    resultado.obito ??= dados.obito;
    resultado.endereco ??= dados.endereco;
    if (dados.telefones.length) {
      resultado.telefones = [...new Set([...resultado.telefones, ...dados.telefones])];
    }
    if (dados.emails.length) {
      resultado.emails = [...new Set([...resultado.emails, ...dados.emails])];
    }
    if (dados.participacoesSocietarias.length) {
      resultado.participacoesSocietarias = dados.participacoesSocietarias;
    }
  }

  // Recalcula o que ficou faltando de verdade, olhando o objeto final.
  const faltando: string[] = [];
  if (!resultado.nome) faltando.push('nome');
  if (!resultado.situacaoCadastral) faltando.push('situacaoCadastral');
  if (!resultado.nascimento) faltando.push('nascimento');
  if (!resultado.nomeMae) faltando.push('nomeMae');
  if (resultado.telefones.length === 0) faltando.push('telefones');
  if (resultado.emails.length === 0) faltando.push('emails');
  if (!resultado.endereco) faltando.push('endereco');
  if (!resultado.faixaRenda) faltando.push('faixaRenda');
  if (resultado.obito === null) faltando.push('obito');
  resultado.camposIndisponiveis = faltando;

  return resultado;
}

export async function consultarCpf(
  entrada: string,
  finalidade: string,
  opcoes: { nome?: string; campos?: string[]; usarCache?: boolean; semFontePaga?: boolean } = {},
): Promise<RespostaConsulta<DadosCpf>> {
  const cpf = somenteDigitos(entrada);
  if (!validarCpf(cpf)) throw erros.documentoInvalido(entrada);

  const campos = opcoes.campos ?? [];

  return rotear<DadosCpf>({
    produto: 'cpf',
    // O nome entra na chave porque muda o resultado (vínculo societário).
    consulta: opcoes.nome ? `${cpf}|${opcoes.nome}` : cpf,
    finalidade,
    modo: 'agregar',
    mesclar: mesclarCpf,
    camposDesejados: campos,
    usarCache: opcoes.usarCache ?? true,
    // Corta as fontes pagas da cascata quando o chamador pede explicitamente.
    excluirFontes: opcoes.semFontePaga ? ['serpro-cpf', 'bureau-cpf'] : [],
    suficiente: (dados) =>
      campos.length > 0 && campos.every((campo) => !dados.camposIndisponiveis.includes(campo)),
  });
}
