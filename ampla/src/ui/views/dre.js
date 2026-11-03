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
import {
  dre, linhasDoDreGerencial, planosDeContas, sugerirGrupo,
  lerClassificacao, lerGrupos, gruposExistentes, degrauPorId, DEGRAUS,
} from '../../logic/dre.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, aviso, chips } from '../components/ui.js';
import { escada } from '../components/escada.js';
import { exportadores } from '../components/table.js';
import { formulario, detalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, pct, monthKey, monthLabel, monthLabelShort, addMonths, today } from '../../core/format.js';

export async function telaDre({ query }) {
  const mes = query.m || monthKey(today());
  const [d, planos, cfg] = await Promise.all([dre(mes), planosDeContas(), store.config()]);
  definirTitulo('DRE gerencial', monthLabel(mes));

  const g = d.gerencial;
  const classificacao = lerClassificacao(cfg);
  const grupos = lerGrupos(cfg);
  const disponiveis = gruposExistentes(cfg);
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
        nota: notaDoPercentual(g, g.percentuais.margemContribuicao),
      }),
      kpi({
        label: 'EBITDA', valor: g.ebitda == null ? '—' : money(g.ebitda),
        icone: '⚙️', cor: g.ebitda >= 0 ? 'ok' : 'ruim', tamanho: 'p',
        nota: notaDoPercentual(g, g.percentuais.ebitda),
      }),
      kpi({
        label: 'Lucro líquido', valor: g.lucroLiquido == null ? '—' : money(g.lucroLiquido),
        icone: g.lucroLiquido >= 0 ? '📈' : '📉',
        cor: g.lucroLiquido == null ? undefined : (g.lucroLiquido >= 0 ? 'ok' : 'ruim'),
        tamanho: 'p',
        nota: notaDoPercentual(g, g.percentuais.lucroLiquido),
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

    cardClassificar(planos, classificacao, grupos, disponiveis));
}

/**
 * O percentual, e a ressalva junto quando o custo não é conhecido em tudo. Um
 * travessão no lugar do número não protegia ninguém: escondia o resultado da
 * empresa na tela feita para mostrá-lo.
 */
function notaDoPercentual(g, valor) {
  if (valor == null) return null;
  const texto = pct(valor, 1);
  const c = g.cobertura;
  if (g.confiavel || !c || c.faturadoTotal == null) return texto;
  const falta = Math.round((c.faturadoTotal - c.faturadoComCusto) * 100) / 100;
  return falta > 0 ? `${texto} · ${money(falta)} sem custo` : texto;
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
function cardClassificar(planos, classificacao, grupos, disponiveis) {
  const trocarDegrau = async (nome, degrau) => {
    /* trocar de degrau com um grupo que não existe lá deixaria o grupo órfão */
    const grupoAtual = grupos.get(nome) || null;
    const cabe = degrau && (disponiveis.get(degrau) || []).includes(grupoAtual);
    await store.salvarConfig({
      dre: {
        classificacao: { [nome]: degrau || null },
        grupos: { [nome]: cabe ? grupoAtual : null },
      },
    });
    refresh();
  };

  const trocarGrupo = async (nome, grupo) => {
    await store.salvarConfig({ dre: { grupos: { [nome]: grupo || null } } });
    refresh();
  };

  const criarGrupo = async (pl, degrau) => {
    const r = await formulario({
      titulo: 'Criar um grupo',
      descricao: `Dentro de "${degrauPorId(degrau).nome}". O grupo é um nome seu — serve para o `
        + 'DRE abrir em partes que você reconhece, sem mudar a conta. Ele passa a ficar '
        + 'disponível para as outras contas deste mesmo degrau.',
      campos: [{
        chave: 'nome', label: 'Nome do grupo', tipo: 'texto', obrigatorio: true,
        ajuda: 'Por exemplo: Pessoal e encargos, Ocupação, Veículos.',
      }],
      confirmar: 'Criar e usar',
    });
    if (!r?.nome?.trim()) return;
    await trocarGrupo(pl.nome, r.nome.trim());
  };

  const aceitarSugestoes = async () => {
    const novas = {};
    let quantas = 0;
    for (const pl of planos) {
      if (classificacao.has(pl.nome)) continue;
      const sugerido = sugerirGrupo(pl.nome);
      if (sugerido) { novas[pl.nome] = sugerido; quantas += 1; }
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
   * para onde vão, e quem aperta é ela.
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
      botao('O que são os degraus?', { pequeno: true, onClick: explicarDegraus }),
      h('p.pequeno.muted', { style: { marginBottom: '4px' } },
        'Cada conta do seu plano tem duas perguntas. O DEGRAU diz onde o dinheiro entra na '
        + 'conta do DRE — são seis, fixos, porque são as linhas do próprio DRE. O GRUPO é um '
        + 'nome seu dentro do degrau ("Pessoal e encargos", "Ocupação"), e esse você cria '
        + 'quantos quiser: é nele que o DRE abre.'),
      h('p.mini.muted', { style: { marginBottom: '10px' } },
        'A escolha vale para todos os meses, e dá para trocar quando quiser.'),

      h('div.btn-linha', { style: { marginBottom: '10px' } },
        comSugestao.length > 0 && botao(`Aceitar ${comSugestao.length} sugestão(ões)`, {
          tipo: 'primario', pequeno: true, onClick: aceitarSugestoes,
        }),
        sobrando.length > 0 && botao(`As ${sobrando.length} que sobraram → despesas indiretas`, {
          pequeno: true, onClick: marcarResto,
        })),

      h('div.empilha', { style: { gap: '2px' } },
        ...planos.map((pl) => linhaDoPlano(pl, {
          classificacao, grupos, disponiveis, trocarDegrau, trocarGrupo, criarGrupo,
        })))));
}

const CRIAR = '__criar__';

function linhaDoPlano(pl, ctx) {
  const { classificacao, grupos, disponiveis, trocarDegrau, trocarGrupo, criarGrupo } = ctx;
  const degrau = classificacao.get(pl.nome) || '';
  const grupo = grupos.get(pl.nome) || '';
  const sugestao = !degrau ? sugerirGrupo(pl.nome) : null;
  const nomeSugerido = sugestao ? degrauPorId(sugestao)?.nome : null;
  const opcoesDeGrupo = degrau ? (disponiveis.get(degrau) || []) : [];

  return h('div.plano',
    h('div.linha.linha--entre', { style: { gap: '10px' } },
      h('span.pequeno.crescer', { style: { minWidth: 0 } }, pl.nome),
      h('span.num.mini.muted', money(pl.valor))),
    nomeSugerido && h('span.mini.muted', `sugestão pelo nome: ${nomeSugerido}`),
    h('div.plano__escolhas',
      h('select.entrada', {
        value: degrau,
        onChange: (e) => trocarDegrau(pl.nome, e.target.value),
      },
      h('option', { value: '' }, degrau ? '— tirar do DRE —' : '— escolher o degrau —'),
      ...DEGRAUS.map((gr) => h('option', {
        value: gr.id, selected: gr.id === degrau,
      }, `${gr.numero}. ${gr.nome}`))),

      h('select.entrada', {
        disabled: !degrau,
        value: grupo,
        onChange: (e) => (e.target.value === CRIAR
          ? criarGrupo(pl, degrau)
          : trocarGrupo(pl.nome, e.target.value)),
      },
      h('option', { value: '' }, degrau ? '— sem grupo —' : 'escolha o degrau primeiro'),
      ...opcoesDeGrupo.map((nome) => h('option', { value: nome, selected: nome === grupo }, nome)),
      degrau && h('option', { value: CRIAR }, '＋ criar um grupo…'))));
}

/**
 * "Quais são esses degraus que ele mesmo criou?"
 *
 * Nenhum: são as linhas do próprio DRE. Esta folha diz isso com todas as
 * letras, mostra onde cada degrau entra na conta e dá exemplos de conta que
 * cai em cada um — porque "despesa direta" e "despesa indireta" só são óbvias
 * para quem já montou um DRE antes.
 */
function explicarDegraus() {
  detalhe('Os seis degraus do DRE',
    h('p.pequeno',
      'O app não inventou nenhum degrau. Eles são as linhas do próprio DRE — as mesmas do '
      + 'relatório que você recebeu — e são fixos porque cada um é uma POSIÇÃO na conta: '
      + 'dedução entra antes da receita líquida, despesa direta entra antes da margem de '
      + 'contribuição, empréstimo entra depois do EBITDA.'),
    h('p.pequeno.muted',
      'Criar um degrau novo seria criar uma linha nova no meio da conta, e aí EBITDA e margem '
      + 'de contribuição passariam a significar outra coisa — deixariam de bater com o '
      + 'relatório do seu BPO. O que você cria à vontade são os GRUPOS dentro de cada degrau.'),
    h('div.empilha', { style: { gap: '12px' } },
      ...DEGRAUS.map((gr) => h('div.card.card--plano',
        h('div.linha', { style: { gap: '8px' } },
          h('span.selo.selo--info', String(gr.numero)),
          h('strong.pequeno', gr.nome)),
        h('p.mini.muted', { style: { marginTop: '4px' } }, gr.onde),
        h('p.mini', { style: { marginTop: '6px' } },
          h('strong', 'Costuma ser: '), gr.exemplos.join(', ') + '.'),
        h('p.mini.muted', { style: { marginTop: '4px' } },
          h('strong', 'Grupos prontos: '), gr.gruposSugeridos.join(' · '))))),
    h('p.mini.muted',
      'Conta que você não classificar não é chutada para nenhum degrau: ela desce numa linha '
      + 'própria, "Sem classificação", que aparece no DRE e desconta do lucro líquido.'));
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
