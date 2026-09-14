/**
 * Primeira execução.
 *
 * Cria só o que é estrutura: as duas contas bancárias que a empresa já usa e as
 * regras de comissão informadas pela empresa (2% padrão, 0,5% no cimento).
 * Nada além disso é inventado — metas, custos e categorias vêm dos arquivos ou
 * são definidos nos Ajustes.
 *
 * As regras nascem marcadas com `origem: 'semente'`. Se você editar qualquer uma
 * delas, a marca cai e nenhuma atualização futura do app mexe no seu valor.
 */

import * as db from '../core/db.js';
import * as store from '../core/store.js';

const VERSAO_SEMENTE = 2;

const CONTAS = [
  { id: 'conta_itau', nome: 'Itaú', banco: 'Itaú', cor: '#EC7000', ordem: 1, ativa: true },
  { id: 'conta_bradesco', nome: 'Bradesco', banco: 'Bradesco', cor: '#CC092F', ordem: 2, ativa: true },
];

const REGRAS = [
  {
    id: 'regra_padrao',
    escopo: 'padrao',
    nome: 'Padrão da empresa',
    percentual: 2,
    base: 'valorProdutos',
    semComissao: false,
    ativo: true,
    origem: 'semente',
    observacao: 'Vale para tudo que não tiver regra mais específica.',
  },
  {
    id: 'regra_cimento',
    escopo: 'termo',
    nome: 'Cimento',
    // pela palavra, e não pela categoria: nem todo arquivo traz categoria,
    // mas "cimento" aparece na descrição do produto
    alvo: { termo: 'cimento' },
    percentual: 0.5,
    base: 'valorProdutos',
    semComissao: false,
    ativo: true,
    origem: 'semente',
    observacao: 'Qualquer produto com "cimento" na descrição ou na categoria.',
  },
];

export async function semear() {
  const marca = await db.get('kv', 'semente');
  if (marca?.versao >= VERSAO_SEMENTE) return false;

  const contas = await store.contas.listar();
  if (!contas.length) await store.contas.salvarMuitos(CONTAS);

  // só grava a regra que ainda não existe ou que continua como veio de fábrica
  const atuais = new Map((await store.regrasComissao.listar()).map((r) => [r.id, r]));
  const novas = REGRAS.filter((r) => {
    const atual = atuais.get(r.id);
    return !atual || atual.origem === 'semente';
  });
  if (novas.length) await store.regrasComissao.salvarMuitos(novas);

  await db.put('kv', { key: 'semente', versao: VERSAO_SEMENTE, em: Date.now() });
  return true;
}
