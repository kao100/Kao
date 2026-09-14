/**
 * BANCOS / EXTRATO (item 13)
 * Saldo por conta, movimentações e o que ainda não foi conciliado.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as cashflow from '../../logic/cashflow.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, vazio, aviso } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { formulario, detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, formatDate, today } from '../../core/format.js';
import { cents, sum, sortBy } from '../../core/util.js';

export async function telaBancos({ query }) {
  const contaFiltro = query.c || 'todas';
  const [contas, movimentos, saldo] = await Promise.all([
    store.contas.listar(), store.extrato.listar(), cashflow.saldoAtual(),
  ]);
  definirTitulo('Bancos', `saldo total ${money(saldo.total)}`);

  if (!contas.length) {
    return vazio('🏦', 'Cadastre as contas bancárias',
      'O fluxo de caixa começa do saldo real de cada banco.',
      botao('Cadastrar conta', { tipo: 'primario', onClick: () => novaConta() }));
  }

  const filtrados = sortBy(
    movimentos.filter((m) => contaFiltro === 'todas' || m.contaId === contaFiltro),
    (m) => m.data, 'desc',
  );
  const pendentes = filtrados.filter((m) => m.conciliacaoStatus === 'pendente');
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--3',
      ...saldo.porConta.map((c) => kpi({
        label: c.conta.nome,
        valor: money(c.saldo),
        icone: '🏦',
        cor: c.saldo >= 0 ? 'ok' : 'ruim',
        nota: c.confiavel
          ? `saldo de ${formatDate(c.dataBase)} + ${c.movimentos} lançamentos`
          : 'sem saldo informado — só a soma do extrato',
        onClick: () => editarSaldo(c.conta),
      })),
      kpi({ label: 'Saldo total', valor: money(saldo.total), icone: '💰', cor: 'info', destaque: true })),

    !saldo.confiavel && aviso('Informe o saldo de cada conta para o fluxo de caixa partir do número exato. '
      + 'Toque no card do banco para digitar o saldo, ou importe o extrato em OFX (ele já traz o saldo).', 'atencao'),

    pendentes.length > 0 && h('button.aviso.aviso--atencao', { style: { width: '100%' }, onClick: () => navigate('/conciliacao') },
      h('div.crescer', { style: { textAlign: 'left' } },
        h('strong', `${pendentes.length} movimento(s) sem vínculo`),
        h('div.mini', `${money(cents(sum(pendentes, (m) => Math.abs(m.valor))))} sem título identificado`)),
      h('span', '›')),

    h('div.btn-linha',
      botao('📥 Importar extrato', { tipo: 'primario', onClick: () => navigate('/arquivos/extrato') }),
      botao('+ Conta', { onClick: () => novaConta() })),

    chips([{ id: 'todas', label: 'Todas as contas' }, ...contas.map((c) => ({ id: c.id, label: c.nome }))], contaFiltro,
      (id) => navigate(href('/bancos', { c: id }))),

    filtrados.length === 0
      ? vazio('📄', 'Sem movimentações importadas',
        'Importe o OFX do banco — ele traz um identificador único por lançamento e evita duplicidade.',
        botao('Importar extrato', { tipo: 'primario', onClick: () => navigate('/arquivos/extrato') }))
      : secao('Movimentações',
        exportadores(() => montarExportacao(filtrados, nomeConta)),
        card(null, null, tabela({
          colunas: [
            { header: 'Data', key: 'data', tipo: 'date' },
            { header: 'Banco', key: 'contaId', formatar: (v) => nomeConta.get(v) || '—' },
            { header: 'Histórico', key: 'descricao' },
            { header: 'Entrada', key: 'entrada', tipo: 'money', alinhar: 'direita' },
            { header: 'Saída', key: 'saida', tipo: 'money', alinhar: 'direita' },
            {
              header: 'Conciliação',
              key: 'conciliacaoStatus',
              formatar: (v, linha) => (v === 'conciliado'
                ? `✅ ${linha.conciliadoCom?.descricao || 'ok'}`
                : v === 'ignorado' ? '— ignorado' : '⚠️ pendente'),
            },
          ],
          linhas: filtrados.slice(0, 300).map((m) => ({
            ...m,
            entrada: m.valor > 0 ? m.valor : null,
            saida: m.valor < 0 ? Math.abs(m.valor) : null,
          })),
          aoClicar: (linha) => abrirMovimento(linha, nomeConta),
        }))));
}

async function novaConta() {
  const r = await formulario({
    titulo: 'Nova conta bancária',
    campos: [
      { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Itaú, Bradesco…' },
      { chave: 'banco', label: 'Banco', tipo: 'texto', placeholder: 'usado para casar com a planilha' },
      { chave: 'agencia', label: 'Agência', tipo: 'texto' },
      { chave: 'numero', label: 'Conta', tipo: 'texto' },
      { chave: 'saldo', label: 'Saldo atual', tipo: 'dinheiro' },
    ],
  });
  if (!r) return;
  const conta = await store.contas.salvar({
    nome: r.nome, banco: r.banco || r.nome, agencia: r.agencia || null, numero: r.numero || null, ativa: true,
  });
  if (r.saldo) {
    await store.saldos.salvar({ id: `sal_${conta.id}_${today()}`, contaId: conta.id, data: today(), saldo: Number(r.saldo), origem: 'manual' });
  }
  ok('Conta cadastrada.');
  refresh();
}

async function editarSaldo(conta) {
  const r = await formulario({
    titulo: `Saldo — ${conta.nome}`,
    descricao: 'O fluxo de caixa parte deste número e soma os lançamentos posteriores à data informada.',
    campos: [
      { chave: 'saldo', label: 'Saldo', tipo: 'dinheiro', obrigatorio: true },
      { chave: 'data', label: 'Data do saldo', tipo: 'data', obrigatorio: true, valor: today() },
    ],
    confirmar: 'Salvar saldo',
  });
  if (!r) return;
  await store.saldos.salvar({
    id: `sal_${conta.id}_${r.data}`, contaId: conta.id, data: r.data, saldo: Number(r.saldo), origem: 'manual',
  });
  await store.registrar('saldo_informado', { alvoId: conta.id, alvo: conta.nome, para: Number(r.saldo), motivo: 'informado à mão' });
  ok('Saldo atualizado.');
  refresh();
}

function abrirMovimento(mov, nomeConta) {
  detalhe(mov.descricao || 'Lançamento',
    linhasDetalhe([
      ['Data', formatDate(mov.data)],
      ['Banco', nomeConta.get(mov.contaId) || '—'],
      ['Valor', money(mov.valor)],
      ['Documento', mov.documento || '—'],
      ['Identificador do banco', mov.fitid || '—'],
      ['Conciliação', mov.conciliacaoStatus],
      mov.conciliadoCom && ['Vinculado a', `${mov.conciliadoCom.tipo} · ${mov.conciliadoCom.descricao || mov.conciliadoCom.id}`],
    ]),
    mov.conciliacaoStatus === 'pendente'
      ? botao('Resolver na conciliação', { tipo: 'primario', bloco: true, onClick: () => navigate('/conciliacao') })
      : null);
}

function montarExportacao(movimentos, nomeConta) {
  return {
    titulo: 'Extrato bancário',
    subtitulo: `${movimentos.length} movimentações`,
    periodo: `Posição em ${formatDate(today())}`,
    nomeArquivo: `extrato_${today()}`,
    colunas: [
      { header: 'Data', key: 'data', tipo: 'date' },
      { header: 'Banco', key: 'banco' },
      { header: 'Histórico', key: 'descricao', largura: 40 },
      { header: 'Documento', key: 'documento' },
      { header: 'Entrada', key: 'entrada', tipo: 'money', alinhar: 'direita' },
      { header: 'Saída', key: 'saida', tipo: 'money', alinhar: 'direita' },
      { header: 'Conciliação', key: 'conciliacaoStatus' },
    ],
    linhas: movimentos.map((m) => ({
      ...m,
      banco: nomeConta.get(m.contaId) || '',
      entrada: m.valor > 0 ? m.valor : null,
      saida: m.valor < 0 ? Math.abs(m.valor) : null,
    })),
    total: {
      data: `${movimentos.length} lançamentos`,
      entrada: cents(sum(movimentos.filter((m) => m.valor > 0), (m) => m.valor)),
      saida: cents(sum(movimentos.filter((m) => m.valor < 0), (m) => Math.abs(m.valor))),
    },
  };
}
