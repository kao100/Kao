/**
 * COMISSÕES (item 7)
 * Regras configuráveis, ajustes com motivo registrado e fechamento só quando
 * o faturamento fiscal bate com o atribuído aos vendedores.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as commission from '../../logic/commission.js';
import * as store from '../../core/store.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, vazio, aviso, selo } from '../components/ui.js';
import { exportarExcel, imprimir } from '../../logic/reports.js';
import { formulario, detalhe, confirmar, linhas as linhasDetalhe, abrirFolha, fechar } from '../components/sheet.js';
import { ok, erro } from '../components/toast.js';
import { money, pct, formatDate, monthKey, monthLabel, addMonths, today, timestampLabel } from '../../core/format.js';

export async function telaComissoes({ query }) {
  const mes = query.m || monthKey(today());
  const [calculo, regras, ajustes, vendedores, produtos] = await Promise.all([
    commission.calcular(mes),
    store.regrasComissao.listar(),
    store.ajustesComissao.listar(),
    store.vendedores.listar(),
    store.produtos.listar(),
  ]);
  definirTitulo('Comissões', monthLabel(mes));
  const fechada = calculo.status === 'fechada';

  return h('div.empilha', { style: { gap: '14px' } },
    /* navegação de mês */
    h('div.linha.linha--entre',
      botao('‹', { pequeno: true, onClick: () => navigate(href('/comissoes', { m: monthKey(addMonths(`${mes}-01`, -1)) })) }),
      h('strong', monthLabel(mes)),
      botao('›', { pequeno: true, onClick: () => navigate(href('/comissoes', { m: monthKey(addMonths(`${mes}-01`, 1)) })) })),

    /* status do período */
    h('div.status-fluxo', ...Object.entries(commission.STATUS_PERIODO).map(([id, s]) => {
      const atualOrdem = commission.STATUS_PERIODO[calculo.status]?.ordem || 1;
      const classe = id === calculo.status ? 'status-fluxo__etapa--atual'
        : s.ordem < atualOrdem ? 'status-fluxo__etapa--feita' : '';
      return h(`span.status-fluxo__etapa.${classe || 'x'}`, { class: classe }, s.label);
    })),

    h('div.grade.grade--3',
      kpi({
        label: 'Total de comissões', valor: money(calculo.total), icone: '🎯', cor: 'roxo',
        nota: calculo.total !== calculo.totalOriginal ? `original ${money(calculo.totalOriginal)}` : null,
      }),
      kpi({ label: 'Base atribuída', valor: money(calculo.faturamentoAtribuido), icone: '🧾', cor: 'info' }),
      kpi({
        label: 'Vendedores', valor: String(calculo.vendedores.length), icone: '👥',
        nota: `${calculo.linhas.length} linhas calculadas`,
      })),

    /* conferência obrigatória */
    calculo.conferencia.ok
      ? aviso(`✅ Conferência: faturamento fiscal ${money(calculo.conferencia.fiscal)} = soma dos vendedores. Diferença R$ 0,00.`, 'ok')
      : h('button.aviso.aviso--ruim', { style: { width: '100%' }, onClick: () => navigate('/conciliacao') },
        h('div.crescer', { style: { textAlign: 'left' } },
          h('strong', `Diferença de ${money(calculo.conferencia.diferenca)}`),
          h('div.mini', `fiscal ${money(calculo.conferencia.fiscal)} × vendedores ${money(calculo.conferencia.atribuido)}`)),
        h('span', '›')),

    calculo.bloqueios.length > 0 && card('Resolver antes de fechar', null,
      h('div.lista', ...calculo.bloqueios.map((b) => h('button.alerta', {
        style: { '--cor': 'var(--vermelho)' }, onClick: () => navigate(b.rota),
      },
      h('span.alerta__icone', '⚠️'),
      h('div.alerta__corpo',
        h('div.alerta__titulo', b.texto),
        h('div.alerta__sub', money(b.valor))),
      h('span.alerta__seta', '›'))))),

    (calculo.avisos.semRegra > 0 || calculo.avisos.semCusto > 0 || calculo.avisos.semItens > 0) && aviso(
      [
        calculo.avisos.semRegra > 0 && `${calculo.avisos.semRegra} linha(s) sem regra de comissão`,
        calculo.avisos.semCusto > 0 && `${calculo.avisos.semCusto} linha(s) com base "margem" sem custo`,
        calculo.avisos.semItens > 0 && `${calculo.avisos.semItens} NF(s) sem itens importados`,
      ].filter(Boolean).join(' · '),
      'atencao',
      botao('Regras', { pequeno: true, onClick: () => editarRegras(regras, vendedores, produtos) })),

    /* vendedores */
    calculo.vendedores.length === 0
      ? vazio('🎯', 'Nada a comissionar neste mês',
        'Importe as NFs e os pedidos para o app cruzar venda → vendedor.',
        botao('Central de arquivos', { tipo: 'primario', onClick: () => navigate('/arquivos') }))
      : h('div.lista', ...calculo.vendedores.map((v) => cardVendedor(v, mes, fechada, calculo))),

    /* ações */
    secao('Ações', null,
      h('div.btn-linha',
        botao('⚙️ Regras de comissão', { onClick: () => editarRegras(regras, vendedores, produtos) }),
        botao(`📋 Ajustes (${ajustes.filter((a) => a.mes === mes).length})`, { onClick: () => verAjustes(ajustes.filter((a) => a.mes === mes)) }),
        botao('📄 PDF geral', { onClick: () => pdfGeral(calculo) }),
        botao('📊 Excel detalhado', { onClick: () => excelDetalhado(calculo) }))),

    secao('Fechamento', null, card(null, null,
      fechada
        ? h('div.empilha',
          aviso(`🔒 Período fechado em ${timestampLabel(calculo.fechadoEm)}.`, 'ok'),
          botao('Reabrir período', { onClick: () => reabrir(mes) }))
        : h('div.empilha',
          h('p.pequeno.muted', calculo.podeFechar
            ? 'Tudo conferido: faturamento fiscal = soma dos vendedores, nenhuma NF sem vendedor.'
            : 'O fechamento fica bloqueado até não haver NF sem vendedor nem divergência de faturamento.'),
          h('div.btn-linha',
            calculo.status !== 'aprovada' && botao('Marcar como revisada', { onClick: () => mudarStatus(mes, 'revisada') }),
            botao('Aprovar', { onClick: () => mudarStatus(mes, 'aprovada') }),
            botao('🔒 Fechar mês', { tipo: 'ok', desabilitado: !calculo.podeFechar, onClick: () => fecharMes(mes) }))))));
}

function cardVendedor(v, mes, fechada, calculo) {
  return h('div.card',
    h('div.comissao-vendedor__topo',
      h('div.crescer',
        h('h3', v.nome),
        h('div.mini.muted', `${money(v.faturamento)} faturados · base ${money(v.base)}`)),
      h('div.dir',
        h('div.kpi__valor.kpi__valor--p.num', { style: { color: 'var(--roxo)' } }, money(v.comissao)),
        v.comissao !== v.comissaoOriginal && h('div.mini.muted', `antes ${money(v.comissaoOriginal)}`))),
    h('div.linha', { style: { marginTop: '8px', flexWrap: 'wrap' } },
      v.ajustes > 0 && selo(`${v.ajustes} ajuste(s)`, 'roxo'),
      v.pendentes > 0 && selo(`${v.pendentes} sem base`, 'atencao'),
      selo(`${pct(v.faturamento ? (v.comissao / v.faturamento) * 100 : 0, 2)} do faturamento`),
      h('div.crescer'),
      botao('Ver linhas', { pequeno: true, onClick: () => abrirLinhas(v, mes, fechada) }),
      botao('PDF', { pequeno: true, onClick: () => pdfVendedor(v, mes, calculo) })));
}

function abrirLinhas(v, mes, fechada) {
  abrirFolha({
    titulo: `${v.nome} — ${monthLabel(mes)}`,
    corpo: h('div',
      linhasDetalhe([
        ['Faturamento atribuído', money(v.faturamento)],
        ['Base de cálculo', money(v.base)],
        ['Comissão calculada', money(v.comissaoOriginal)],
        ['Comissão final', money(v.comissao)],
      ]),
      h('h3', { style: { margin: '12px 0 0' } }, `${v.linhas.length} linha(s)`),
      ...v.linhas.map((linha) => h(
        `button.comissao-linha${linha.ajustada ? '.comissao-linha--ajustada' : ''}${linha.impedimento ? '.comissao-linha--pendente' : ''}`,
        { onClick: () => (fechada ? mostrarLinha(linha) : ajustarLinha(linha, mes)) },
        h('span.forte', linha.produtoDescricao || `NF ${linha.nfNumero}`),
        h('span.num.forte', linha.comissao == null ? '—' : money(linha.comissao)),
        h('span.comissao-linha__sub',
          h('span', `NF ${linha.nfNumero}`),
          h('span', formatDate(linha.data, 'short')),
          h('span', linha.clienteNome || ''),
          linha.quantidade != null && h('span', `${linha.quantidade} un`),
          h('span', `venda ${money(linha.valorVenda)}`),
          linha.percentual != null && h('span', `${pct(linha.percentual, 2)}`),
          linha.impedimento && h('span.atencao', `⚠️ ${linha.impedimento}`),
          linha.ajustada && h('span', { style: { color: 'var(--roxo)' } }, '✎ ajustada'))))),
    acoes: [botao('Fechar', { tipo: 'primario', bloco: true, onClick: () => fechar() })],
  });
}

function mostrarLinha(linha) {
  detalhe(linha.produtoDescricao || `NF ${linha.nfNumero}`,
    linhasDetalhe([
      ['NF', linha.nfNumero],
      ['Data', formatDate(linha.data)],
      ['Cliente', linha.clienteNome || '—'],
      ['Valor da venda', money(linha.valorVenda)],
      ['Regra aplicada', linha.regraNome || '—'],
      ['Base', linha.base == null ? '—' : money(linha.base)],
      ['Percentual', linha.percentual == null ? '—' : pct(linha.percentual, 2)],
      ['Comissão', linha.comissao == null ? '—' : money(linha.comissao)],
    ]),
    linha.ajustes.length ? h('div',
      h('h3', 'Ajustes'),
      ...linha.ajustes.map((a) => h('div.aviso',
        h('div.crescer',
          h('strong.pequeno', `${commission.TIPOS_AJUSTE[a.tipo]?.label}: ${money(a.de)} → ${money(a.para)}`),
          h('div.mini.muted', `${a.motivo} · ${a.usuario} · ${timestampLabel(a.criadoEm)}`))))) : null);
}

async function ajustarLinha(linha, mes) {
  const r = await formulario({
    titulo: 'Ajustar comissão',
    descricao: `${linha.produtoDescricao || `NF ${linha.nfNumero}`} · venda ${money(linha.valorVenda)} · `
      + `calculada ${linha.comissao == null ? '—' : money(linha.comissao)}`,
    campos: [
      {
        chave: 'escopo',
        label: 'Aplicar a',
        tipo: 'opcoes',
        opcoes: [
          { valor: 'item', label: 'Só este item' },
          { valor: 'nf', label: 'Toda a NF' },
          { valor: 'produto', label: 'Este produto no mês' },
          { valor: 'vendedor', label: 'Todo o vendedor' },
        ],
      },
      {
        chave: 'tipo',
        label: 'O que fazer',
        tipo: 'select',
        opcoes: Object.entries(commission.TIPOS_AJUSTE).map(([valor, t]) => ({ valor, label: t.label })),
      },
      { chave: 'valor', label: 'Valor / percentual', tipo: 'dinheiro', ajuda: 'Para "Retirar comissão" pode deixar em branco.' },
      { chave: 'motivo', label: 'Motivo', tipo: 'area', obrigatorio: true, ajuda: 'Fica registrado com seu nome, data e hora.' },
    ],
    confirmar: 'Aplicar ajuste',
  });
  if (!r) return;
  try {
    await commission.ajustar({
      escopo: r.escopo,
      alvoId: r.escopo === 'item' ? linha.id : r.escopo === 'nf' ? linha.nfId : r.escopo === 'produto' ? linha.produtoId : linha.vendedorId,
      descricaoAlvo: r.escopo === 'item' ? (linha.produtoDescricao || `NF ${linha.nfNumero}`) : r.escopo === 'nf' ? `NF ${linha.nfNumero}` : r.escopo === 'produto' ? linha.produtoDescricao : 'vendedor',
      tipo: r.tipo,
      valor: r.valor,
      valorOriginal: linha.comissao,
      motivo: r.motivo,
      mes,
    });
    fechar();
    ok('Ajuste registrado.');
    refresh();
  } catch (e) {
    erro(e.message);
  }
}

function verAjustes(ajustes) {
  if (!ajustes.length) {
    detalhe('Ajustes do mês', h('p.pequeno.muted', 'Nenhum ajuste neste período.'));
    return;
  }
  detalhe('Ajustes do mês',
    h('div.lista', ...ajustes.map((a) => h('div.item',
      h('div.item__corpo',
        h('div.item__titulo', `${commission.TIPOS_AJUSTE[a.tipo]?.label} — ${a.descricaoAlvo || a.alvoId}`),
        h('div.item__sub',
          h('span', `${a.escopo}`),
          a.valorOriginal != null && h('span', `de ${money(a.valorOriginal)}`),
          h('span', `valor ${a.tipo === 'percentual' ? pct(a.valor, 2) : money(a.valor)}`)),
        h('div.mini.muted', `${a.motivo} · ${a.usuario} · ${timestampLabel(a.criadoEm)}`)),
      botao('Remover', {
        pequeno: true,
        onClick: async () => {
          try {
            await commission.removerAjuste(a.id);
            fechar();
            ok('Ajuste removido.');
            refresh();
          } catch (e) { erro(e.message); }
        },
      })))));
}

/* -------------------------------------------------------------------- regras */

async function editarRegras(regras, vendedores, produtos) {
  const categorias = [...new Set(produtos.map((p) => p.categoriaManual || p.categoria).filter(Boolean))];
  abrirFolha({
    titulo: 'Regras de comissão',
    corpo: h('div.empilha', { style: { gap: '10px' } },
      h('p.pequeno.muted', 'A mais específica ganha: produto + vendedor › produto › categoria + vendedor › categoria › vendedor › padrão.'),
      ...regras.map((r) => h('div.item',
        h('div.item__corpo',
          h('div.item__titulo', r.nome || commission.ESCOPOS[r.escopo]?.label),
          h('div.item__sub',
            h('span', commission.ESCOPOS[r.escopo]?.label),
            h('span', r.semComissao ? 'sem comissão' : pct(r.percentual, 2)),
            h('span', commission.BASES[r.base] || r.base),
            r.ativo === false && h('span.ruim', 'inativa'))),
        botao('Editar', { pequeno: true, onClick: () => editarRegra(r, { vendedores, categorias, produtos }) }),
        botao('✕', {
          pequeno: true,
          onClick: async () => {
            if (r.id === 'regra_padrao') { erro('A regra padrão não pode ser excluída.'); return; }
            await store.regrasComissao.remover(r.id);
            fechar();
            refresh();
          },
        }))),
      botao('+ Nova regra', { tipo: 'primario', bloco: true, onClick: () => editarRegra(null, { vendedores, categorias, produtos }) })),
    acoes: [botao('Fechar', { bloco: true, onClick: () => fechar() })],
  });
}

async function editarRegra(regra, { vendedores, categorias, produtos }) {
  const r = await formulario({
    titulo: regra ? 'Editar regra' : 'Nova regra de comissão',
    campos: [
      { chave: 'nome', label: 'Nome da regra', tipo: 'texto', valor: regra?.nome || '', placeholder: 'Ex.: Cimento' },
      {
        chave: 'escopo',
        label: 'Escopo',
        tipo: 'select',
        valor: regra?.escopo || 'categoria',
        opcoes: Object.entries(commission.ESCOPOS).map(([valor, e]) => ({ valor, label: e.label })),
      },
      {
        chave: 'categoria',
        label: 'Categoria (se o escopo usar)',
        tipo: 'select',
        valor: regra?.alvo?.categoria || '',
        opcoes: [{ valor: '', label: '—' }, ...categorias.map((c) => ({ valor: c, label: c }))],
      },
      {
        chave: 'produtoId',
        label: 'Produto (se o escopo usar)',
        tipo: 'select',
        valor: regra?.alvo?.produtoId || '',
        opcoes: [{ valor: '', label: '—' }, ...produtos.slice(0, 300).map((p) => ({ valor: p.id, label: `${p.codigo || ''} ${p.descricao || ''}`.trim() }))],
      },
      {
        chave: 'vendedorId',
        label: 'Vendedor (se o escopo usar)',
        tipo: 'select',
        valor: regra?.alvo?.vendedorId || '',
        opcoes: [{ valor: '', label: '—' }, ...vendedores.map((v) => ({ valor: v.id, label: v.nome }))],
      },
      { chave: 'percentual', label: 'Percentual (%)', tipo: 'numero', valor: regra?.percentual ?? 0 },
      {
        chave: 'base',
        label: 'Base de cálculo',
        tipo: 'select',
        valor: regra?.base || 'valorProdutos',
        opcoes: Object.entries(commission.BASES).map(([valor, label]) => ({ valor, label })),
      },
      {
        chave: 'semComissao',
        label: 'Produto sem comissão?',
        tipo: 'opcoes',
        valor: regra?.semComissao ? 'sim' : 'nao',
        opcoes: [{ valor: 'nao', label: 'Paga comissão' }, { valor: 'sim', label: 'Não paga' }],
      },
      { chave: 'vigenciaDe', label: 'Vale a partir de', tipo: 'data', valor: regra?.vigenciaDe || '' },
      { chave: 'vigenciaAte', label: 'Vale até', tipo: 'data', valor: regra?.vigenciaAte || '' },
    ],
    confirmar: 'Salvar regra',
  });
  if (!r) return;
  await store.regrasComissao.salvar({
    id: regra?.id,
    nome: r.nome || commission.ESCOPOS[r.escopo]?.label,
    escopo: r.escopo,
    alvo: {
      categoria: r.categoria || null,
      produtoId: r.produtoId || null,
      vendedorId: r.vendedorId || null,
    },
    percentual: Number(r.percentual) || 0,
    base: r.base,
    semComissao: r.semComissao === 'sim',
    vigenciaDe: r.vigenciaDe || null,
    vigenciaAte: r.vigenciaAte || null,
    ativo: true,
  });
  await store.registrar('regra_comissao', { alvoId: regra?.id || 'nova', alvo: r.nome, para: `${r.percentual}%` });
  fechar();
  ok('Regra salva.');
  refresh();
}

/* ------------------------------------------------------------------- status */

async function mudarStatus(mes, status) {
  try {
    await commission.definirStatus(mes, status);
    ok('Status atualizado.');
    refresh();
  } catch (e) { erro(e.message); }
}

async function fecharMes(mes) {
  const confirmado = await confirmar({
    titulo: `Fechar as comissões de ${monthLabel(mes)}?`,
    texto: 'Depois de fechado, ajustes ficam bloqueados até a reabertura — e a reabertura exige motivo.',
    confirmar: 'Fechar mês',
  });
  if (!confirmado) return;
  try {
    await commission.fechar(mes);
    ok('Mês fechado 🔒');
    refresh();
  } catch (e) { erro(e.message); }
}

async function reabrir(mes) {
  const r = await formulario({
    titulo: 'Reabrir período',
    campos: [{ chave: 'motivo', label: 'Motivo da reabertura', tipo: 'area', obrigatorio: true }],
  });
  if (!r) return;
  try {
    await commission.reabrir(mes, r.motivo);
    ok('Período reaberto.');
    refresh();
  } catch (e) { erro(e.message); }
}

/* --------------------------------------------------------------- relatórios */

function pdfGeral(calculo) {
  imprimir({
    titulo: 'Comissões',
    subtitulo: monthLabel(calculo.mes),
    periodo: `Situação: ${commission.STATUS_PERIODO[calculo.status]?.label}`,
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Total de comissões', valor: money(calculo.total) },
          { label: 'Faturamento atribuído', valor: money(calculo.faturamentoAtribuido) },
          { label: 'Faturamento fiscal', valor: money(calculo.faturamentoFiscal) },
          { label: 'Diferença', valor: money(calculo.conferencia.diferenca) },
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'Por vendedor',
        colunas: [
          { header: 'Vendedor', key: 'nome' },
          { header: 'Faturamento', key: 'faturamento', tipo: 'money', alinhar: 'direita' },
          { header: 'Base', key: 'base', tipo: 'money', alinhar: 'direita' },
          { header: 'Comissão', key: 'comissao', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: calculo.vendedores,
        total: {
          nome: 'TOTAL',
          faturamento: calculo.faturamentoAtribuido,
          comissao: calculo.total,
        },
      },
    ],
    rodape: calculo.conferencia.ok
      ? 'Conferência: faturamento fiscal igual ao atribuído aos vendedores (diferença R$ 0,00).'
      : `ATENÇÃO: diferença de ${money(calculo.conferencia.diferenca)} entre faturamento fiscal e atribuído.`,
  });
}

function pdfVendedor(v, mes) {
  imprimir({
    titulo: `Comissão — ${v.nome}`,
    subtitulo: monthLabel(mes),
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Faturamento', valor: money(v.faturamento) },
          { label: 'Base de cálculo', valor: money(v.base) },
          { label: 'Comissão', valor: money(v.comissao) },
          { label: '% sobre faturamento', valor: pct(v.faturamento ? (v.comissao / v.faturamento) * 100 : 0, 2) },
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'Detalhe',
        colunas: [
          { header: 'NF', key: 'nfNumero' },
          { header: 'Data', key: 'data', tipo: 'date' },
          { header: 'Cliente', key: 'clienteNome' },
          { header: 'Produto', key: 'produtoDescricao' },
          { header: 'Venda', key: 'valorVenda', tipo: 'money', alinhar: 'direita' },
          { header: '%', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
          { header: 'Comissão', key: 'comissao', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: v.linhas,
        total: { nfNumero: `${v.linhas.length} linhas`, valorVenda: v.faturamento, comissao: v.comissao },
      },
    ],
  });
}

function excelDetalhado(calculo) {
  exportarExcel(`comissoes_${calculo.mes}`, [
    {
      name: 'Resumo',
      title: `Comissões — ${monthLabel(calculo.mes)}`,
      columns: [
        { header: 'Vendedor', key: 'nome', type: 'text', width: 30 },
        { header: 'Faturamento', key: 'faturamento', type: 'money' },
        { header: 'Base', key: 'base', type: 'money' },
        { header: 'Comissão calculada', key: 'comissaoOriginal', type: 'money' },
        { header: 'Comissão final', key: 'comissao', type: 'money' },
        { header: 'Ajustes', key: 'ajustes', type: 'int' },
      ],
      rows: calculo.vendedores,
      total: { nome: 'TOTAL', faturamento: calculo.faturamentoAtribuido, comissao: calculo.total },
    },
    {
      name: 'Detalhado',
      title: `Detalhe por item — ${monthLabel(calculo.mes)}`,
      columns: [
        { header: 'Vendedor', key: 'vendedorNome', type: 'text', width: 24 },
        { header: 'NF', key: 'nfNumero', type: 'text', width: 12 },
        { header: 'Data', key: 'data', type: 'date' },
        { header: 'Cliente', key: 'clienteNome', type: 'text', width: 30 },
        { header: 'Produto', key: 'produtoDescricao', type: 'text', width: 34 },
        { header: 'Categoria', key: 'categoria', type: 'text' },
        { header: 'Qtd', key: 'quantidade', type: 'num' },
        { header: 'Venda', key: 'valorVenda', type: 'money' },
        { header: 'Regra', key: 'regraNome', type: 'text' },
        { header: 'Base', key: 'base', type: 'money' },
        { header: '%', key: 'percentual', type: 'pct' },
        { header: 'Comissão', key: 'comissao', type: 'money' },
        { header: 'Ajustada', key: 'ajustadaTexto', type: 'text' },
        { header: 'Pendência', key: 'impedimento', type: 'text' },
      ],
      rows: calculo.linhas.map((l) => ({
        ...l,
        vendedorNome: calculo.vendedores.find((v) => v.vendedorId === l.vendedorId)?.nome || '',
        ajustadaTexto: l.ajustada ? 'sim' : '',
      })),
      total: { vendedorNome: 'TOTAL', comissao: calculo.total },
    },
    calculo.semVendedor.quantidade > 0 && {
      name: 'NFs sem vendedor',
      title: 'Notas que não entraram em nenhuma comissão',
      columns: [
        { header: 'NF', key: 'numero', type: 'text' },
        { header: 'Emissão', key: 'dataEmissao', type: 'date' },
        { header: 'Cliente', key: 'clienteNome', type: 'text', width: 34 },
        { header: 'Valor', key: 'valorTotal', type: 'money' },
      ],
      rows: calculo.semVendedor.notas,
      total: { numero: 'TOTAL', valorTotal: calculo.semVendedor.valor },
    },
  ].filter(Boolean));
}
