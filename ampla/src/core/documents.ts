/**
 * Validação e normalização de CPF e CNPJ.
 *
 * Roda localmente, sem custo e sem chamada externa. É o primeiro degrau da
 * cascata: documento com dígito verificador errado é rejeitado antes de
 * qualquer fonte ser consultada — inclusive as pagas.
 */

export function somenteDigitos(valor: string): string {
  return (valor || '').replace(/\D/g, '');
}

/** CPFs de dígito repetido (000..., 111...) passam no cálculo, mas não existem. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

export function validarCpf(entrada: string): boolean {
  const cpf = somenteDigitos(entrada);
  if (cpf.length !== 11 || todosIguais(cpf)) return false;

  for (const [tamanho, posicao] of [[9, 10], [10, 11]] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (posicao - i);
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 || resto === 11 ? 0 : resto;
    if (esperado !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export function validarCnpj(entrada: string): boolean {
  const cnpj = somenteDigitos(entrada);
  if (cnpj.length !== 14 || todosIguais(cnpj)) return false;

  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const tamanho of [12, 13]) {
    const fatores = pesos.slice(pesos.length - tamanho);
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cnpj[i]) * fatores[i]!;
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (esperado !== Number(cnpj[tamanho])) return false;
  }
  return true;
}

export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor).padStart(11, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCnpj(valor: string): string {
  const d = somenteDigitos(valor).padStart(14, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Máscara no padrão que os órgãos públicos usam ao divulgar CPF
 * (***.123.456-**). A base da Receita já traz os CPFs de sócios assim.
 */
export function mascararCpf(valor: string): string {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return '***';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Converte um CPF completo para a forma mascarada de 11 posições da Receita. */
export function cpfParaMascaraReceita(valor: string): string {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return '';
  return `***${d.slice(3, 9)}**`;
}

export type TipoDocumento = 'cpf' | 'cnpj' | 'invalido';

export function identificarDocumento(entrada: string): TipoDocumento {
  const d = somenteDigitos(entrada);
  if (d.length === 11) return validarCpf(d) ? 'cpf' : 'invalido';
  if (d.length === 14) return validarCnpj(d) ? 'cnpj' : 'invalido';
  return 'invalido';
}

/** CNPJ raiz (8 primeiros dígitos) — chave da base de dados abertos. */
export function raizCnpj(valor: string): string {
  return somenteDigitos(valor).slice(0, 8);
}
