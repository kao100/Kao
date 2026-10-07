/**
 * FLUXO DE CAIXA — a tela financeira, e a única.
 *
 * "Não quero excesso de cards independentes com informações repetidas." Então a
 * ordem é: o que é hoje, o que vem pela frente, o gráfico, e a tabela dia a dia
 * que se abre quando ela quer saber de quem é cada valor.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as fluxo from '../../logic/fluxo.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, chips, aviso, vazio, selo } from '../components/ui.js';
import { grafLinha } from '../components/chart.js';
import { tabela, exportadores } from '../components/table.js';
import { formulario, abrirFolha, fechar, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, formatDate, today, monthLabel, monthKey } from '../../core/format.js';

const COLUNAS = [
  { header: 'Dia', key: 'data', tipo: 'data' },
  { header: 'Saldo inicial', key: 'saldoInicial', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Recebimentos', key: 'recebimentos', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Pagamentos', key: 'pagamentos', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Líquido', key: 'liquido', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Saldo projetado', key: 'saldoProjetado', tipo: 'dinheiro', alinhar: 'direita' },
];

export async function telaFluxo({ query }) {
  const horizonte = query.h || '30';
  const base = query.de || today();
  const periodo = query.de && query.ate
    ? { de: query.de, ate: query.ate }
    : fluxo.periodoDoHorizonte(horizonte, base);

  const r = await fluxo.projetar(periodo);
  definirTitulo('Fluxo de caixa', `${formatDate(periodo.de)} a ${formatDate(periodo.ate)}`);

  if (!r.temSaldo) {
    return h('div.empilha', { style: { gap: '14px' } },
      filtros(horizonte, query),
      vazio('🏦', 'Informe o saldo de hoje',
        'O fluxo de caixa parte do dinheiro que existe agora. Você digita esse número uma vez por '
        + 'dia — é a única coisa do financeiro que o app não consegue tirar dos relatórios.',
        botao('Informar saldo', { tipo: 'primario', onClick: () => pedirSaldo(r) })));
  }

  const serie = r.linhas.map((l) => ({ x: l.data, y: l.saldoProjetado }));

  return h('div.empilha', { style: { gap: '14px' } },
    filtros(horizonte, query),

    /* ------------------------------------------------------------- hoje */
    secao('Hoje', botao('Atualizar saldo', { pequeno: true, onClick: () => pedirSaldo(r) }),
      h('div.grade.grade--2',
        kpi({
          label: 'Saldo atual', valor: money(r.saldoInicial), icone: '🏦', cor: 'info',
          nota: r.saldo?.data ? `informado em ${formatDate(r.saldo.data)}` : null,
        }),
        /**
         * A SEGUNDA REALIDADE, ao lado da primeira e nunca no lugar dela.
         *
         * "Quanto dinheiro a empresa realmente possui hoje" e "como estaria o
         *  caixa da operação sem aquele recurso" são duas perguntas, e ela
         *  precisa das duas respostas na mesma tela.
         */
        r.extraordinario
          ? kpi({
            label: 'Saldo operacional', valor: money(r.saldoOperacionalHoje), icone: '⚖️',
            cor: r.saldoOperacionalHoje < 0 ? 'ruim' : 'ok',
            nota: `sem ${money(r.extraordinario)} de recurso extraordinário`,
          })
          : kpi({
            label: 'Recurso extraordinário', valor: '—', icone: '⚖️',
            nota: 'nenhum cadastrado', onClick: () => editarRecursos(r),
          })),
      r.saldo?.data && r.saldo.data < today() && aviso(
        `O saldo é de ${formatDate(r.saldo.data)} e hoje é ${formatDate(today())}. A projeção parte `
        + 'dele mesmo assim, mas o que entrou e saiu nesse meio-tempo não está contado — atualize '
        + 'para o número ficar exato.', 'atencao',
        botao('Atualizar', { pequeno: true, onClick: () => pedirSaldo(r) }))),

    /* -------------------------------------------------------- o que vem */
    secao(`Próximos dias (${formatDate(periodo.de, 'short')} a ${formatDate(periodo.ate, 'short')})`, null,
      h('div.grade.grade--2',
        kpi({ label: 'A receber', valor: money(r.totalReceber), icone: '↗', cor: 'ok' }),
        kpi({ label: 'A pagar', valor: money(r.totalPagar), icone: '↘', cor: 'laranja' }),
        kpi({
          label: 'Saldo no fim', valor: money(r.saldoFinal), icone: '🎯',
          cor: r.saldoFinal < 0 ? 'ruim' : 'ok',
        }),
        kpi({
          label: 'Menor saldo', valor: money(r.menorSaldo), icone: r.menorSaldo < 0 ? '🔴' : '📉',
          cor: r.menorSaldo < 0 ? 'ruim' : undefined,
          nota: r.menorSaldoEm ? `em ${formatDate(r.menorSaldoEm)}` : null,
        })),
      r.diasNegativos.length > 0 && aviso(
        `${r.diasNegativos.length} dia(s) com saldo negativo neste período, a partir de `
        + `${formatDate(r.diasNegativos[0])}. É aqui que dá para antecipar uma cobrança ou negociar `
        + 'um pagamento — abra o dia e veja de quem é cada valor.', 'ruim')),

    /* ----------------------------------------------------------- vencidos */
    (r.vencidos.receber.quantidade > 0 || r.vencidos.pagar.quantidade > 0) && secao('Vencidos', null,
      h('div.grade.grade--2',
        r.vencidos.receber.quantidade > 0 && h('button.card.card--clicavel',
          { onClick: () => abrirVencidos('Recebimentos vencidos', r.vencidos.receber,
            'Não entram na projeção: entrada vencida não é entrada certa.') },
          h('div.mini.muted', 'Recebimentos vencidos'),
          h('div.kpi__valor.num', money(r.vencidos.receber.valor)),
          h('div.mini.muted', `${r.vencidos.receber.quantidade} título(s) · fora da projeção`)),
        r.vencidos.pagar.quantidade > 0 && h('button.card.card--clicavel.card--alerta',
          { onClick: () => abrirVencidos('Pagamentos vencidos', r.vencidos.pagar,
            'Obrigação imediata: precisa de caixa agora, não no vencimento.') },
          h('div.mini.muted', 'Pagamentos vencidos'),
          h('div.kpi__valor.num', money(r.vencidos.pagar.valor)),
          h('div.mini.muted', `${r.vencidos.pagar.quantidade} título(s) · necessidade imediata`)))),

    /* ------------------------------------------------------------ gráfico */
    serie.length > 1 && card('Evolução do saldo projetado', null,
      grafLinha(serie, { altura: 150 }),
      r.extraordinario > 0 && h('p.mini.muted', { style: { marginTop: '6px' } },
        `A linha é o saldo real. Descontando o recurso extraordinário de ${money(r.extraordinario)}, `
        + `o caixa da operação sai de ${money(r.saldoOperacionalHoje)} e chega a `
        + `${money(r.saldoOperacionalFinal)} no fim do período.`)),

    /* ------------------------------------------------------- dia a dia */
    secao('Dia a dia',
      exportadores(() => ({
        titulo: 'Fluxo de caixa',
        subtitulo: `${formatDate(periodo.de)} a ${formatDate(periodo.ate)}`,
        nomeArquivo: `fluxo_${periodo.de}`,
        colunas: COLUNAS,
        linhas: r.linhas,
      })),
      tabela({
        colunas: COLUNAS,
        linhas: r.linhas,
        aoClicar: (linha) => abrirDia(linha),
      }),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        'Toque num dia para ver de quem é cada recebimento e cada pagamento.')),

    r.semVencimento.valor > 0 && aviso(
      `${r.semVencimento.receber + r.semVencimento.pagar} título(s) sem data de vencimento, somando `
      + `${money(r.semVencimento.valor)}. Eles não entram em dia nenhum da projeção porque não há `
      + 'como saber quando. Se o export puder trazer a data, eles entram sozinhos.', 'atencao'),

    secao('Recursos extraordinários',
      botao('Configurar', { pequeno: true, onClick: () => editarRecursos(r) }),
      card(null, null,
        r.recursos.length
          ? h('div.lista', ...r.recursos.map((x) => h('div.item',
            h('div.item__corpo',
              h('div.item__titulo', x.descricao || 'Recurso'),
              h('div.item__sub',
                h('span', money(x.valor)),
                x.data && h('span', `desde ${formatDate(x.data)}`))))))
          : h('p.pequeno.muted',
            'Empréstimo, aporte, qualquer dinheiro que entrou e não veio da operação. Cadastrando '
            + 'aqui, o app mostra o saldo real e, ao lado, como estaria o caixa sem ele — para você '
            + 'enxergar quando a operação volta a se sustentar sozinha.'))));
}

function filtros(horizonte, query) {
  return h('div.empilha', { style: { gap: '8px' } },
    chips(fluxo.HORIZONTES.map((x) => ({ id: x.id, label: x.label })),
      query.de && query.ate ? '' : horizonte,
      (id) => navigate(href('/fluxo', { h: id }))),
    h('div.linha', { style: { gap: '8px', flexWrap: 'wrap' } },
      h('div.campo.crescer',
        h('label.mini', 'De'),
        h('input.entrada', {
          type: 'date', value: query.de || '',
          onChange: (e) => navigate(href('/fluxo', { ...query, de: e.target.value })),
        })),
      h('div.campo.crescer',
        h('label.mini', 'Até'),
        h('input.entrada', {
          type: 'date', value: query.ate || '',
          onChange: (e) => navigate(href('/fluxo', { ...query, ate: e.target.value })),
        })),
      (query.de || query.ate) && botao('Limpar', { pequeno: true, onClick: () => navigate('/fluxo') })));
}

/** O dia aberto: de quem entra e para quem sai. É a função do fluxo de caixa. */
function abrirDia(l) {
  abrirFolha({
    titulo: formatDate(l.data),
    corpo: h('div.empilha', { style: { gap: '12px' } },
      linhasDetalhe([
        ['Saldo inicial', money(l.saldoInicial)],
        ['Recebimentos', money(l.recebimentos)],
        ['Pagamentos', money(l.pagamentos)],
        ['Movimento líquido', money(l.liquido)],
        ['Saldo projetado', money(l.saldoProjetado)],
      ]),
      l.entradas.length > 0 && h('div',
        h('h3', { style: { margin: '4px 0' } }, `Recebimentos — ${money(l.recebimentos)}`),
        h('div.lista', ...l.entradas.map((e) => h('div.item',
          h('div.item__corpo',
            h('div.item__titulo', e.nome),
            h('div.item__sub',
              e.nfNumero && h('span', `NF ${e.nfNumero}`),
              e.documento && h('span', e.documento))),
          h('span.num.forte', money(e.valor)))))),
      l.saidas.length > 0 && h('div',
        h('h3', { style: { margin: '4px 0' } }, `Pagamentos — ${money(l.pagamentos)}`),
        h('div.lista', ...l.saidas.map((x) => h('div.item',
          h('div.item__corpo',
            h('div.item__titulo', x.nome),
            x.documento && h('div.item__sub', h('span', x.documento))),
          h('span.num.forte', money(x.valor)))))),
      !l.entradas.length && !l.saidas.length
        && h('p.pequeno.muted', 'Nenhum título previsto para este dia.')),
    acoes: [botao('Fechar', { tipo: 'primario', bloco: true, onClick: () => fechar() })],
  });
}

function abrirVencidos(titulo, grupo, explicacao) {
  abrirFolha({
    titulo: `${titulo} — ${money(grupo.valor)}`,
    corpo: h('div.empilha', { style: { gap: '10px' } },
      h('p.pequeno.muted', explicacao),
      h('div.lista', ...grupo.titulos.slice(0, 200).map((t) => h('div.item',
        h('div.item__corpo',
          h('div.item__titulo', t.nome),
          h('div.item__sub',
            h('span', `venceu ${formatDate(t.vencimento)}`),
            t.nfNumero && h('span', `NF ${t.nfNumero}`),
            t.documento && h('span', t.documento))),
        h('span.num.forte', money(t.valor)))))),
    acoes: [botao('Fechar', { tipo: 'primario', bloco: true, onClick: () => fechar() })],
  });
}

async function pedirSaldo(r) {
  const atual = r.saldo;
  const resposta = await formulario({
    titulo: 'Saldo atual disponível',
    descricao: 'O dinheiro que existe agora, somando as contas. É daqui que a projeção parte.',
    campos: [
      { chave: 'valor', label: 'Saldo', tipo: 'dinheiro', obrigatorio: true, valor: atual?.valor ?? '' },
      { chave: 'data', label: 'Data-base', tipo: 'data', obrigatorio: true, valor: today() },
    ],
    confirmar: 'Salvar',
  });
  if (!resposta) return;
  await fluxo.informarSaldo(Number(resposta.valor), resposta.data);
  ok('Saldo atualizado.');
  refresh();
}

async function editarRecursos(r) {
  const atual = r.recursos[0] || {};
  const resposta = await formulario({
    titulo: 'Recurso extraordinário',
    descricao: 'Empréstimo, aporte, qualquer dinheiro que entrou e não veio da operação. '
      + 'Não vira contas a receber nem a pagar: é só um ajuste para você enxergar o caixa da '
      + 'operação sem ele.',
    campos: [
      { chave: 'descricao', label: 'Descrição', tipo: 'texto', valor: atual.descricao || 'Empréstimo' },
      { chave: 'valor', label: 'Valor', tipo: 'dinheiro', valor: atual.valor ?? '' },
      { chave: 'data', label: 'Data de entrada', tipo: 'data', valor: atual.data || today() },
    ],
    confirmar: 'Salvar',
  });
  if (!resposta) return;
  const valor = Number(resposta.valor) || 0;
  await fluxo.salvarRecursos(valor
    ? [{ descricao: resposta.descricao || 'Recurso extraordinário', valor, data: resposta.data || null }]
    : []);
  ok(valor ? 'Recurso cadastrado.' : 'Recurso removido.');
  refresh();
}

export { monthLabel, monthKey, selo };
