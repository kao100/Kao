/**
 * Registro de auditoria.
 *
 * Toda consulta é gravada: quem pediu, o que pediu, com que finalidade, de
 * onde veio a resposta e quanto custou. Isso não é enfeite — é o que a LGPD
 * exige de um controlador que trata dado pessoal, e é também o relatório que
 * mostra se o cache e a cascata estão de fato economizando.
 */
import { consultarSql } from '../db/pool.ts';
import { identificarDocumento } from './documents.ts';
import { log } from './logger.ts';
import type { RespostaConsulta } from './types.ts';

export interface DadosAuditoria {
  resposta: RespostaConsulta<unknown>;
  finalidade: string;
  chaveId?: number | null;
  usuarioId?: number | null;
  ip?: string | null;
}

export async function registrarConsulta({
  resposta,
  finalidade,
  chaveId = null,
  usuarioId = null,
  ip = null,
}: DadosAuditoria): Promise<void> {
  try {
    await consultarSql(
      `INSERT INTO consultas
         (consulta_id, produto, documento, documento_tipo, finalidade, chave_id,
          usuario_id, ip, origem, encontrado, fontes, custo_centavos, latencia_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        resposta.consultaId,
        resposta.produto,
        resposta.consulta,
        identificarDocumento(resposta.consulta.split('|')[0] ?? ''),
        finalidade,
        chaveId,
        usuarioId,
        ip,
        resposta.origem,
        resposta.encontrado,
        JSON.stringify(resposta.fontes),
        resposta.custoTotalCentavos,
        resposta.latenciaTotalMs,
      ],
    );
  } catch (erro) {
    // Auditoria nunca derruba a consulta, mas falha nela é grave: fica no log
    // de erro para alarmar.
    log.error('falha ao gravar auditoria', {
      consultaId: resposta.consultaId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
  }
}
