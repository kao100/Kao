/**
 * FLUXO DE CAIXA E SIMULAÇÃO (itens 9 e 10)
 * Ferramenta de decisão: saldo acumulado dia a dia e "e se…?" sem mexer no real.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as cashflow from '../../logic/cashflow.js';
import * as store from '../../core/store.js';
import { selo as seloRotina } from '../../logic/routine.js';
import { seloDados, definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, aviso, vazio } from '../components/ui.js';
import { grafLinha } from '../components/chart.js';
import { detalhe, linhas as linhasDetalhe, formulario, confirmar } from '../components/sheet.js';
import { exportadores } from '../components/table.js';
import { ok, erro } from '../components/toast.js';
import { money, formatDate, today, addDays, DAY_SHORT, parseDate } from '../../core/format.js';

/** Ajustes da simulação vivem na sessão: some ao recarregar, nunca toca no banco. */
let ajustesAtivos = [];

export async function telaCaixa({ query }) {
  const dias = Number(query.d || 30);
  const [projecao, selo] = await Promise.all([
    cashflow.projetar({ dias }),
    seloRotina(),
  ]);
  definirTitulo('Fluxo de caixa', `${dias} dias · a partir de ${formatDate(today(), 'short')}`);

  if (projecao.contas.length === 0) {
    return h('div.empilha', { style: { gap: '14px' } },
      seloDados(selo),
      vazio('🏦', 'Cadastre os bancos',
        'O fluxo de caixa começa do saldo real. Cadastre as contas e importe os extratos.',
        botao('Ir para Bancos', { tipo: 'primario', onClick: () => navigate('/bancos') })));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    seloDados(selo, { compacto: true }),

    chips(cashflow.HORIZONTES.map((x) => ({ id: String(x.dias), label: x.label })), String(dias),
      (id) => navigate(href('/caixa', { ...query, d: id }))),

    h('div.grade.grade--4',
      kpi({ label: 'Saldo hoje', valor: money(projecao.saldoInicial), icone: '🏦', cor: 'info' }),
      kpi({ label: 'Entradas previstas', valor: money(projecao.totalEntradas), icone: '↗', cor: 'ok' }),
      kpi({ label: 'Saídas previstas', valor: money(projecao.totalSaidas), icone: '↘', cor: 'laranja' }),
      kpi({
        label: `Saldo em ${dias} dias`, valor: money(projecao.saldoFinal), icone: '🎯',
        cor: projecao.saldoFinal < 0 ? 'ruim' : 'ok',
      })),

    projecao.primeiroDiaNegativo
      ? h('button.card.card--alerta.card--clicavel', { onClick: () => navigate('/caixa/simulacao') },
        h('div.linha',
          h('span', { style: { fontSize: '22px' } }, '🔴'),
          h('div.crescer',
            h('strong', `Problema de caixa em ${formatDate(projecao.primeiroDiaNegativo.data)}`),
            h('div.mini.muted', `saldo previsto ${money(projecao.primeiroDiaNegativo.saldoFinal)} · ${projecao.diasNegativos} dia(s) negativo(s) no período`)),
          h('span.muted', '›')),
        h('p.mini.muted', { style: { marginTop: '8px' } }, 'Toque para simular prorrogações e recebimentos.'))
      : aviso('✅ Caixa positivo em todo o período projetado.', 'ok'),

    card('Saldo projetado (acumulado)', null,
      grafLinha(projecao.linhas.map((l) => ({ rotulo: formatDate(l.data, 'short'), valor: l.saldoFinal })), {
        altura: 150,
        cor: projecao.primeiroDiaNegativo ? 'var(--vermelho)' : 'var(--verde)',
      }),
      h('p.mini.muted', { style: { marginTop: '6px' } },
        'Acumulado: o saldo de cada dia já considera tudo que aconteceu antes dele.')),

    projecao.valorForaDaProjecao > 0 && h('button.aviso.aviso--atencao', { style: { width: '100%' }, onClick: () => mostrarForaDaProjecao(projecao) },
      h('div.crescer', { style: { textAlign: 'left' } },
        h('strong', `${money(projecao.valorForaDaProjecao)} vencidos fora da projeção`),
        h('div.mini', `${projecao.foraDaProjecao.length} título(s) vencidos sem promessa de pagamento — o app não chuta a data`)),
      h('span', '›')),

    !projecao.confiavel && aviso(
      'Alguma conta está sem saldo informado: o saldo inicial foi calculado só pela soma do extrato. Informe o saldo em Bancos para o número ficar exato.',
      'atencao',
      botao('Bancos', { pequeno: true, onClick: () => navigate('/bancos') })),

    secao('Dia a dia',
      h('div.linha',
        exportadores(() => montarExportacao(projecao, dias)),
        botao('🔮 Simular', { tipo: 'primario', pequeno: true, onClick: () => navigate('/caixa/simulacao') })),
      h('div.lista', ...projecao.linhas.map((linha) => linhaDia(linha, projecao)))));
}

function linhaDia(linha, projecao) {
  const data = parseDate(linha.data);
  const vazio2 = linha.entradas === 0 && linha.saidas === 0;
  return h(`button.fluxo-dia.nv-${linha.nivel}${linha.data === today() ? '.fluxo-dia--hoje' : ''}`,
    { onClick: () => abrirDia(linha, projecao), style: vazio2 ? { opacity: .62 } : undefined },
    h('div.fluxo-dia__data',
      formatDate(linha.data, 'short'),
      h('span', DAY_SHORT[data.getDay()])),
    h('div.fluxo-dia__mov',
      linha.entradas > 0 && h('span.ok', '↗ ', h('b', money(linha.entradas))),
      linha.saidas > 0 && h('span.ruim', '↘ ', h('b', money(linha.saidas))),
      vazio2 && h('span.muted', 'sem movimento previsto')),
    h('div.fluxo-dia__saldo', money(linha.saldoFinal)));
}

function abrirDia(linha, projecao) {
  const conta = projecao.contas;
  detalhe(`${formatDate(linha.data)} — saldo ${money(linha.saldoFinal)}`,
    linhasDetalhe([
      ['Saldo inicial do dia', money(linha.saldoInicial)],
      ['Entradas', money(linha.entradas)],
      ['Saídas', money(linha.saidas)],
      ['Saldo final projetado', money(linha.saldoFinal)],
    ]),
    linha.itens.entradas.length ? h('div',
      h('h3', { style: { margin: '6px 0' } }, `Recebimentos previstos (${linha.itens.entradas.length})`),
      h('div.lista', ...linha.itens.entradas.map((e) => h('div.item.item--st.st-pago',
        h('span.ponto'),
        h('div.item__corpo',
          h('div.item__titulo', e.descricao),
          h('div.item__sub', e.detalhe, e.tipoData === 'promessa' && h('span.selo.selo--roxo', 'promessa'),
            e.simulado && h('span.selo.selo--roxo', 'simulado'))),
        h('div.item__valor.ok', money(e.valor))))))
      : null,
    linha.itens.saidas.length ? h('div',
      h('h3', { style: { margin: '6px 0' } }, `Pagamentos previstos (${linha.itens.saidas.length})`),
      h('div.lista', ...linha.itens.saidas.map((s) => h('div.item.item--st.st-aberto',
        h('span.ponto'),
        h('div.item__corpo',
          h('div.item__titulo', s.descricao),
          h('div.item__sub', s.detalhe || 'sem categoria',
            s.tipoData === 'atrasado' && h('span.selo.selo--ruim', 'vencido'),
            s.tipoData === 'prorrogado' && h('span.selo.selo--info', 'prorrogado'),
            s.simulado && h('span.selo.selo--roxo', 'simulado'))),
        h('div.item__valor.ruim', money(s.valor))))))
      : null,
    h('div',
      h('h3', { style: { margin: '6px 0' } }, 'Saldo por banco (hoje)'),
      linhasDetalhe(conta.map((c) => [c.conta.nome, money(c.saldo)]))));
}

function mostrarForaDaProjecao(projecao) {
  detalhe('Vencidos fora da projeção',
    h('p.pequeno.muted', 'Estes títulos já venceram e não têm promessa de pagamento. '
      + 'Eles não entram no caixa projetado porque não há data confiável — registre uma promessa na tela de Cobrança e eles passam a contar.'),
    h('div.lista', ...projecao.foraDaProjecao.map((f) => h('div.item.item--st.st-aberto',
      h('span.ponto'),
      h('div.item__corpo',
        h('div.item__titulo', f.descricao),
        h('div.item__sub', `venceu em ${formatDate(f.vencimento)}`)),
      h('div.item__valor', money(f.valor))))),
    botao('Ir para a cobrança', { tipo: 'primario', bloco: true, onClick: () => navigate('/cobranca') }));
}

function montarExportacao(projecao, dias) {
  return {
    titulo: 'Fluxo de caixa projetado',
    subtitulo: `${dias} dias — de ${formatDate(projecao.de)} a ${formatDate(projecao.ate)}`,
    periodo: `Saldo inicial ${money(projecao.saldoInicial)}`,
    nomeArquivo: `fluxo_de_caixa_${projecao.de}_${dias}dias`,
    colunas: [
      { header: 'Data', key: 'data', tipo: 'date' },
      { header: 'Saldo inicial', key: 'saldoInicial', tipo: 'money', alinhar: 'direita' },
      { header: 'Entradas', key: 'entradas', tipo: 'money', alinhar: 'direita' },
      { header: 'Saídas', key: 'saidas', tipo: 'money', alinhar: 'direita' },
      { header: 'Saldo final projetado', key: 'saldoFinal', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: projecao.linhas,
    total: { data: 'Total do período', entradas: projecao.totalEntradas, saidas: projecao.totalSaidas, saldoFinal: projecao.saldoFinal },
  };
}

/* --------------------------------------------------------------- simulação */

export async function telaSimulacao({ query }) {
  const dias = Number(query.d || 30);
  const [comparacao, cenarios, sugestao] = await Promise.all([
    cashflow.comparar({ dias, ajustes: ajustesAtivos }),
    store.cenarios.listar(),
    cashflow.sugerirProrrogacoes({ dias }),
  ]);
  definirTitulo('Simulação de cenários', `${ajustesAtivos.length} ajuste(s) aplicados`);
  const { real, simulado } = comparacao;

  return h('div.empilha', { style: { gap: '14px' } },
    aviso('A simulação nunca altera os dados reais. Nada aqui é gravado até você mandar aplicar.', 'info'),

    h('div.comparativo',
      h('div',
        h('div.comparativo__tag', 'Cenário real'),
        h('div.kpi__valor.kpi__valor--p.num', { style: { color: real.saldoFinal < 0 ? 'var(--vermelho)' : 'var(--txt)' } }, money(real.saldoFinal)),
        h('div.mini.muted', real.primeiroDiaNegativo
          ? `negativo em ${formatDate(real.primeiroDiaNegativo.data, 'short')}`
          : 'sem dia negativo'),
        h('div.mini.muted', `menor saldo ${money(comparacao.menorSaldoReal)}`)),
      h('div.comparativo--sim',
        h('div.comparativo__tag', 'Cenário simulado'),
        h('div.kpi__valor.kpi__valor--p.num', { style: { color: simulado.saldoFinal < 0 ? 'var(--vermelho)' : 'var(--roxo)' } }, money(simulado.saldoFinal)),
        h('div.mini.muted', simulado.primeiroDiaNegativo
          ? `negativo em ${formatDate(simulado.primeiroDiaNegativo.data, 'short')}`
          : 'sem dia negativo'),
        h('div.mini.muted', `menor saldo ${money(comparacao.menorSaldoSimulado)}`))),

    ajustesAtivos.length > 0 && comparacao.resolveu && aviso('✅ Com estes ajustes o caixa não fica negativo no período.', 'ok'),
    ajustesAtivos.length > 0 && comparacao.piorou && aviso('⚠️ Estes ajustes criam um dia negativo que não existia.', 'ruim'),

    card('Saldo projetado com os ajustes', null,
      grafLinha(simulado.linhas.map((l) => ({ rotulo: formatDate(l.data, 'short'), valor: l.saldoFinal })), {
        altura: 140,
        cor: simulado.primeiroDiaNegativo ? 'var(--vermelho)' : 'var(--roxo)',
      })),

    secao('Ajustes da simulação', null,
      ajustesAtivos.length
        ? h('div.empilha', { style: { gap: '7px' } }, ...ajustesAtivos.map((a) => h('div.simulacao-ajuste',
          h('span', cashflow.TIPOS_AJUSTE[a.tipo]?.icone || '•'),
          h('span.crescer', descreverAjuste(a)),
          h('button.simulacao-ajuste__x', {
            onClick: () => { ajustesAtivos = ajustesAtivos.filter((x) => x.id !== a.id); refresh(); },
          }, '✕'))))
        : h('p.pequeno.muted', 'Nenhum ajuste ainda. Comece por um dos botões abaixo.'),
      h('div.btn-linha',
        botao('➕ Recebimento', { pequeno: true, onClick: () => adicionar('entrada') }),
        botao('➖ Pagamento', { pequeno: true, onClick: () => adicionar('saida') }),
        botao('📅 Mudar data', { pequeno: true, onClick: () => moverLancamento(real) }),
        botao('🏦 Saldo inicial', { pequeno: true, onClick: () => mudarSaldo(real) }),
        ajustesAtivos.length > 0 && botao('Limpar', { pequeno: true, onClick: () => { ajustesAtivos = []; refresh(); } }))),

    sugestao.dia && h('div.card',
      h('h3', { style: { marginBottom: '6px' } }, `Para resolver ${formatDate(sugestao.dia.data)} faltam ${money(sugestao.necessario)}`),
      h('p.mini.muted', { style: { marginBottom: '10px' } }, 'Pagamentos que você pode prorrogar (toque para simular):'),
      h('div.lista', ...sugestao.candidatos.slice(0, 6).map((c) => h('button.item.card--clicavel', {
        onClick: () => prorrogarSimulado(c, sugestao.dia.data),
      },
      h('div.item__corpo',
        h('div.item__titulo', c.descricao),
        h('div.item__sub', `${formatDate(c.diaOriginal, 'short')} · ${c.detalhe || 'sem categoria'}`)),
      h('div.item__valor', money(c.valor)))))),

    ajustesAtivos.length > 0 && h('div.btn-linha',
      botao('💾 Salvar cenário', { bloco: true, onClick: () => salvar() }),
      botao('✅ Aplicar de verdade', { tipo: 'ok', bloco: true, onClick: () => aplicar() })),

    cenarios.length > 0 && card('Cenários salvos', null,
      h('div.lista', ...cenarios.map((c) => h('div.item',
        h('div.item__corpo',
          h('div.item__titulo', c.nome),
          h('div.item__sub', `${c.ajustes.length} ajuste(s)`)),
        botao('Abrir', { pequeno: true, onClick: () => { ajustesAtivos = c.ajustes; refresh(); } }),
        botao('Excluir', { pequeno: true, onClick: async () => { await cashflow.excluirCenario(c.id); refresh(); } }))))));
}

function descreverAjuste(a) {
  if (a.tipo === 'entrada') return `Entrada de ${money(a.valor)} em ${formatDate(a.data)} — ${a.descricao || 'simulado'}`;
  if (a.tipo === 'saida') return `Saída de ${money(a.valor)} em ${formatDate(a.data)} — ${a.descricao || 'simulado'}`;
  if (a.tipo === 'mover') return `${a.rotulo} movido para ${formatDate(a.novaData)}`;
  if (a.tipo === 'remover') return `${a.rotulo} retirado da projeção`;
  if (a.tipo === 'saldo') return `Saldo inicial considerado: ${money(a.valor)}`;
  return a.tipo;
}

async function adicionar(tipo) {
  const r = await formulario({
    titulo: tipo === 'entrada' ? 'Recebimento simulado' : 'Pagamento simulado',
    descricao: tipo === 'entrada'
      ? 'Ex.: "se entrar R$ 50.000 no dia 25, o caixa aguenta?"'
      : 'Uma compra ou despesa que ainda não está na base.',
    campos: [
      { chave: 'valor', label: 'Valor', tipo: 'dinheiro', obrigatorio: true },
      { chave: 'data', label: 'Data', tipo: 'data', obrigatorio: true, valor: addDays(today(), 7) },
      { chave: 'descricao', label: 'Descrição', tipo: 'texto', placeholder: tipo === 'entrada' ? 'Cliente / origem' : 'Fornecedor / motivo' },
    ],
  });
  if (!r) return;
  ajustesAtivos = [...ajustesAtivos, cashflow.novoAjuste(tipo, {
    valor: Number(r.valor), data: r.data, descricao: r.descricao,
  })];
  refresh();
}

async function moverLancamento(real) {
  const itens = real.linhas.flatMap((l) => [
    ...l.itens.entradas.map((e) => ({ ...e, rotulo: `↗ ${formatDate(e.data, 'short')} · ${e.descricao} · ${money(e.valor)}` })),
    ...l.itens.saidas.map((s) => ({ ...s, rotulo: `↘ ${formatDate(s.data, 'short')} · ${s.descricao} · ${money(s.valor)}` })),
  ]).filter((i) => i.origem !== 'simulacao');

  if (!itens.length) { erro('Não há lançamentos previstos para mover.'); return; }

  const r = await formulario({
    titulo: 'Antecipar ou adiar um lançamento',
    campos: [
      {
        chave: 'alvo',
        label: 'Lançamento',
        tipo: 'select',
        opcoes: itens.map((i, idx) => ({ valor: String(idx), label: i.rotulo })),
      },
      { chave: 'novaData', label: 'Nova data', tipo: 'data', obrigatorio: true, valor: addDays(today(), 10) },
    ],
  });
  if (!r) return;
  const alvo = itens[Number(r.alvo)];
  ajustesAtivos = [...ajustesAtivos, cashflow.novoAjuste('mover', {
    alvo: { origem: alvo.origem, id: alvo.id },
    novaData: r.novaData,
    rotulo: `${alvo.descricao} (${money(alvo.valor)})`,
  })];
  refresh();
}

async function prorrogarSimulado(candidato, diaProblema) {
  const r = await formulario({
    titulo: `Prorrogar ${candidato.descricao}`,
    descricao: `${money(candidato.valor)} previsto para ${formatDate(candidato.diaOriginal)}.`,
    campos: [{ chave: 'novaData', label: 'Nova data', tipo: 'data', obrigatorio: true, valor: addDays(diaProblema, 7) }],
  });
  if (!r) return;
  ajustesAtivos = [...ajustesAtivos, cashflow.novoAjuste('mover', {
    alvo: { origem: 'pagar', id: candidato.id },
    novaData: r.novaData,
    rotulo: `${candidato.descricao} (${money(candidato.valor)})`,
  })];
  refresh();
}

async function mudarSaldo(real) {
  const r = await formulario({
    titulo: 'Saldo inicial da simulação',
    descricao: `Saldo real hoje: ${money(real.saldoInicialReal)}.`,
    campos: [{ chave: 'valor', label: 'Considerar saldo de', tipo: 'dinheiro', obrigatorio: true, valor: real.saldoInicialReal }],
  });
  if (!r) return;
  ajustesAtivos = [...ajustesAtivos.filter((a) => a.tipo !== 'saldo'), cashflow.novoAjuste('saldo', { valor: Number(r.valor) })];
  refresh();
}

async function salvar() {
  const r = await formulario({
    titulo: 'Salvar cenário',
    campos: [{ chave: 'nome', label: 'Nome do cenário', tipo: 'texto', obrigatorio: true, placeholder: 'Ex.: prorrogar 3 fornecedores' }],
  });
  if (!r) return;
  await cashflow.salvarCenario(r.nome, ajustesAtivos);
  ok('Cenário salvo.');
  refresh();
}

async function aplicar() {
  const movimentos = ajustesAtivos.filter((a) => a.tipo === 'mover');
  if (!movimentos.length) {
    erro('Só mudanças de data podem ser aplicadas de verdade.');
    return;
  }
  const confirmado = await confirmar({
    titulo: 'Aplicar na base real?',
    texto: `${movimentos.length} lançamento(s) terão a data alterada de verdade. `
      + 'Pagamentos ficam marcados como prorrogados e recebimentos viram promessa de pagamento. Tudo fica registrado no histórico.',
    confirmar: 'Aplicar',
  });
  if (!confirmado) return;

  const motivo = await formulario({
    titulo: 'Motivo',
    campos: [{ chave: 'motivo', label: 'Por que está mudando?', tipo: 'area', obrigatorio: true }],
    confirmar: 'Confirmar',
  });
  if (!motivo) return;

  const quantos = await cashflow.aplicarDeVerdade(movimentos, motivo.motivo);
  ajustesAtivos = ajustesAtivos.filter((a) => a.tipo !== 'mover');
  ok(`${quantos} lançamento(s) atualizados.`);
  navigate('/caixa');
}
