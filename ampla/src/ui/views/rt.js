/**
 * RT — quem traz a obra e ganha por isso.
 *
 * "Tenho três que ganham: o Thomas, o André e a Tereza. Esses três ganham RT em
 *  cima de X CNPJs e eles ganham em cima do valor total vendido, contando frete,
 *  tudo."
 *
 * A tela não tenta adivinhar nada: ela mostra o faturamento dos CNPJs que cada
 * um trouxe, no período escolhido, e o percentual aplicado em cima. O vínculo é
 * cadastro — feito uma vez, por CNPJ.
 */

import { h } from '../../core/dom.js';
import { refresh } from '../../core/router.js';
import * as rtLogica from '../../logic/rt.js';
import * as store from '../../core/store.js';
import { lerFiltro, descrever } from '../../logic/filtro.js';
import { filtroAvancado } from '../components/filtro.js';
import { definirTitulo } from '../shell.js';
import { kpi, secao, botao, vazio, aviso, selo, card } from '../components/ui.js';
import { tabela, exportadores, exportarPlanilha } from '../components/table.js';
import { imprimir, exportarExcel } from '../../logic/reports.js';
import { formulario, confirmar } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, pct, num, formatDate } from '../../core/format.js';

const COLUNAS = [
  { header: 'Quem indicou', key: 'nome' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: '%', key: 'percentual', tipo: 'percentual', alinhar: 'direita' },
  { header: 'RT a pagar', key: 'valor', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'CNPJs', key: 'documentos', tipo: 'numero', alinhar: 'direita' },
  { header: 'NFs', key: 'notas', tipo: 'numero', alinhar: 'direita' },
];

const COLUNAS_NOTAS = [
  { header: 'NF', key: 'numero' },
  { header: 'Data', key: 'data', tipo: 'data' },
  { header: 'Cliente', key: 'clienteNome' },
  { header: 'CNPJ / CPF', key: 'documento' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'RT', key: 'valorRt', tipo: 'dinheiro', alinhar: 'direita' },
];

/**
 * O PDF DE UMA PESSOA SÓ. Nada de outra pessoa entra aqui — nem no cabeçalho,
 * nem no rodapé, nem num total que entregue quanto os outros ganharam.
 */
function pdfDoRt(l, filtro) {
  imprimir({
    titulo: `RT — ${l.nome}`,
    subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Faturamento indicado', valor: money(l.faturamento) },
          { label: 'Percentual', valor: pct(l.percentual, 2) },
          { label: 'RT a receber', valor: money(l.valor) },
          { label: 'Notas', valor: String(l.listaDeNotas.length) },
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'Notas fiscais do período',
        colunas: [
          { header: 'NF', key: 'numero' },
          { header: 'Data', key: 'data', tipo: 'date' },
          { header: 'Cliente', key: 'clienteNome' },
          { header: 'Faturamento', key: 'faturamento', tipo: 'money', alinhar: 'direita' },
          { header: 'RT', key: 'valorRt', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: l.listaDeNotas,
        total: { numero: `${l.listaDeNotas.length} nota(s)`, faturamento: l.faturamento, valorRt: l.valor },
      },
    ],
    rodape: 'O RT é calculado sobre o valor total da nota, com frete. Cada nota aqui tem o valor '
      + 'dela ao lado — a soma das partes é o total.',
  });
}

function excelDoRt(l, filtro) {
  exportarExcel(`rt_${l.nome.replace(/[^\w]+/g, '_').toLowerCase()}_${filtro.de}`, [
    {
      name: 'Notas',
      title: `RT ${l.nome} — ${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
      columns: [
        { header: 'NF', key: 'numero', type: 'text', width: 12 },
        { header: 'Data', key: 'data', type: 'date' },
        { header: 'Cliente', key: 'clienteNome', type: 'text', width: 32 },
        { header: 'CNPJ / CPF', key: 'documento', type: 'text', width: 20 },
        { header: 'Faturamento', key: 'faturamento', type: 'money' },
        { header: 'RT', key: 'valorRt', type: 'money' },
      ],
      rows: l.listaDeNotas,
      total: { numero: 'TOTAL', faturamento: l.faturamento, valorRt: l.valor },
    },
  ]);
}

export async function telaRt({ query }) {
  const filtro = lerFiltro(query);
  const [r, vendedores] = await Promise.all([
    rtLogica.rt({ de: filtro.de, ate: filtro.ate }),
    store.vendedores.listar(),
  ]);
  definirTitulo('RT (indicação)', descrever(filtro, { vendedores }));

  const painel = filtroAvancado({
    rota: '/rt',
    filtro,
    rotuloData: 'Período do faturamento',
    aoExportar: () => exportarPlanilha({
      titulo: 'RT por indicação',
      subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
      nomeArquivo: `rt_${filtro.de}_${filtro.ate}`,
      colunas: COLUNAS,
      linhas: r.linhas,
    }),
  });

  if (!r.linhas.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      painel,
      vazio('🤝', 'Ninguém cadastrado para receber RT',
        'RT é a comissão de quem traz a obra: a pessoa não aparece na nota, então o app a '
        + 'reconhece pelos CNPJs que ela trouxe. Cadastre o nome, o percentual e os CNPJs — '
        + 'o resto a tela faz sozinha.',
        botao('Cadastrar quem recebe RT', { tipo: 'primario', onClick: () => editar(null) })));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    painel,

    r.conflitos.length > 0 && aviso(
      `⚠️ O mesmo CNPJ está em mais de um cadastro: ${r.conflitos.slice(0, 3)
        .map((c) => `${c.documento} (${c.de} e ${c.e})`).join('; ')}. `
      + 'Enquanto isso existir, a mesma venda paga RT duas vezes. Tire o CNPJ de um dos dois.',
      'ruim'),

    secao('RT do período',
      exportadores(() => ({
        titulo: 'RT por indicação',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `rt_${filtro.de}`,
        colunas: COLUNAS,
        linhas: r.linhas,
        total: { nome: 'TOTAL', faturamento: r.faturamentoCoberto, valor: r.total },
      })),
      h('div.grade.grade--2',
        kpi({ label: 'RT a pagar', valor: money(r.total), icone: '🤝', cor: 'roxo' }),
        kpi({
          label: 'Faturamento indicado', valor: money(r.faturamentoCoberto), icone: '🧾', cor: 'info',
          nota: r.faturamentoDoPeriodo
            ? `${pct((r.faturamentoCoberto / r.faturamentoDoPeriodo) * 100, 1)} do mês` : null,
        })),
      tabela({
        colunas: COLUNAS,
        linhas: r.linhas,
        total: { nome: 'TOTAL', faturamento: r.faturamentoCoberto, valor: r.total },
      }),
      /**
       * A BASE DO RT É OUTRA, e isso precisa estar escrito: somar o percentual
       * do RT com o do vendedor daria um custo de venda que não existe, porque
       * um é sobre o total e o outro é só sobre o produto.
       */
      h('p.mini.muted',
        `O RT é calculado sobre o ${r.base} — diferente da comissão do vendedor, que é só sobre `
        + 'o produto. São duas bases diferentes de propósito: a mesma venda pode pagar as duas, '
        + 'e os percentuais não se somam.')),

    r.semDocumento.length > 0 && aviso(
      `${r.semDocumento.join(', ')} ${r.semDocumento.length === 1 ? 'está' : 'estão'} sem nenhum `
      + 'CNPJ vinculado, então o app não calcula RT — e não mostra zero, que seria outra coisa. '
      + 'Edite e cole os CNPJs.', 'atencao'),

    secao('Quem recebe RT', botao('+ Novo', { pequeno: true, onClick: () => editar(null) }),
      h('div.lista', ...r.linhas.map((l) => h('div.item',
        h('div.item__corpo',
          h('div.item__titulo', l.nome),
          h('div.item__sub',
            h('span', `${pct(l.percentual, 0)} sobre o total`),
            l.documentos
              ? h('span', `${num(l.documentos, 0)} CNPJ(s)`)
              : selo('sem CNPJ', 'atencao'),
            l.semMovimento > 0 && h('span.muted', `${l.semMovimento} sem venda no período`))),
        /**
         * UM RELATÓRIO POR PESSOA.
         *
         * "Não é legal mandar um relatório para o cliente com as comissões de
         *  outras pessoas. Eu preciso conseguir exportar relatórios separados
         *  para cada pessoa."
         *
         * Então o botão fica na linha dela e leva só o que é dela — nome, as
         * notas do período e o RT de cada uma.
         */
        l.documentos > 0 && botao('PDF', { pequeno: true, onClick: () => pdfDoRt(l, filtro) }),
        l.documentos > 0 && botao('Excel', { pequeno: true, onClick: () => excelDoRt(l, filtro) }),
        botao('Editar', { pequeno: true, onClick: () => editar(l.id) }),
        botao('Excluir', { pequeno: true, onClick: () => excluir(l.id) })))),
      h('p.mini.muted',
        'Quem recebe RT não é vendedor e nunca aparece na nota — por isso fica aqui e não no '
        + 'cadastro de vendedores. Misturar os dois faria a soma dos vendedores passar do '
        + 'faturamento.')),

    /* o detalhe de cada pessoa: os faturamentos e, abaixo, NOTA POR NOTA */
    ...r.linhas.filter((l) => l.documentos > 0).map((l) => secao(l.nome,
      h('div.linha',
        botao('PDF', { pequeno: true, onClick: () => pdfDoRt(l, filtro) }),
        botao('Excel', { pequeno: true, onClick: () => excelDoRt(l, filtro) })),
      card('Por faturamento', null, tabela({
        colunas: [
          { header: 'CNPJ / CPF', key: 'documento' },
          { header: 'Cliente', key: 'nome' },
          { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
          { header: 'NFs', key: 'notas', tipo: 'numero', alinhar: 'direita' },
        ],
        linhas: l.faturamentos,
        total: { documento: 'TOTAL', faturamento: l.faturamento, notas: l.notas },
      })),
      /**
       * NOTA POR NOTA — o controle que o cliente confere.
       *
       * "Para ele chegar e falar 'não recebi dessa nota', e você estar ali, um
       *  relatório onde mostra quais são as notas pagas naquele mês."
       */
      l.listaDeNotas.length > 0 && card(`${l.listaDeNotas.length} nota(s) no período`, null,
        tabela({ colunas: COLUNAS_NOTAS, linhas: l.listaDeNotas,
          total: { numero: 'TOTAL', faturamento: l.faturamento, valorRt: l.valor } })))));
}

async function editar(id) {
  const lista = await store.rts.listar();
  const atual = id ? lista.find((x) => x.id === id) : null;

  const r = await formulario({
    titulo: atual ? `Editar ${atual.nome}` : 'Quem recebe RT',
    campos: [
      { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true, valor: atual?.nome || '' },
      {
        chave: 'percentual',
        label: 'Percentual',
        tipo: 'numero',
        valor: atual?.percentual ?? rtLogica.PERCENTUAL_PADRAO,
        ajuda: 'Sobre o valor total da nota, com frete.',
      },
      {
        chave: 'documentos',
        label: 'CNPJs / CPFs das obras dele',
        tipo: 'area',
        valor: (atual?.documentos || []).join('\n'),
        placeholder: '12.345.678/0001-90\n98.765.432/0001-10',
        ajuda: 'Um por linha, ou separados por vírgula. É por aqui que o app reconhece a venda — '
          + 'o nome dele não aparece na nota.',
      },
      {
        chave: 'ativo',
        label: 'Situação',
        tipo: 'opcoes',
        valor: atual?.ativo === false ? 'nao' : 'sim',
        opcoes: [{ valor: 'sim', label: 'Ativo' }, { valor: 'nao', label: 'Inativo' }],
      },
    ],
    confirmar: 'Salvar',
  });
  if (!r) return;

  await store.rts.salvar({
    ...(atual || {}),
    id: atual?.id,
    nome: r.nome,
    percentual: r.percentual === '' || r.percentual == null
      ? rtLogica.PERCENTUAL_PADRAO : Number(r.percentual),
    documentos: rtLogica.lerDocumentos(r.documentos),
    ativo: r.ativo !== 'nao',
  });
  ok('Salvo.');
  refresh();
}

async function excluir(id) {
  const atual = (await store.rts.listar()).find((x) => x.id === id);
  if (!atual) return;
  const sim = await confirmar({
    titulo: `Excluir ${atual.nome}?`,
    texto: 'O cadastro sai e o RT dele deixa de ser calculado. As notas não mudam.',
    confirmar: 'Excluir',
    perigo: true,
  });
  if (!sim) return;
  await store.rts.remover(atual.id);
  ok('Excluído.');
  refresh();
}
