/**
 * DRE GERENCIAL — a receita descendo até o lucro líquido, degrau por degrau.
 *
 * "Que, de fato, eu não sei se eu consegui encontrar isso no nosso sistema. Se
 *  tem isso, né, essa parte de DRE, que é a receita bruta, a receita líquida, a
 *  margem de contribuição, EBITDA. Aí não vejo problema, só preciso deixar mais
 *  interativo e fácil encontrar."
 *
 * Tinha: o DRE existia dentro da pasta do mês, como uma tabela de três colunas
 * no meio de seis outros documentos. Era encontrar, não construir.
 *
 * O que muda aqui é a forma: a conta vira escada, cada degrau abre no lugar e
 * mostra as contas que estão dentro dele, e a classificação do plano de contas
 * — a parte que só ela sabe responder — fica no pé da mesma tela, em vez de em
 * outro lugar. "Eu posso te categorizar, não tem problema. Só preciso que
 * tenha isso."
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { dre, linhasDoDreGerencial, planosDeContas, sugerirGrupo, lerClassificacao, GRUPOS } from '../../logic/dre.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, aviso, chips } from '../components/ui.js';
import { escada } from '../components/escada.js';
import { exportadores } from '../components/table.js';
import { ok } from '../components/toast.js';
import { money, pct, monthKey, monthLabel, monthLabelShort, addMonths, today } from '../../core/format.js';

export async function telaDre({ query }) {
  const mes = query.m || monthKey(today());
  const [d, planos, cfg] = await Promise.all([dre(mes), planosDeContas(), store.config()]);
  definirTitulo('DRE gerencial', monthLabel(mes));

  const g = d.gerencial;
  const classificacao = lerClassificacao(cfg);
  const semClassificar = planos.filter((pl) => !classificacao.has(pl.nome));

  return h('div.empilha', { style: { gap: '14px' } },
    seletorDeMes(mes),

    h('div.grade.grade--4',
      kpi({
        label: 'Receita líquida', valor: money(g.receitaLiquida), icone: '🧾',
        nota: `bruta ${money(g.receitaBruta)}`, tamanho: 'p',
      }),
      kpi({
        label: 'Margem de contribuição',
        valor: g.margemContribuicao == null ? '—' : money(g.margemContribuicao),
        icone: '📐', cor: 'info', tamanho: 'p',
        nota: g.percentuais.margemContribuicao == null ? 'falta custo' : pct(g.percentuais.margemContribuicao, 1),
      }),
      kpi({
        label: 'EBITDA', valor: g.ebitda == null ? '—' : money(g.ebitda),
        icone: '⚙️', cor: g.ebitda >= 0 ? 'ok' : 'ruim', tamanho: 'p',
        nota: g.percentuais.ebitda == null ? 'falta custo' : pct(g.percentuais.ebitda, 1),
      }),
      kpi({
        label: 'Lucro líquido', valor: g.lucroLiquido == null ? '—' : money(g.lucroLiquido),
        icone: g.lucroLiquido >= 0 ? '📈' : '📉',
        cor: g.lucroLiquido == null ? undefined : (g.lucroLiquido >= 0 ? 'ok' : 'ruim'),
        tamanho: 'p',
        nota: g.percentuais.lucroLiquido == null ? 'falta custo' : pct(g.percentuais.lucroLiquido, 1),
      })),

    ...d.avisos.map((a) => aviso(a.texto, a.nivel === 'info' ? 'info' : 'atencao')),

    semClassificar.length > 0 && aviso(
      `${semClassificar.length} conta(s) do seu plano ainda não têm degrau. `
      + 'Enquanto não tiverem, elas descontam do lucro líquido numa linha própria, '
      + '"Sem classificação" — o app não chuta em qual degrau cada uma entra.',
      'atencao',
      botao('Classificar agora', {
        pequeno: true,
        onClick: () => document.getElementById('classificar')?.scrollIntoView({ behavior: 'smooth' }),
      })),

    secao('A conta, de cima para baixo',
      exportadores(() => montarExportacao(g, mes)),
      h('div.empilha', { style: { gap: '10px' } },
        escada(linhasDoDreGerencial(g), { rotuloPercentual: '% da receita líquida' }),
        h('p.mini.muted',
          'Os percentuais à direita são sobre a RECEITA LÍQUIDA. Clique numa linha com seta '
          + 'para ver as contas que estão dentro dela.'),
        h('p.mini.muted',
          'Atenção a um nome que se repete: a tela Comercial também tem "vendas líquidas", '
          + 'mas lá é a base da margem — só mercadoria, sem o frete cobrado e sem descontar '
          + 'imposto. Aqui a receita líquida é a receita bruta menos impostos e devoluções. '
          + 'São duas perguntas diferentes, e por isso dois números diferentes.',
          ),
        botao('Ver a margem da mercadoria', { pequeno: true, onClick: () => navigate('/margem') }))),

    g.compras.total > 0 && card('Compra de mercadoria (fora das despesas)', null,
      h('p.pequeno.muted', { style: { marginBottom: '8px' } },
        `${money(g.compras.total)} em contas marcadas como compra de mercadoria. Esse dinheiro `
        + 'já entra no DRE pelo CMV, então não desce de novo pelas despesas — senão o mesmo '
        + 'custo seria descontado duas vezes.'),
      escada(g.compras.contas.map((c) => ({
        id: `compra-${c.nome}`, rotulo: c.nome, valor: c.valor,
        nota: `${c.itens} lançamento(s)`,
      })))),

    cardClassificar(planos, classificacao));
}

function seletorDeMes(mes) {
  const meses = [];
  for (let i = 0; i < 6; i += 1) meses.push(monthKey(addMonths(`${mes}-01`, -i)));
  return chips(meses.reverse().map((m) => ({ id: m, label: monthLabelShort(m) })), mes,
    (id) => navigate(href('/dre', { m: id })));
}

/**
 * A CLASSIFICAÇÃO É DELA, NÃO MINHA.
 *
 * O app sugere pelo nome da conta — "DAS" parece imposto, "frete" parece
 * despesa direta — mas sugestão fica escrita como sugestão, e só vira
 * classificação quando ela confirma. A diferença não é teimosia: "material para
 * reforma" pode ser manutenção da loja (indireta) ou obra nova (não
 * operacional), e só quem assina o cheque sabe qual é.
 */
function cardClassificar(planos, classificacao) {
  const trocar = async (nome, grupo) => {
    await store.salvarConfig({ dre: { classificacao: { [nome]: grupo || null } } });
    refresh();
  };

  const aceitarSugestoes = async () => {
    const novas = {};
    let quantas = 0;
    for (const pl of planos) {
      if (classificacao.has(pl.nome)) continue;
      const s = sugerirGrupo(pl.nome);
      if (s) { novas[pl.nome] = s; quantas += 1; }
    }
    if (!quantas) { ok('Nenhuma sugestão nova.'); return; }
    await store.salvarConfig({ dre: { classificacao: novas } });
    ok(`${quantas} conta(s) classificada(s). Confira: a sugestão é pelo nome.`);
    refresh();
  };

  /**
   * O RESTO NÃO É SUGESTÃO, É UM ATALHO QUE ELA LÊ ANTES DE APERTAR.
   *
   * Quase toda conta que sobra é estrutura — aluguel, encargo, energia. Mas
   * "sobrou" não é motivo para o app decidir: o botão diz exatamente quantas e
   * para onde vão, e quem aperta é ela. A diferença entre sugerir e chutar é
   * essa frase.
   */
  const sobrando = planos.filter((pl) => !classificacao.has(pl.nome) && !sugerirGrupo(pl.nome));
  const marcarResto = async () => {
    const novas = {};
    for (const pl of sobrando) novas[pl.nome] = 'indireta';
    await store.salvarConfig({ dre: { classificacao: novas } });
    ok(`${sobrando.length} conta(s) em despesas indiretas. Troque uma a uma se precisar.`);
    refresh();
  };

  const comSugestao = planos.filter((pl) => !classificacao.has(pl.nome) && sugerirGrupo(pl.nome));

  return h('div#classificar',
    card('Em que degrau entra cada conta',
      comSugestao.length > 0
        ? botao(`Aceitar ${comSugestao.length} sugestão(ões)`, { pequeno: true, onClick: aceitarSugestoes })
        : null,
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        'O app não adivinha para onde vai cada conta do seu plano. Escolha o degrau de cada uma '
        + 'e o DRE se monta sozinho daqui em diante — a escolha vale para todos os meses.'),
      sobrando.length > 0 && h('div', { style: { marginBottom: '10px' } },
        botao(`Marcar as ${sobrando.length} que sobraram como despesas indiretas`, {
          pequeno: true, onClick: marcarResto,
        })),
      h('div.empilha', { style: { gap: '2px' } },
        ...planos.map((pl) => linhaDoPlano(pl, classificacao, trocar))),
      h('div.empilha', { style: { gap: '4px', marginTop: '12px' } },
        ...GRUPOS.map((gr) => h('p.mini.muted', h('strong', `${gr.nome}: `), gr.ajuda)))));
}

function linhaDoPlano(pl, classificacao, trocar) {
  const atual = classificacao.get(pl.nome) || '';
  const sugestao = !atual ? sugerirGrupo(pl.nome) : null;
  const nomeSugerido = sugestao ? GRUPOS.find((gr) => gr.id === sugestao)?.nome : null;

  return h('label.linha.linha--entre', { style: { padding: '7px 0', gap: '10px' } },
    h('span.crescer', { style: { minWidth: 0 } },
      h('span.pequeno', pl.nome),
      h('span.mini.muted', { style: { display: 'block' } },
        money(pl.valor) + (nomeSugerido ? ` · sugestão: ${nomeSugerido}` : ''))),
    h('select.entrada', {
      style: { maxWidth: '46%' },
      value: atual,
      onChange: (e) => trocar(pl.nome, e.target.value),
    },
    h('option', { value: '' }, atual ? '— tirar —' : '— escolher —'),
    ...GRUPOS.map((gr) => h('option', { value: gr.id, selected: gr.id === atual }, gr.nome))));
}

function montarExportacao(g, mes) {
  const linhas = linhasDoDreGerencial(g).map((l) => ({
    conta: `${l.sinal === '−' ? '(−) ' : ''}${l.rotulo}`,
    valor: l.valor,
    percentual: l.percentual,
  }));
  const colunas = [
    { header: 'Conta', key: 'conta' },
    { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    { header: '% da líquida', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
  ];
  return {
    titulo: 'DRE gerencial',
    subtitulo: monthLabel(mes),
    periodo: `Receita líquida ${money(g.receitaLiquida)}`,
    nomeArquivo: `dre_gerencial_${mes}`,
    colunas,
    linhas,
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Receita líquida', valor: money(g.receitaLiquida) },
          { label: 'Lucro bruto', valor: g.lucroBruto == null ? '—' : money(g.lucroBruto) },
          { label: 'Margem de contribuição', valor: g.margemContribuicao == null ? '—' : money(g.margemContribuicao) },
          { label: 'EBITDA', valor: g.ebitda == null ? '—' : money(g.ebitda) },
          { label: 'Lucro líquido', valor: g.lucroLiquido == null ? '—' : money(g.lucroLiquido) },
        ],
      },
      { tipo: 'tabela', titulo: 'A conta, de cima para baixo', colunas, linhas },
      ...detalheDosDegraus(g),
    ],
  };
}

function detalheDosDegraus(g) {
  const blocos = [];
  const colunas = [
    { header: 'Conta do plano', key: 'nome' },
    { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    { header: 'Lançamentos', key: 'itens', tipo: 'int', alinhar: 'direita' },
  ];
  for (const [titulo, bloco] of [
    ['Deduções da receita', g.deducoes],
    ['Despesas diretas', g.despesasDiretas],
    ['Despesas indiretas', g.despesasIndiretas],
    ['Empréstimos e financiamentos', g.emprestimos],
    ['Itens não operacionais', g.naoOperacionais],
    ['Sem classificação', g.semClassificacao],
  ]) {
    if (!bloco.contas.length) continue;
    blocos.push({
      tipo: 'tabela', titulo, colunas, linhas: bloco.contas,
      total: { nome: 'TOTAL', valor: bloco.total },
    });
  }
  return blocos;
}
