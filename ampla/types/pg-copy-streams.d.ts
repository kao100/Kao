/**
 * Tipagem mínima do pg-copy-streams (o pacote não publica tipos).
 * O objeto devolvido é ao mesmo tempo um Writable e um Submittable do pg —
 * é isso que permite `pipeline(leitura, cliente.query(copyFrom(sql)))`.
 */
declare module 'pg-copy-streams' {
  import type { Writable, Readable } from 'node:stream';

  export interface CopyStreamQuery extends Writable {
    submit(connection: unknown): void;
  }
  export interface CopyToStreamQuery extends Readable {
    submit(connection: unknown): void;
  }

  export function from(sql: string): CopyStreamQuery;
  export function to(sql: string): CopyToStreamQuery;
}
