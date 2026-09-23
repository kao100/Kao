/**
 * CONCILIAÇÃO / CONTROLE DE QUALIDADE (item 14)
 * Só o que exige atenção. Resolveu, sai da frente.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import {
  TIPOS_PENDENCIA, recalcular, definirVendedorDaNf, definirVendedorDoPedido, pedidosSemVendedor,
} from '../../logic/link.js';
import { definirTitulo, atualizarAlertas } from '../shell.js';
import { card, kpi, chips, botao, aviso, selo, vazio } from '../components/ui.js';
import * as suggest from '../../logic/suggest.js';
import { formulario, detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok, erro } from '../components/toast.js';
import { money, formatDate } from '../../core/format.js';
import { cents, sum, sortBy } from '../../core/util.js';

export async function telaConciliacao({ query }) {
  const filtro = query.t || 'todas';
  const [pendencias, vendedores, nfs, titulos, pagamentos] = await Promise.all([
    store.pendencias.listar(), store.vendedores.listar(), store.nfs.listar(),
    store.receber.listar(), store.pagar.listar(),
  ]);
  definirTitulo('Conciliação');

  const abertas = pendencias.filter((p) => p.status === 'aberta');
  const ignoradas = pendencias.filter((p) => p.status === 'ignorada');
  const porTipo = new Map();
  for (const p of abertas) porTipo.set(p.tipo, (porTipo.get(p.tipo) || 0) + 1);

  const lista = sortBy(
    filtro === 'todas' ? abertas : filtro === 'ignoradas' ? ignoradas : abertas.filter((p) => p.tipo === filtro),
    (p) => gravidadeOrdem(p.tipo),
  );

  const cabecalho = h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--3',
      kpi({
        label: 'Pendências abertas', valor: String(abertas.length), icone: '⚠️',
        cor: abertas.length ? 'ruim' : 'ok',
      }),
      kpi({
        label: 'Valor envolvido',
        valor: money(cents(sum(abertas, (p) => Math.abs(p.valor || 0)))),
        icone: '💸',
      }),
      kpi({ label: 'Ignoradas', valor: String(ignoradas.length), icone: '🙈' })),

    h('div.btn-linha',
      botao('🔄 Refazer os vínculos', { onClick: () => refazer() }),
      botao('Central de arquivos', { onClick: () => navigate('/arquivos') })));

  if (!abertas.length && filtro === 'todas') {
    return h('div.empilha', { style: { gap: '14px' } },
      cabecalho,
      h('div.tudo-ok',
        h('div.tudo-ok__icone', '✅'),
        h('h3', 'Todas as conciliações OK'),
        h('p.pequeno.muted', 'Nenhuma NF sem vendedor, nenhuma divergência de faturamento e nenhum movimento bancário solto.')),
      ignoradas.length > 0 && botao(`Ver ${ignoradas.length} pendência(s) ignorada(s)`, {
        bloco: true, onClick: () => navigate(href('/conciliacao', { t: 'ignoradas' })),
      }));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    cabecalho,

    chips([
      { id: 'todas', label: 'Todas', contador: abertas.length },
      ...[...porTipo.entries()].map(([tipo, n]) => ({
        id: tipo,
        label: `${TIPOS_PENDENCIA[tipo]?.icone || '•'} ${TIPOS_PENDENCIA[tipo]?.titulo || tipo}`,
        contador: n,
      })),
      ignoradas.length > 0 && { id: 'ignoradas', label: 'Ignoradas', contador: ignoradas.length },
    ].filter(Boolean), filtro, (id) => navigate(href('/conciliacao', { t: id }))),

    filtro !== 'todas' && filtro !== 'ignoradas' && TIPOS_PENDENCIA[filtro]
      ? aviso(TIPOS_PENDENCIA[filtro].explicacao, 'info')
      : null,

    h('div.lista', ...lista.slice(0, 150).map((p) => cardPendencia(p, { vendedores, nfs, titulos, pagamentos }))),

    lista.length === 0 && h('p.pequeno.muted.centro', { style: { padding: '18px' } }, 'Nada neste filtro.'));
}

function gravidadeOrdem(tipo) {
  const g = TIPOS_PENDENCIA[tipo]?.gravidade;
  return g === 'alta' ? 0 : g === 'media' ? 1 : 2;
}

function cardPendencia(p, contexto) {
  const tipo = TIPOS_PENDENCIA[p.tipo] || { titulo: p.tipo, icone: '•', gravidade: 'baixa' };
  const cor = tipo.gravidade === 'alta' ? 'var(--vermelho)' : tipo.gravidade === 'media' ? 'var(--amarelo)' : 'var(--azul)';
  return h('div.pendencia', { style: { '--cor': cor } },
    h('span.pendencia__icone', tipo.icone),
    h('div.pendencia__corpo',
      h('div.pendencia__titulo', p.titulo),
      p.detalhe && h('div.pendencia__detalhe', p.detalhe),
      h('div.linha', { style: { marginTop: '8px', flexWrap: 'wrap' } },
        selo(tipo.titulo, tipo.gravidade === 'alta' ? 'ruim' : tipo.gravidade === 'media' ? 'atencao' : 'info'),
        p.status === 'ignorada' && selo('ignorada', undefined),
        h('div.crescer'),
        ...acoes(p, contexto))),
    p.valor != null && h('div.pendencia__valor', money(p.valor)));
}

function acoes(p, contexto) {
  const botoes = [];

  if (p.tipo === 'nf_sem_vendedor') {
    botoes.push(botao('Ver sugestões', { tipo: 'primario', pequeno: true, onClick: () => navigate('/conciliacao/vendedores') }));
    botoes.push(botao('Definir vendedor', { pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
    botoes.push(botao('Ver NF', { pequeno: true, onClick: () => verNf(p, contexto) }));
  } else if (p.tipo === 'extrato_sem_vinculo') {
    botoes.push(botao('Vincular', { tipo: 'primario', pequeno: true, onClick: () => vincularMovimento(p, contexto) }));
  } else if (p.tipo === 'receber_sem_nf') {
    botoes.push(botao('Escolher NF', { tipo: 'primario', pequeno: true, onClick: () => vincularNfDoTitulo(p, contexto) }));
  } else if (p.tipo === 'divergencia_faturamento') {
    botoes.push(botao('Ver NFs sem vendedor', { tipo: 'primario', pequeno: true, onClick: () => navigate(href('/conciliacao', { t: 'nf_sem_vendedor' })) }));
  } else if (p.tipo === 'produto_sem_custo') {
    botoes.push(botao('Importar custos', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/produtos') }));
  } else if (p.tipo === 'item_sem_nf') {
    botoes.push(botao('Importar NFs', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/nfs') }));
  } else if (p.tipo === 'pagar_sem_categoria') {
    botoes.push(botao('Ver contas a pagar', { tipo: 'primario', pequeno: true, onClick: () => navigate('/pagar') }));
  } else if (p.tipo === 'pago_sem_banco') {
    botoes.push(botao('Ver extrato', { tipo: 'primario', pequeno: true, onClick: () => navigate('/bancos') }));
  }

  if (p.status === 'ignorada') {
    botoes.push(botao('Reabrir', { pequeno: true, onClick: () => reabrir(p) }));
  } else {
    botoes.push(botao('Ignorar', { pequeno: true, onClick: () => ignorar(p) }));
  }
  return botoes;
}

/* ------------------------------------------------------------------- ações */

async function resolverVendedor(p, { vendedores, nfs }) {
  const nf = nfs.find((n) => n.id === p.alvo?.id);
  if (!nf) { erro('NF não encontrada.'); return; }
  if (!vendedores.length) { erro('Nenhum vendedor cadastrado ainda. Importe os pedidos ou cadastre em Ajustes.'); return; }

  const r = await formulario({
    titulo: `NF ${nf.numero} — definir vendedor`,
    descricao: `${nf.clienteNome || 'cliente não identificado'} · emissão ${formatDate(nf.dataEmissao)} · ${money(nf.valorTotal)}`,
    campos: [
      {
        chave: 'vendedorId',
        label: 'Vendedor',
        tipo: 'select',
        opcoes: vendedores.map((v) => ({ valor: v.id, label: v.nome })),
      },
      {
        chave: 'motivo',
        label: 'Por que este vendedor?',
        tipo: 'texto',
        obrigatorio: true,
        placeholder: 'conferido no pedido 12345',
        ajuda: 'Fica registrado no histórico com data e hora.',
      },
    ],
    confirmar: 'Definir',
  });
  if (!r) return;
  await definirVendedorDaNf(nf.id, r.vendedorId, r.motivo);
  await atualizarAlertas();
  ok('Vendedor definido — comissão e faturamento atualizados.');
  refresh();
}

function verNf(p, { nfs }) {
  const nf = nfs.find((n) => n.id === p.alvo?.id);
  if (!nf) return;
  detalhe(`NF ${nf.numero}`,
    linhasDetalhe([
      ['Série', nf.serie || '—'],
      ['Emissão', formatDate(nf.dataEmissao)],
      ['Cliente', nf.clienteNome || '—'],
      ['CNPJ/CPF', nf.clienteDoc || '—'],
      ['Valor total', money(nf.valorTotal)],
      ['Valor dos produtos', nf.valorProdutos == null ? '—' : money(nf.valorProdutos)],
      ['Frete', nf.valorFrete == null ? '—' : money(nf.valorFrete)],
      ['Pedido informado', nf.pedidoNumero || '— (o XML não trouxe)'],
      ['Natureza', nf.naturezaOperacao || '—'],
      ['Origem do dado', nf.origem === 'xml' ? 'XML da NF-e' : 'relatório'],
    ]),
    aviso('O app não adivinha o vendedor. Importe o relatório de pedidos com o número do pedido '
      + 'para a ligação passar a ser automática.', 'info'));
}

async function vincularMovimento(p, { titulos, pagamentos }) {
  const mov = (await store.extrato.listar()).find((m) => m.id === p.alvo?.id);
  if (!mov) { erro('Movimento não encontrado.'); return; }
  const entrada = mov.valor >= 0;
  const candidatos = entrada
    ? titulos.filter((t) => t.status === 'aberto' || t.dataRecebimento === mov.data)
    : pagamentos.filter((c) => c.status !== 'pago' || c.dataPagamento === mov.data);

  const ordenados = sortBy(candidatos, (c) => Math.abs((c.saldo ?? c.valor) - Math.abs(mov.valor))).slice(0, 60);
  if (!ordenados.length) { erro('Nenhum título candidato encontrado.'); return; }

  const r = await formulario({
    titulo: `Vincular ${entrada ? 'entrada' : 'saída'} de ${money(Math.abs(mov.valor))}`,
    descricao: `${formatDate(mov.data)} · ${mov.descricao || 'sem descrição'}`,
    campos: [
      {
        chave: 'alvo',
        label: entrada ? 'Título a receber' : 'Conta a pagar',
        tipo: 'select',
        opcoes: ordenados.map((c) => ({
          valor: c.id,
          label: `${c.clienteNome || c.fornecedorNome} · ${money(c.saldo ?? c.valor)} · vence ${formatDate(c.vencimento)}`,
        })),
      },
      {
        chave: 'baixar',
        label: 'Dar baixa no título também?',
        tipo: 'opcoes',
        opcoes: [{ valor: 'sim', label: 'Sim, marcar como pago' }, { valor: 'nao', label: 'Só vincular' }],
      },
    ],
    confirmar: 'Vincular',
  });
  if (!r) return;

  const alvo = ordenados.find((c) => c.id === r.alvo);
  await store.extrato.salvar({
    ...mov,
    conciliacaoStatus: 'conciliado',
    conciliadoCom: {
      tipo: entrada ? 'receber' : 'pagar',
      id: alvo.id,
      descricao: alvo.clienteNome || alvo.fornecedorNome,
    },
    conciliadoEm: Date.now(),
    conciliadoPor: 'manual',
  });

  if (r.baixar === 'sim') {
    if (entrada) {
      await store.receber.salvar({
        ...alvo,
        valorRecebido: Math.abs(mov.valor),
        saldo: cents((alvo.valor || 0) - Math.abs(mov.valor)),
        dataRecebimento: mov.data,
        status: cents((alvo.valor || 0) - Math.abs(mov.valor)) <= 0.009 ? 'pago' : 'aberto',
        baixaManual: true,
      });
    } else {
      await store.pagar.salvar({
        ...alvo, status: 'pago', dataPagamento: mov.data, valorPago: Math.abs(mov.valor), baixaManual: true,
      });
    }
  }

  await store.registrar('conciliacao_manual', {
    alvoId: mov.id,
    alvo: mov.descricao,
    para: alvo.clienteNome || alvo.fornecedorNome,
    motivo: 'vinculado à mão na conciliação',
  });
  await recalcular();
  await atualizarAlertas();
  ok('Movimento conciliado.');
  refresh();
}

async function vincularNfDoTitulo(p, { nfs }) {
  const titulo = (await store.receber.listar()).find((t) => t.id === p.alvo?.id);
  if (!titulo) { erro('Título não encontrado.'); return; }
  const candidatas = sortBy(
    nfs.filter((n) => n.clienteId === titulo.clienteId || String(n.numero).includes(String(titulo.nfNumero || ''))),
    (n) => n.dataEmissao, 'desc',
  ).slice(0, 60);

  if (!candidatas.length) { erro('Nenhuma NF candidata na base. Importe as notas do período.'); return; }

  const r = await formulario({
    titulo: `Título ${titulo.documento} — escolher NF`,
    descricao: `${titulo.clienteNome} · ${money(titulo.valor)} · vence ${formatDate(titulo.vencimento)}`,
    campos: [
      {
        chave: 'nfId',
        label: 'Nota fiscal',
        tipo: 'select',
        opcoes: candidatas.map((n) => ({
          valor: n.id,
          label: `NF ${n.numero} · ${formatDate(n.dataEmissao)} · ${money(n.valorTotal)} · ${n.clienteNome || ''}`,
        })),
      },
      { chave: 'motivo', label: 'Motivo', tipo: 'texto', obrigatorio: true },
    ],
    confirmar: 'Vincular',
  });
  if (!r) return;
  const nf = candidatas.find((n) => n.id === r.nfId);
  await store.receber.salvar({ ...titulo, nfId: nf.id, nfNumero: nf.numero, vendedorId: nf.vendedorId || titulo.vendedorId });
  await store.registrar('titulo_nf', { alvoId: titulo.id, alvo: titulo.documento, para: `NF ${nf.numero}`, motivo: r.motivo });
  await recalcular();
  await atualizarAlertas();
  ok('Título vinculado à NF.');
  refresh();
}

async function ignorar(p) {
  const r = await formulario({
    titulo: 'Ignorar esta pendência',
    descricao: 'Ela some da lista, mas continua registrada — e volta se o motivo deixar de existir.',
    campos: [{ chave: 'motivo', label: 'Por quê?', tipo: 'texto', obrigatorio: true }],
    confirmar: 'Ignorar',
  });
  if (!r) return;
  await store.pendencias.salvar({ ...p, status: 'ignorada', motivoIgnorada: r.motivo, ignoradaEm: Date.now() });
  await store.registrar('pendencia_ignorada', { alvoId: p.id, alvo: p.titulo, motivo: r.motivo });
  await atualizarAlertas();
  ok('Pendência ignorada.');
  refresh();
}

async function reabrir(p) {
  await store.pendencias.salvar({ ...p, status: 'aberta', motivoIgnorada: null });
  await atualizarAlertas();
  refresh();
}

async function refazer() {
  const resultado = await recalcular();
  await atualizarAlertas();
  ok(`Vínculos refeitos · ${resultado.pendencias} pendência(s) aberta(s).`);
  refresh();
}

/* --------------------------------------------- de quem foi esta venda? */

/**
 * A tela que responde "olha Maria, está faltando o vendedor destes aqui".
 *
 * A unidade de trabalho é o PEDIDO, não a nota: nenhum relatório traz o
 * vendedor, então você define uma vez por pedido e todas as notas daquele
 * pedido herdam — inclusive as que forem emitidas depois. Um toque no nome
 * resolve e a linha sai da frente.
 *
 * As notas que nem chegaram a um pedido ficam embaixo, no bloco de sugestões:
 * ali o app mostra candidatos, mas quem decide continua sendo você.
 */
export async function telaVendedores({ query }) {
  const janela = Number(query.j || suggest.JANELA_PADRAO);
  const [pedidos, lista, vendedores, faltando] = await Promise.all([
    pedidosSemVendedor(),
    suggest.sugestoes({ janelaDias: janela }),
    store.vendedores.listar(),
    suggest.pedidosFaltando(),
  ]);
  definirTitulo('De quem foi esta venda?',
    `${pedidos.length} pedido(s) · ${lista.length} NF(s) sem pedido`);

  if (!pedidos.length && !lista.length && !faltando.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      h('div.tudo-ok',
        h('div.tudo-ok__icone', '✅'),
        h('h3', 'Todo faturamento tem dono'),
        h('p.pequeno.muted', 'O faturamento fiscal bate com a soma dos vendedores.')),
      botao('Voltar para a conciliação', { bloco: true, onClick: () => navigate('/conciliacao') }));
  }

  if (!vendedores.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      vazio('🧑‍💼', 'Nenhum vendedor cadastrado',
        'Cadastre os vendedores primeiro — é o nome deles que você vai marcar em cada pedido.',
        botao('Cadastrar vendedores', { tipo: 'primario', onClick: () => navigate('/ajustes') })));
  }

  const totalPedidos = cents(sum(pedidos, (p) => p.valor));

  return h('div.empilha', { style: { gap: '14px' } },
    faltando.length > 0 && cardPedidosFaltando(faltando),

    pedidos.length > 0 && h('div.empilha', { style: { gap: '10px' } },
      h('div.grade.grade--2',
        kpi({
          label: 'Pedidos sem vendedor', valor: String(pedidos.length), icone: '🧾', cor: 'atencao',
        }),
        kpi({ label: 'Valor parado', valor: money(totalPedidos), icone: '💰' })),

      aviso('Marque o vendedor e o pedido sai da lista. Todas as notas daquele pedido '
        + 'recebem o mesmo vendedor de uma vez — inclusive as próximas.', 'info'),

      h('div.lista', ...pedidos.slice(0, 50).map((p) => linhaPedido(p, vendedores))),
      pedidos.length > 50 && h('p.pequeno.muted.centro',
        `Mostrando os 50 maiores de ${pedidos.length}. Resolva estes e os próximos aparecem.`)),

    lista.length > 0 && h('div.empilha', { style: { gap: '10px' } },
      h('h2', { style: { marginTop: '6px' } }, `${lista.length} NF(s) que não chegaram a um pedido`),
      aviso('Aqui o contas a receber não ligou a nota a nenhum pedido. O app procura pedidos '
        + 'do mesmo cliente, anteriores à emissão, e mostra os candidatos — ele não decide sozinho. '
        + 'Se puder, reexporte o contas a receber com a coluna NOTA FISCAL: aí o vínculo fecha sem escolha.',
      'atencao'),

      chips([30, 60, 90, 180].map((d) => ({ id: String(d), label: `${d} dias` })), String(janela),
        (id) => navigate(href('/conciliacao/vendedores', { j: id }))),
      h('p.mini.muted', 'Janela: até quantos dias antes da emissão o pedido ainda é considerado.'),

      h('div.lista', ...lista.map((s) => linhaSugestao(s, {
        marcadas: new Set(), atualizarContador: () => {}, vendedores,
      })))));
}

/**
 * Uma linha por pedido, com os vendedores como botões: em telefone, um toque
 * resolve mais rápido que abrir uma lista e escolher.
 */
function linhaPedido(item, vendedores) {
  const { pedido, notas, valor } = item;
  const marcar = async (v) => {
    await definirVendedorDoPedido(pedido.id, v.id,
      `definido na tela de vendedores · ${notas.length} NF(s) herdaram`);
    await atualizarAlertas();
    ok(`Pedido ${pedido.numero || ''} é de ${v.nome}${notas.length ? ` · ${notas.length} NF(s) atualizadas` : ''}.`);
    refresh();
  };

  return h('div.card',
    h('div.linha.linha--entre', { style: { alignItems: 'flex-start' } },
      h('div.crescer',
        h('strong', `Pedido ${pedido.numero || '(sem número)'}`),
        h('div.mini.muted', { style: { marginTop: '2px' } },
          pedido.clienteNome || 'cliente não identificado'),
        h('div.mini.muted',
          pedido.data ? `venda em ${formatDate(pedido.data)}` : 'sem data de venda')),
      h('div.empilha', { style: { alignItems: 'flex-end' } },
        h('span.num.forte', money(valor)),
        h('span.mini.muted', notas.length
          ? `${notas.length} NF: ${notas.map((n) => n.numero).filter(Boolean).slice(0, 3).join(', ')}`
          : 'ainda sem NF'))),

    h('div.btn-linha', { style: { marginTop: '10px', flexWrap: 'wrap' } },
      ...vendedores.map((v) => botao(v.nome, { pequeno: true, onClick: () => marcar(v) }))));
}

/**
 * O atalho mais direto: a NF diz qual pedido a gerou, mas esse pedido não está
 * na base. Exportar esses números do relatório de vendedores resolve sem escolha
 * nenhuma — por isso a lista vem pronta para copiar.
 */
function cardPedidosFaltando(faltando) {
  const numeros = faltando.map((f) => f.numero).join(', ');
  const total = faltando.reduce((acc, f) => acc + f.valor, 0);

  return h('div.card.card--alerta',
    h('div.linha', { style: { alignItems: 'flex-start' } },
      h('span', { style: { fontSize: '20px' } }, '📋'),
      h('div.crescer',
        h('h3', `${faltando.length} pedido(s) citados pelas NFs não estão na base`),
        h('p.mini.muted', { style: { marginTop: '3px' } },
          `${money(total)} em notas. Exporte estes pedidos do relatório de vendedores e `
          + 'importe em Pedidos / vendedores — o vínculo fecha sozinho, sem escolha nenhuma.'))),

    h('p.pequeno.num', { style: { marginTop: '10px', wordBreak: 'break-word', lineHeight: '1.7' } }, numeros),

    h('div.btn-linha', { style: { marginTop: '10px' } },
      botao('📋 Copiar números', {
        pequeno: true,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(numeros);
            ok('Números copiados.');
          } catch {
            erro('Não consegui copiar. Selecione a lista acima.');
          }
        },
      }),
      botao('Importar pedidos', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/pedidos') })));
}

function linhaSugestao(s, ctx) {
  const info = suggest.CONFIANCA[s.confianca];
  const { nf } = s;
  const marcavel = !!s.melhor;
  const caixa = h('span.check__caixa', '✓');

  const alternar = () => {
    if (!marcavel) return;
    if (ctx.marcadas.has(nf.id)) ctx.marcadas.delete(nf.id);
    else ctx.marcadas.add(nf.id);
    linha.classList.toggle('check--marcado', ctx.marcadas.has(nf.id));
    ctx.atualizarContador();
  };

  const linha = h(`div.item.item--st.st-${s.confianca === 'exata' ? 'pago' : 'cobrado'}`,
    { class: ctx.marcadas.has(nf.id) ? 'check--marcado' : '' },
    marcavel ? h('button', { onClick: alternar, style: { background: 'none', padding: 0 } }, caixa) : h('span.ponto'),
    h('div.item__corpo',
      h('div.item__titulo', `NF ${nf.numero} — ${nf.clienteNome || 'cliente não identificado'}`),
      h('div.item__sub',
        h('span', formatDate(nf.dataEmissao)),
        h('span.forte', money(nf.valorTotal)),
        selo(info.label, info.cor === 'neutro' ? undefined : info.cor)),
      s.melhor
        ? h('div.item__sub',
          h('span', `↳ pedido ${s.melhor.pedido.numero}`),
          h('span.forte', s.melhor.vendedorNome),
          h('span', `${formatDate(s.melhor.pedido.data)} · ${s.melhor.diasAntes} dia(s) antes`),
          s.melhor.mesmoValor
            ? h('span.ok', 'mesmo valor')
            : h('span.atencao', s.melhor.diferenca == null
              ? 'pedido sem valor'
              : `diferença de ${money(s.melhor.diferenca)}`))
        : h('div.item__sub',
          h('span.atencao', s.explicacao || info.detalhe),
          s.motivo === 'pedido_ausente'
            ? h('span.muted', '— basta importar esse pedido')
            : null),
      h('div.item__acoes',
        s.candidatos.length > 0 && botao(`Escolher pedido (${s.candidatos.length})`, {
          pequeno: true, onClick: () => escolherPedido(s),
        }),
        botao('Definir vendedor à mão', {
          pequeno: true, onClick: () => definirManual(nf, ctx.vendedores),
        }))));

  return linha;
}

async function escolherPedido(s) {
  if (!s.candidatos.length) { erro('Nenhum pedido candidato para esta nota.'); return; }
  const r = await formulario({
    titulo: `NF ${s.nf.numero} — qual pedido gerou?`,
    descricao: `${s.nf.clienteNome} · ${formatDate(s.nf.dataEmissao)} · ${money(s.nf.valorTotal)}`,
    campos: [{
      chave: 'pedidoId',
      label: 'Pedido',
      tipo: 'select',
      opcoes: s.candidatos.map((c) => ({
        valor: c.pedido.id,
        label: `${c.pedido.numero} · ${c.vendedorNome} · ${formatDate(c.pedido.data)} · `
          + `${c.pedido.valorTotal == null ? 'sem valor' : money(c.pedido.valorTotal)}`
          + `${c.mesmoValor ? ' ✓ mesmo valor' : ''}`,
      })),
    }],
    confirmar: 'Confirmar vínculo',
  });
  if (!r) return;
  await suggest.confirmar(s.nf.id, r.pedidoId);
  await recalcular();
  await atualizarAlertas();
  ok('Vínculo confirmado.');
  refresh();
}

async function definirManual(nf, vendedores) {
  if (!vendedores.length) { erro('Nenhum vendedor cadastrado. Importe os pedidos ou cadastre em Ajustes.'); return; }
  const r = await formulario({
    titulo: `NF ${nf.numero} — definir vendedor`,
    descricao: `${nf.clienteNome || 'cliente não identificado'} · ${formatDate(nf.dataEmissao)} · ${money(nf.valorTotal)}`,
    campos: [
      { chave: 'vendedorId', label: 'Vendedor', tipo: 'select', opcoes: vendedores.map((v) => ({ valor: v.id, label: v.nome })) },
      { chave: 'motivo', label: 'Por que este vendedor?', tipo: 'texto', obrigatorio: true },
    ],
    confirmar: 'Definir',
  });
  if (!r) return;
  await definirVendedorDaNf(nf.id, r.vendedorId, r.motivo);
  await atualizarAlertas();
  ok('Vendedor definido.');
  refresh();
}
