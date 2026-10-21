/**
 * CAIXA — PERÍODO FECHADO. Onde o dinheiro entrou e, principalmente, por onde saiu.
 *
 * "Lembrando, isso é visibilidade. Eu vou alimentar ele, mas eu não vou fazer
 *  nenhum ajuste nele. É uma coisa que eu vou fazer diária, mas eu não vou
 *  confirmar, por exemplo, nada aqui."
 *
 * Por isso aqui não há um botão que mexa num lançamento. A tela só olha: a
 * situação vem do relatório que ela manda, e quem confirma pagamento é o
 * sistema dela. A única coisa que ela digita no app continua sendo o saldo do
 * dia, que nenhum relatório traz.
 *
 * A outra metade do Caixa — a projeção dos próximos dias — continua onde
 * estava. São duas perguntas: "para onde foi" olha para trás, "dá para pagar"
 * olha para frente.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as caixa from '../../logic/caixa.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, chips, aviso, selo } from '../components/ui.js';
import { grafBarrasDuplas, legenda, barraHorizontal } from '../components/chart.js';
import { escada, arvore } from '../components/escada.js';
import { tabela, exportadores } from '../components/table.js';
import {
  money, pct, num, formatDate, monthKey, monthLabel, monthLabelShort,
  monthStart, monthEnd, addMonths, today,
} from '../../core/format.js';

export async function telaCaixaRealizado({ query }) {
  const mes = query.m || monthKey(today());
  const de = monthStart(`${mes}-01`);
  const ate = monthEnd(`${mes}-01`);
  const r = await caixa.realizado({ de, ate });
  definirTitulo('Caixa do período', monthLabel(mes));

  return h('div.empilha', { style: { gap: '14px' } },
    alternador('realizado', { m: mes }),
    seletorDeMes(mes),

    h('div.grade.grade--4',
      kpi({
        label: 'Recebimentos', valor: money(r.entradas.total.valor), icone: '↗', cor: 'ok',
        nota: `${r.entradas.total.quantidade} lançamento(s)`, tamanho: 'p',
      }),
      kpi({
        label: 'Desembolsos', valor: money(r.saidas.total.valor), icone: '↘', cor: 'laranja',
        nota: `${r.saidas.total.quantidade} lançamento(s)`, tamanho: 'p',
      }),
      kpi({
        label: 'Resultado do período', valor: money(r.resultado), icone: r.resultado >= 0 ? '📈' : '📉',
        cor: r.resultado >= 0 ? 'ok' : 'ruim', nota: 'recebido − desembolsado', tamanho: 'p',
      }),
      kpi({
        label: 'Saldo em caixa',
        valor: r.saldo ? money(r.saldo.valor) : '—',
        icone: '🏦', tamanho: 'p',
        nota: r.saldo ? `informado em ${formatDate(r.saldo.data, 'short')}` : 'informe no Caixa',
      })),

    /**
     * O que o app NÃO sabe fica escrito, em vez de somar zero. Captação de
     * empréstimo é depósito do banco: não passa por contas a receber e só chega
     * pelo extrato — que ela já tem ligado ao sistema por Open Finance.
     */
    aviso('Captação de empréstimos ainda não aparece aqui: dinheiro que o banco deposita não '
      + 'passa pelo contas a receber, então nenhum relatório que você manda hoje traz esse '
      + 'número. Com o extrato do Open Finance ele entra — e aí o saldo final fecha sozinho, '
      + 'sem você digitar.', 'info'),

    secao('Entradas × saídas por semana', null,
      card(null, null,
        grafBarrasDuplas(r.semanas, { nomeA: 'Entradas', nomeB: 'Saídas' }),
        legenda({ nome: 'Entradas', cor: 'var(--verde)' }, { nome: 'Saídas', cor: 'var(--laranja)' }),
        h('p.mini.muted', { style: { marginTop: '6px' } },
          'Cada barra é uma semana, pela data de vencimento. Pare o mouse em cima (ou segure, '
          + 'no telefone) para ver o valor — ele também está na tabela abaixo.'),
        tabela({
          colunas: COLUNAS_SEMANA,
          linhas: r.semanas.map((s) => ({
            semana: `${formatDate(s.inicio, 'short')} a ${formatDate(s.fim, 'short')}`,
            entradas: s.a, saidas: s.b, saldo: s.saldo,
          })),
          total: {
            semana: 'TOTAL',
            entradas: r.entradas.total.valor,
            saidas: r.saidas.total.valor,
            saldo: r.resultado,
          },
        }))),

    secao('Situação dos lançamentos',
      exportadores(() => ({
        titulo: 'Situação dos lançamentos',
        subtitulo: monthLabel(mes),
        nomeArquivo: `situacao_${mes}`,
        colunas: COLUNAS_SITUACAO,
        linhas: linhasDaSituacao(r),
      })),
      card(null, null,
        tabela({ colunas: COLUNAS_SITUACAO, linhas: linhasDaSituacao(r) }),
        h('p.mini.muted', { style: { marginTop: '8px' } },
          'Confirmado é o que o seu sistema já baixou. Atrasado é o que venceu e continua em '
          + 'aberto. Em aberto é o que ainda vai vencer. O app não muda nenhum deles — ele só '
          + 'repete o que veio no relatório.'))),

    secao('Desembolsos por conta',
      exportadores(() => ({
        titulo: 'Desembolsos por plano de contas',
        subtitulo: monthLabel(mes),
        nomeArquivo: `desembolsos_conta_${mes}`,
        colunas: COLUNAS_CONTA,
        linhas: r.porConta.linhas,
        total: { nome: 'TOTAL', valor: r.porConta.total },
      })),
      card(null, null,
        r.porConta.linhas.length
          ? h('div.empilha', { style: { gap: '8px' } },
            ...r.porConta.linhas.slice(0, 12).map((c) => h('div',
              h('div.linha.linha--entre', { style: { gap: '10px' } },
                h('span.pequeno.crescer', { style: { minWidth: 0 } }, c.nome),
                h('span.num.pequeno', money(c.valor)),
                h('span.mini.muted', pct(c.percentual, 1))),
              barraHorizontal(c.percentual, 'var(--laranja)'),
              h('span.mini.muted', `${c.itens} lançamento(s)`))))
          : h('p.pequeno.muted', 'Nenhum desembolso neste mês.'),
        r.porConta.linhas.length > 12 && h('p.mini.muted', { style: { marginTop: '8px' } },
          `e mais ${r.porConta.linhas.length - 12} conta(s), somando `
          + `${money(r.porConta.linhas.slice(12).reduce((a, c) => a + c.valor, 0))}. `
          + 'A planilha sai com todas.'))),

    secao('Curva ABC dos desembolsos', null,
      card(null, null,
        h('p.pequeno.muted', { style: { marginBottom: '10px' } },
          'A é onde está a maior parte do gasto: poucas contas formam 80% do total. '
          + 'É por ela que se começa a cortar — mexer em C quase não muda o mês.'),
        h('div.grade.grade--3',
          ...r.porConta.classes.map((c) => kpi({
            label: `Classe ${c.classe}`, valor: money(c.valor), tamanho: 'p',
            cor: c.classe === 'A' ? 'ruim' : (c.classe === 'B' ? 'atencao' : undefined),
            nota: `${c.quantidade} conta(s) · ${pct(c.percentual, 1)}`,
          }))),
        tabela({
          colunas: COLUNAS_ABC,
          linhas: r.porConta.linhas.slice(0, 20),
        }))),

    secao('Maiores saídas do período',
      exportadores(() => ({
        titulo: 'Maiores saídas do período',
        subtitulo: monthLabel(mes),
        nomeArquivo: `maiores_saidas_${mes}`,
        colunas: COLUNAS_MAIORES,
        linhas: r.maiores,
      })),
      card(null, null,
        h('p.pequeno.muted', { style: { marginBottom: '8px' } },
          'Em qual fornecedor o dinheiro está indo. É esta lista que dá o argumento para pedir '
          + 'prazo ou desconto: quem mais recebe é quem mais tem a perder.'),
        tabela({ colunas: COLUNAS_MAIORES, linhas: r.maiores }),
        r.porFavorecido.linhas.length > 0 && h('p.mini.muted', { style: { marginTop: '8px' } },
          `No período inteiro são ${num(r.porFavorecido.linhas.length, 0)} favorecido(s). `
          + `O maior deles é ${r.porFavorecido.linhas[0].nome}, com `
          + `${money(r.porFavorecido.linhas[0].valor)} em `
          + `${r.porFavorecido.linhas[0].itens} lançamento(s).`))),

    secao('Fluxo de caixa detalhado', null,
      h('div.empilha', { style: { gap: '8px' } },
        arvore(r.arvore, { prefixo: `cx-${mes}` }),
        h('p.mini.muted',
          'Clique em 1 ou 2 para abrir. Dentro dos desembolsos, 2.x é o degrau do DRE e 2.x.y é '
          + 'a conta do seu plano — a mesma classificação do DRE gerencial, para as duas telas '
          + 'nunca contarem a mesma despesa em lugares diferentes.'),
        botao('Classificar as contas no DRE', {
          pequeno: true, onClick: () => navigate(href('/dre', { m: mes })),
        }))));
}

const COLUNAS_SEMANA = [
  { header: 'Semana', key: 'semana' },
  { header: 'Entradas', key: 'entradas', tipo: 'money', alinhar: 'direita' },
  { header: 'Saídas', key: 'saidas', tipo: 'money', alinhar: 'direita' },
  { header: 'Saldo', key: 'saldo', tipo: 'money', alinhar: 'direita' },
];

const COLUNAS_SITUACAO = [
  { header: '', key: 'linha' },
  { header: 'Confirmado', key: 'confirmado', tipo: 'money', alinhar: 'direita' },
  { header: 'Atrasado', key: 'atrasado', tipo: 'money', alinhar: 'direita' },
  { header: 'Em aberto', key: 'aberto', tipo: 'money', alinhar: 'direita' },
  { header: 'Total', key: 'total', tipo: 'money', alinhar: 'direita' },
];

const COLUNAS_CONTA = [
  { header: 'Conta do plano', key: 'nome' },
  { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: '%', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
  { header: 'Lançamentos', key: 'itens', tipo: 'int', alinhar: 'direita' },
];

const COLUNAS_ABC = [
  { header: 'Classe', key: 'classe' },
  { header: 'Conta do plano', key: 'nome' },
  { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: 'Acumulado', key: 'acumuladoPercentual', tipo: 'pct', alinhar: 'direita' },
];

const COLUNAS_MAIORES = [
  { header: 'Favorecido', key: 'favorecido' },
  { header: 'Conta', key: 'conta' },
  { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
  { header: 'Situação', key: 'situacao' },
  { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
];

function linhasDaSituacao(r) {
  const linha = (nome, bloco) => ({
    linha: nome,
    confirmado: bloco.confirmado.valor,
    atrasado: bloco.atrasado.valor,
    aberto: bloco.aberto.valor,
    total: bloco.total.valor,
  });
  const e = linha('Entradas', r.entradas);
  const s = linha('Saídas', r.saidas);
  return [
    e,
    s,
    {
      linha: 'Saldo',
      confirmado: e.confirmado - s.confirmado,
      atrasado: e.atrasado - s.atrasado,
      aberto: e.aberto - s.aberto,
      total: e.total - s.total,
    },
  ];
}

function seletorDeMes(mes) {
  const meses = [];
  for (let i = 0; i < 6; i += 1) meses.push(monthKey(addMonths(`${mes}-01`, -i)));
  return chips(meses.reverse().map((m) => ({ id: m, label: monthLabelShort(m) })), mes,
    (id) => navigate(href('/fluxo', { v: 'realizado', m: id })));
}

/** As duas perguntas do caixa, lado a lado: o que vem, e o que foi. */
export function alternador(atual, extra = {}) {
  return chips([
    { id: 'projecao', label: '📅 Próximos dias' },
    { id: 'realizado', label: '📚 Período fechado' },
  ], atual, (id) => navigate(id === 'realizado'
    ? href('/fluxo', { v: 'realizado', ...extra })
    : href('/fluxo', {})));
}
