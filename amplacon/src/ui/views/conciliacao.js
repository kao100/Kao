/**
 * CONCILIAÇÃO / CONTROLE DE QUALIDADE (item 14)
 * Só o que exige atenção. Resolveu, sai da frente.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { TIPOS_PENDENCIA, recalcular, definirVendedorDaNf } from '../../logic/link.js';
import { definirTitulo, atualizarAlertas } from '../shell.js';
import { kpi, chips, botao, aviso, selo } from '../components/ui.js';
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
    botoes.push(botao('Definir vendedor', { tipo: 'primario', pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
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
