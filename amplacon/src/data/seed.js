/**
 * Primeira execução.
 *
 * Cria só o que é estrutura (as duas contas bancárias que a empresa já usa e a
 * regra padrão de comissão, zerada). Nenhum número é inventado: percentuais,
 * metas e categorias são definidos pelo usuário nos Ajustes.
 */

import * as db from '../core/db.js';
import * as store from '../core/store.js';

const VERSAO_SEMENTE = 1;

export async function semear() {
  const marca = await db.get('kv', 'semente');
  if (marca?.versao >= VERSAO_SEMENTE) return false;

  const contas = await store.contas.listar();
  if (!contas.length) {
    await store.contas.salvarMuitos([
      { id: 'conta_itau', nome: 'Itaú', banco: 'Itaú', cor: '#EC7000', ordem: 1, ativa: true },
      { id: 'conta_bradesco', nome: 'Bradesco', banco: 'Bradesco', cor: '#CC092F', ordem: 2, ativa: true },
    ]);
  }

  const regras = await store.regrasComissao.listar();
  if (!regras.length) {
    await store.regrasComissao.salvar({
      id: 'regra_padrao',
      escopo: 'padrao',
      nome: 'Padrão da empresa',
      percentual: 0,
      base: 'valorProdutos',
      semComissao: false,
      ativo: true,
      observacao: 'Defina o percentual padrão e cadastre as exceções por produto, categoria ou vendedor.',
    });
  }

  await db.put('kv', { key: 'semente', versao: VERSAO_SEMENTE, em: Date.now() });
  return true;
}
