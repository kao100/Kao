/**
 * INADIMPLÊNCIA — relatório, não tarefa.
 *
 * Aqui não se marca nada. Dar baixa no app e no sistema seria o mesmo trabalho
 * duas vezes, então a baixa acontece onde sempre aconteceu: no sistema. Quando
 * o contas a receber for importado de novo, o que foi recebido some daqui
 * sozinho.
 *
 * O que esta tela responde, como gestora: quanto está vencido, há quanto tempo,
 * quem são os maiores, e o que vence nos próximos dias.
 */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as collection from '../../logic/collection.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, vazio, aviso, progresso } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { money, formatDate, today, addDays } from '../../core/format.js';
import { cents, sum } from '../../core/util.js';

export async function telaCobranca() {
  const carteira = await collection.carteira();
  const totais = collection.totais(carteira);
  definirTitulo('Inadimplência', totais.vencido ? `${money(totais.vencido)} vencidos` : 'nada vencido');

  if (!carteira.length) {
    return vazio('📥', 'Nenhum título a receber',
      'Importe o relatório de contas a receber para ver a inadimplência.',
      botao('Importar contas a receber', { tipo: 'primario', onClick: () => navigate('/arquivos/receber') }));
  }

  const abertos = carteira.filter((l) => !l.pago);
  const vencidos = abertos.filter((l) => l.vencido).sort((a, b) => b.valorAberto - a.valorAberto);
  const proximos = proximosDias(abertos, 7);
  const porCliente = agruparPorCliente(vencidos);

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--3',
      kpi({
        label: 'Vencido', valor: money(totais.vencido), icone: '🔴',
        nota: `${totais.titulosVencidos} título(s)`, cor: totais.vencido ? 'ruim' : 'ok',
      }),
      kpi({ label: 'A vencer', valor: money(totais.aVencer), icone: '🗓️' }),
      kpi({
        label: 'Vence em 7 dias', valor: money(cents(sum(proximos, (l) => l.valorAberto))),
        icone: '⏳', nota: `${proximos.length} título(s)`, cor: 'atencao',
      })),

    totais.vencido > 0 && card('Há quanto tempo está vencido', null,
      h('div.empilha', { style: { gap: '10px' } },
        ...totais.faixas.filter((f) => f.quantidade > 0).map((f) => h('div',
          h('div.linha.linha--entre', { style: { marginBottom: '4px' } },
            h('span.pequeno', f.label),
            h('span.num.forte', money(f.valor))),
          progresso({
            valor: f.valor,
            total: totais.vencido,
            cor: f.min > 60 ? 'var(--vermelho)' : f.min > 30 ? 'var(--laranja)' : 'var(--amarelo)',
            esquerda: `${f.quantidade} título(s)`,
            direita: `${Math.round((f.valor / totais.vencido) * 100)}% do vencido`,
          })))),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        'Quanto mais para baixo nesta lista, mais difícil de receber.')),

    porCliente.length > 0 && secao('Quem está devendo',
      exportadores(() => ({
        titulo: 'Inadimplência por cliente',
        subtitulo: `posição de ${formatDate(today())}`,
        nomeArquivo: `inadimplencia_${today()}`,
        colunas: COLUNAS_CLIENTE,
        linhas: porCliente,
        total: { nome: 'TOTAL', valor: totais.vencido, titulos: totais.titulosVencidos },
      })),
      card(null, null,
        tabela({
          colunas: COLUNAS_CLIENTE,
          linhas: porCliente,
          total: { nome: 'TOTAL', valor: totais.vencido, titulos: totais.titulosVencidos },
        }))),

    vencidos.length > 0 && secao('Título por título',
      exportadores(() => ({
        titulo: 'Títulos vencidos',
        subtitulo: `posição de ${formatDate(today())}`,
        nomeArquivo: `titulos_vencidos_${today()}`,
        colunas: COLUNAS_TITULO,
        linhas: vencidos.map(linhaTitulo),
        total: { clienteNome: 'TOTAL', valorAberto: totais.vencido },
      })),
      card(null, null,
        tabela({
          colunas: COLUNAS_TITULO,
          linhas: vencidos.map(linhaTitulo),
          total: { clienteNome: 'TOTAL', valorAberto: totais.vencido },
        }))),

    proximos.length > 0 && secao('Vence nos próximos 7 dias',
      exportadores(() => ({
        titulo: 'A vencer em 7 dias',
        subtitulo: `a partir de ${formatDate(today())}`,
        nomeArquivo: `a_vencer_${today()}`,
        colunas: COLUNAS_TITULO,
        linhas: proximos.map(linhaTitulo),
      })),
      card(null, null, tabela({ colunas: COLUNAS_TITULO, linhas: proximos.map(linhaTitulo) }))),

    aviso('Esta tela é só leitura. A baixa continua no seu sistema — quando você importar o '
      + 'contas a receber de novo, o que foi recebido sai daqui sozinho.', 'info'));
}

const COLUNAS_CLIENTE = [
  { header: 'Cliente', key: 'nome' },
  { header: 'Vencido', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: 'Títulos', key: 'titulos', tipo: 'int', alinhar: 'direita' },
  { header: 'Atraso maior', key: 'maiorAtraso', alinhar: 'direita' },
];

const COLUNAS_TITULO = [
  { header: 'Cliente', key: 'clienteNome' },
  { header: 'NF', key: 'nfNumero' },
  { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
  { header: 'Atraso', key: 'atraso', alinhar: 'direita' },
  { header: 'Valor', key: 'valorAberto', tipo: 'money', alinhar: 'direita' },
];

function linhaTitulo(l) {
  return {
    clienteNome: l.clienteNome,
    nfNumero: l.titulo?.nfNumero || null,
    vencimento: l.vencimento,
    atraso: l.diasAtraso > 0 ? `${l.diasAtraso} dia(s)` : '—',
    valorAberto: l.valorAberto,
  };
}

function proximosDias(abertos, dias) {
  const limite = addDays(today(), dias);
  return abertos
    .filter((l) => !l.vencido && l.vencimento && l.vencimento <= limite)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
}

function agruparPorCliente(vencidos) {
  const mapa = new Map();
  for (const l of vencidos) {
    const chave = l.titulo?.clienteId || l.clienteNome || 'sem';
    if (!mapa.has(chave)) {
      mapa.set(chave, { nome: l.clienteNome || 'não identificado', valor: 0, titulos: 0, dias: 0 });
    }
    const c = mapa.get(chave);
    c.valor += l.valorAberto;
    c.titulos += 1;
    c.dias = Math.max(c.dias, l.diasAtraso);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, valor: cents(c.valor), maiorAtraso: `${c.dias} dia(s)` }))
    .sort((a, b) => b.valor - a.valor);
}
