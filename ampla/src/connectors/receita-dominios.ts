/** Códigos de domínio dos dados abertos da Receita Federal. */

export const SITUACAO_CADASTRAL: Record<string, string> = {
  '01': 'NULA',
  '02': 'ATIVA',
  '03': 'SUSPENSA',
  '04': 'INAPTA',
  '08': 'BAIXADA',
};

export const PORTE: Record<string, string> = {
  '00': 'NAO INFORMADO',
  '01': 'MICRO EMPRESA',
  '03': 'EMPRESA DE PEQUENO PORTE',
  '05': 'DEMAIS',
};

export const IDENTIFICADOR_SOCIO: Record<string, 'pessoa-juridica' | 'pessoa-fisica' | 'estrangeiro'> = {
  '1': 'pessoa-juridica',
  '2': 'pessoa-fisica',
  '3': 'estrangeiro',
};

export function descreverSituacao(codigo: string | null): string {
  if (!codigo) return 'DESCONHECIDA';
  return SITUACAO_CADASTRAL[codigo.padStart(2, '0')] ?? `CODIGO ${codigo}`;
}

export function descreverPorte(codigo: string | null): string | null {
  if (!codigo) return null;
  return PORTE[codigo.padStart(2, '0')] ?? `CODIGO ${codigo}`;
}

export function descreverTipoSocio(codigo: string | null): 'pessoa-fisica' | 'pessoa-juridica' | 'estrangeiro' | 'desconhecido' {
  if (!codigo) return 'desconhecido';
  return IDENTIFICADOR_SOCIO[codigo.trim()] ?? 'desconhecido';
}

/** A Receita grava "S"/"N" em vários campos de opção. */
export function simOuNao(valor: string | null): boolean {
  return (valor ?? '').trim().toUpperCase() === 'S';
}
