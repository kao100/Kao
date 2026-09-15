/**
 * Registro de conectores.
 *
 * Um conector é uma fonte de dados embrulhada numa interface única. O resto
 * da plataforma nunca sabe se o dado veio de uma tabela local, de uma API
 * pública gratuita ou de um fornecedor pago — só o conector sabe.
 *
 * Trocar de fornecedor é trocar um conector. Nada mais muda.
 */
import type { MotivoIndisponivel, Produto } from './types.ts';

export type TipoFonte =
  /** Tabela no nosso Postgres. Custo zero, latência de milissegundos. */
  | 'local'
  /** API pública oficial e gratuita. Custo zero, latência de rede. */
  | 'publica'
  /** Fornecedor pago. Só entra na cascata quando ninguém antes respondeu. */
  | 'paga';

export interface ContextoConsulta {
  consultaId: string;
  finalidade: string;
  /** Campos que o chamador realmente precisa; permite pular fonte paga. */
  camposDesejados?: string[];
}

export interface Conector<T = unknown> {
  id: string;
  produto: Produto;
  descricao: string;
  tipoFonte: TipoFonte;
  /** Custo por consulta, em centavos. Fontes locais e públicas são 0. */
  custoCentavos: number;
  /**
   * Posição na cascata: menor roda antes. Por convenção, local = 10,
   * pública = 20..40, paga = 100+. Fonte paga sempre por último.
   */
  ordem: number;
  /**
   * Está apta a ser chamada agora? Falso quando falta credencial ou quando
   * a fonte paga está desligada. Fonte indisponível não é erro: é um degrau
   * pulado na cascata.
   */
  disponivel(): { ok: true } | { ok: false; motivo: MotivoIndisponivel; detalhe?: string };
  consultar(entrada: string, contexto: ContextoConsulta): Promise<T | null>;
}

const registro = new Map<Produto, Conector<any>[]>();

export function registrar(conector: Conector<any>): void {
  const lista = registro.get(conector.produto) ?? [];
  if (lista.some((c) => c.id === conector.id)) {
    throw new Error(`Conector duplicado: ${conector.id}`);
  }
  lista.push(conector);
  lista.sort((a, b) => a.ordem - b.ordem);
  registro.set(conector.produto, lista);
}

export function conectoresDe(produto: Produto): Conector<any>[] {
  return registro.get(produto) ?? [];
}

export function todosConectores(): Conector<any>[] {
  return [...registro.values()].flat().sort((a, b) => a.ordem - b.ordem);
}

/** Usado pelo painel para mostrar o que está ligado e o que falta configurar. */
export function inventario() {
  return todosConectores().map((c) => {
    const estado = c.disponivel();
    return {
      id: c.id,
      produto: c.produto,
      descricao: c.descricao,
      tipoFonte: c.tipoFonte,
      custoCentavos: c.custoCentavos,
      ordem: c.ordem,
      disponivel: estado.ok,
      motivo: estado.ok ? null : estado.motivo,
      detalhe: estado.ok ? null : (estado.detalhe ?? null),
    };
  });
}
