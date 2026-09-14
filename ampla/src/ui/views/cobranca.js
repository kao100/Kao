/**
 * INADIMPLÊNCIA / COBRANÇA (item 8)
 * Substitui o relatório impresso: vi → entendi → fiz → dei check → saiu da frente.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as collection from '../../logic/collection.js';
import * as store from '../../core/store.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, vazio } from '../components/ui.js';
import { exportadores } from '../components/table.js';
import { formulario, detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, formatDate, timestampLabel, today, addDays, relativeDay } from '../../core/format.js';

export async function telaCobranca({ query }) {
  const filtro = query.f || 'cobrarHoje';
  const [carteira, contas] = await Promise.all([collection.carteira(), store.contas.listar()]);
  const totais = collection.totais(carteira);
  definirTitulo('Cobrança', `${totais.cobrarHoje} para cobrar hoje`);

  if (!carteira.length) {
    return vazio('📥', 'Nenhum título a receber',
      'Importe o relatório de contas a receber para começar a cobrança.',
      botao('Importar contas a receber', { tipo: 'primario', onClick: () => navigate('/arquivos/receber') }));
  }

  const lista = collection.aplicarFiltro(carteira, filtro);
  const contadores = Object.fromEntries(collection.FILTROS.map((f) => [
    f.id, collection.aplicarFiltro(carteira, f.id).length,
  ]));

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--4',
      kpi({
        label: 'Cobrar hoje', valor: String(totais.cobrarHoje), icone: '📞',
        nota: money(totais.valorCobrarHoje), cor: totais.cobrarHoje ? 'ruim' : 'ok',
        onClick: () => navigate(href('/cobranca', { f: 'cobrarHoje' })),
      }),
      kpi({ label: 'Vencido', valor: money(totais.vencido), icone: '🔴', nota: `${totais.titulosVencidos} títulos`, cor: 'ruim' }),
      kpi({ label: 'Promessas', valor: money(totais.promessas), icone: '🟣', nota: `${totais.promessasQuantidade} clientes`, cor: 'roxo' }),
      kpi({ label: 'Recebido hoje', valor: money(totais.pagosHoje), icone: '🟢', cor: 'ok' })),

    chips(collection.FILTROS.map((f) => ({ ...f, contador: contadores[f.id] })), filtro,
      (id) => navigate(href('/cobranca', { f: id }))),

    filtro === 'cobrarHoje' && totais.cobrarHoje === 0
      ? h('div.tudo-ok',
        h('div.tudo-ok__icone', '✅'),
        h('h3', 'Cobrança do dia concluída'),
        h('p.pequeno.muted', 'Ninguém está esperando contato agora. Os próximos aparecem aqui automaticamente.'))
      : null,

    h('div.lista', ...lista.map((linha) => itemCobranca(linha, contas))),

    lista.length === 0 && filtro !== 'cobrarHoje'
      ? h('p.pequeno.muted.centro', { style: { padding: '18px' } }, 'Nada neste filtro.')
      : null,

    secao('Atraso por faixa',
      exportadores(() => montarExportacao(carteira, totais)),
      card(null, null, h('div.faixas', ...totais.faixas.map((f) => h('div.faixa',
        h('span.muted', f.label),
        h('div.faixa__trilho',
          h('div.faixa__barra', { style: { width: `${totais.vencido ? (f.valor / totais.vencido) * 100 : 0}%` } })),
        h('span.num.forte', money(f.valor))))))));
}

function itemCobranca(linha, contas) {
  const s = collection.STATUS[linha.status];
  return h(`div.item.item--st.st-${linha.status}.cobranca-item`,
    h('div.cobranca-item__topo',
      h('span.ponto', { style: { marginTop: '5px' } }),
      h('div.item__corpo',
        h('div.item__titulo', linha.clienteNome),
        h('div.item__sub',
          h('span', `título ${linha.documento}`),
          linha.nfNumero && h('span', `NF ${linha.nfNumero}`),
          h('span', `vence ${formatDate(linha.vencimento, 'short')}`),
          linha.diasAtraso > 0 && h('span.atraso', `${linha.diasAtraso}d em atraso`),
          linha.vendedorNome && h('span.muted', `· ${linha.vendedorNome}`)),
        h('div.item__sub', h('span.selo.selo--st', `${s.emoji} ${s.label}`), h('span.muted', linha.proximaAcao))),
      h('div.empilha',
        h('div.item__valor', money(linha.valorAberto || linha.valor)),
        linha.telefone && h('a.mini.dir', { href: `tel:${linha.telefone}` }, linha.telefone))),

    (linha.ultimaCobranca || linha.promessa || linha.ultimoRetorno) && h('div.cobranca-item__hist',
      linha.ultimaCobranca && h('span', `📞 cobrado ${relativeDay(linha.ultimaCobranca.data)} (${timestampLabel(linha.ultimaCobranca.momento)})`),
      linha.ultimoRetorno?.retorno && h('span', `💬 "${linha.ultimoRetorno.retorno}"`),
      linha.promessa && h('span', {
        class: linha.promessaVencida ? 'ruim' : '',
      }, `🟣 prometeu ${formatDate(linha.promessa.promessaData)}${linha.promessa.promessaValor ? ` — ${money(linha.promessa.promessaValor)}` : ''}${linha.promessaVencida ? ' (não cumprida)' : ''}`)),

    !linha.pago && h('div.cobranca-item__acoes',
      !linha.ultimaCobranca || linha.precisaCobrarHoje
        ? botao('📞 Cobrei', { tipo: 'primario', pequeno: true, onClick: () => cobrei(linha) })
        : botao('📞 Cobrei de novo', { pequeno: true, onClick: () => cobrei(linha) }),
      linha.ultimaCobranca && !linha.promessaAtiva
        ? botao('💬 Teve retorno', { pequeno: true, onClick: () => retorno(linha) })
        : null,
      botao('🟢 Recebi', { tipo: 'ok', pequeno: true, onClick: () => recebi(linha, contas) }),
      botao('Detalhes', { pequeno: true, onClick: () => abrirDetalhe(linha) })),

    linha.pago && h('div.cobranca-item__hist',
      h('span.ok', `✅ pago em ${formatDate(linha.titulo.dataRecebimento)} — ${money(linha.titulo.valorRecebido ?? linha.valor)}`)));
}

async function cobrei(linha) {
  const r = await formulario({
    titulo: `Cobrar ${linha.clienteNome}`,
    descricao: 'A data e a hora são gravadas automaticamente.',
    campos: [
      {
        chave: 'canal',
        label: 'Como cobrou?',
        tipo: 'opcoes',
        opcoes: [
          { valor: 'whatsapp', label: 'WhatsApp' },
          { valor: 'telefone', label: 'Telefone' },
          { valor: 'email', label: 'E-mail' },
          { valor: 'presencial', label: 'Pessoalmente' },
        ],
      },
      { chave: 'contato', label: 'Falou com quem?', tipo: 'texto', valor: linha.contato || '', placeholder: 'nome da pessoa' },
      { chave: 'observacao', label: 'Observação', tipo: 'area', placeholder: 'opcional' },
    ],
    confirmar: 'Registrar cobrança',
  });
  if (!r) return;
  await collection.registrarCobranca(linha.id, r);
  ok('Cobrança registrada.');
  refresh();
}

async function retorno(linha) {
  const r = await formulario({
    titulo: `Retorno de ${linha.clienteNome}`,
    campos: [
      { chave: 'retorno', label: 'O que o cliente respondeu?', tipo: 'area', obrigatorio: true },
      {
        chave: 'prometeu',
        label: 'Prometeu pagar?',
        tipo: 'opcoes',
        opcoes: [{ valor: 'nao', label: 'Não' }, { valor: 'sim', label: 'Sim' }],
      },
      { chave: 'promessaData', label: 'Data prometida', tipo: 'data', valor: addDays(today(), 3) },
      { chave: 'promessaValor', label: 'Valor prometido', tipo: 'dinheiro', valor: linha.valorAberto },
    ],
    confirmar: 'Registrar retorno',
  });
  if (!r) return;
  await collection.registrarRetorno(linha.id, {
    retorno: r.retorno,
    prometeuPagar: r.prometeu === 'sim',
    promessaData: r.promessaData,
    promessaValor: r.promessaValor ? Number(r.promessaValor) : null,
  });
  ok(r.prometeu === 'sim' ? 'Promessa registrada — já entra no fluxo de caixa.' : 'Retorno registrado.');
  refresh();
}

async function recebi(linha, contas) {
  const r = await formulario({
    titulo: `Recebimento — ${linha.clienteNome}`,
    descricao: 'O pagamento atualiza a inadimplência, o contas a receber e o fluxo de caixa de uma vez só.',
    campos: [
      { chave: 'valor', label: 'Valor recebido', tipo: 'dinheiro', obrigatorio: true, valor: linha.valorAberto },
      { chave: 'data', label: 'Data do pagamento', tipo: 'data', obrigatorio: true, valor: today() },
      {
        chave: 'contaId',
        label: 'Entrou em qual banco?',
        tipo: 'select',
        opcoes: [{ valor: '', label: 'Não informar' }, ...contas.map((c) => ({ valor: c.id, label: c.nome }))],
      },
      { chave: 'observacao', label: 'Observação', tipo: 'texto' },
    ],
    confirmar: 'Dar baixa',
  });
  if (!r) return;
  const resultado = await collection.registrarPagamento(linha.id, {
    data: r.data, valor: Number(r.valor), contaId: r.contaId || null, observacao: r.observacao,
  });
  ok(resultado.quitado ? 'Título quitado ✅' : `Baixa parcial — restam ${money(resultado.saldo)}`);
  refresh();
}

function abrirDetalhe(linha) {
  detalhe(`${linha.clienteNome} — título ${linha.documento}`,
    linhasDetalhe([
      ['Valor original', money(linha.valor)],
      ['Em aberto', money(linha.valorAberto)],
      ['Emissão', linha.titulo.emissao ? formatDate(linha.titulo.emissao) : '—'],
      ['Vencimento', formatDate(linha.vencimento)],
      ['Dias em atraso', linha.diasAtraso || '—'],
      ['NF de origem', linha.nfNumero || '—'],
      ['Vendedor', linha.vendedorNome || '—'],
      ['Banco / carteira', linha.titulo.banco || '—'],
      ['Telefone', linha.telefone || '—'],
      ['E-mail', linha.email || '—'],
      ['Contato', linha.contato || '—'],
    ]),
    linha.eventos.length ? h('div',
      h('h3', { style: { margin: '8px 0 6px' } }, 'Histórico'),
      h('div.empilha', { style: { gap: '6px' } }, ...linha.eventos.slice().reverse().map((e) => h('div.aviso',
        h('div.crescer',
          h('strong.pequeno', rotuloEvento(e)),
          h('div.mini.muted', `${timestampLabel(e.momento)} · ${e.usuario}`),
          e.observacao && h('div.mini', e.observacao)))))) : h('p.pequeno.muted', 'Nenhuma ação registrada ainda.'),
    !linha.pago && botao('Registrar promessa de pagamento', {
      bloco: true,
      onClick: async () => {
        const r = await formulario({
          titulo: 'Promessa de pagamento',
          campos: [
            { chave: 'promessaData', label: 'Data prometida', tipo: 'data', obrigatorio: true, valor: addDays(today(), 3) },
            { chave: 'promessaValor', label: 'Valor', tipo: 'dinheiro', valor: linha.valorAberto },
          ],
        });
        if (!r) return;
        await collection.registrarPromessa(linha.id, { promessaData: r.promessaData, promessaValor: Number(r.promessaValor) || null });
        ok('Promessa registrada.');
        refresh();
      },
    }));
}

function rotuloEvento(e) {
  if (e.tipo === 'cobranca') return `📞 Cobrança por ${e.canal || 'contato'}${e.contato ? ` com ${e.contato}` : ''}`;
  if (e.tipo === 'retorno') return `💬 Retorno: ${e.retorno || ''}`;
  if (e.tipo === 'promessa') return `🟣 Prometeu pagar em ${formatDate(e.promessaData)}${e.promessaValor ? ` — ${money(e.promessaValor)}` : ''}`;
  if (e.tipo === 'pagamento') return `🟢 Pagamento de ${money(e.valorPago)}`;
  return e.tipo;
}

function montarExportacao(carteira, totais) {
  const abertos = carteira.filter((l) => !l.pago);
  return {
    titulo: 'Posição de cobrança',
    subtitulo: `${abertos.length} títulos em aberto · ${money(totais.vencido)} vencidos`,
    periodo: `Posição em ${formatDate(today())}`,
    nomeArquivo: `cobranca_${today()}`,
    colunas: [
      { header: 'Cliente', key: 'clienteNome' },
      { header: 'Título', key: 'documento' },
      { header: 'NF', key: 'nfNumero' },
      { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
      { header: 'Dias atraso', key: 'diasAtraso', tipo: 'int', alinhar: 'direita' },
      { header: 'Em aberto', key: 'valorAberto', tipo: 'money', alinhar: 'direita' },
      { header: 'Situação', key: 'situacao' },
      { header: 'Última cobrança', key: 'ultima', tipo: 'date' },
      { header: 'Promessa', key: 'promessaData', tipo: 'date' },
      { header: 'Vendedor', key: 'vendedorNome' },
      { header: 'Telefone', key: 'telefone' },
    ],
    linhas: abertos.map((l) => ({
      ...l,
      situacao: collection.STATUS[l.status].label,
      ultima: l.ultimaCobranca?.data || null,
      promessaData: l.promessa?.promessaData || null,
    })),
    total: { clienteNome: `${abertos.length} títulos`, valorAberto: totais.aberto },
  };
}
