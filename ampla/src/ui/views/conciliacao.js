/**
 * CONCILIAÇÃO / CONTROLE DE QUALIDADE (item 14)
 * Só o que exige atenção. Resolveu, sai da frente.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import {
  TIPOS_PENDENCIA, recalcular, definirVendedorDaNf, definirVendedorDoPedido, vendasSemVendedor,
  juntarVendedores, juntarTodosOsPares, vendedoresParecidos, cancelarNota,
  familiasDeNomes, juntarNomes, vendedoresSemMovimento, removerVendedores,
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
  const [pendencias, vendedores, nfs, titulos, pagamentos, familias] = await Promise.all([
    store.pendencias.listar(), store.vendedores.listar(), store.nfs.listar(),
    store.receber.listar(), store.pagar.listar(), familiasDeNomes(),
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

    /**
     * O ATALHO QUE RESOLVE CENTENAS DE UMA VEZ.
     *
     * "São 341 pendências. Eu não consigo olhar uma por uma."
     *
     * Quando quase toda a lista é a mesma pessoa escrita de jeitos diferentes,
     * o trabalho não é por nota — é por pessoa. Então o caminho aparece ANTES
     * da lista, dizendo quantas notas estão em jogo, em vez de esperar que ela
     * role até o fim para descobrir que havia um botão.
     */
    familias.length > 0 && h('button.aviso.aviso--atencao', {
      style: { width: '100%' }, onClick: () => navigate('/conciliacao/nomes'),
    },
    h('div.crescer', { style: { textAlign: 'left' } },
      h('strong', `${familias.reduce((a, f) => a + f.membros.length, 0)} nomes podem ser `
        + `${familias.length} pessoa(s)`),
      h('div.mini', `${familias.reduce((a, f) => a + f.notasEmJogo, 0)} nota(s) presas em `
        + 'variações de grafia. Junte os nomes e boa parte desta lista some de uma vez.')),
    h('span', '›')),

    h('div.btn-linha',
      botao('🔄 Refazer os vínculos', { onClick: () => refazer() }),
      botao('👥 Juntar nomes', { onClick: () => navigate('/conciliacao/nomes') }),
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

  /**
   * Quando há VÁRIOS pares de cadastro duplicado, resolver um por um é quatro
   * vezes a mesma pergunta. O botão diz exatamente quais pares vai juntar, e o
   * nome que fica é sempre o CURTO — é o que ela usa e o que já carrega o
   * faturamento. Continua sendo escolha dela: nada acontece sem o toque.
   */
  /* o card de pares some quando a tela nova já cobre o caso: dois caminhos
     para a mesma decisão acabam discordando */
  const pares = familias.length ? [] : vendedoresParecidos(vendedores);

  return h('div.empilha', { style: { gap: '14px' } },
    cabecalho,

    pares.length > 1 && card(`${pares.length} cadastros parecem ser a mesma pessoa`,
      botao('Juntar todos', { tipo: 'primario', pequeno: true, onClick: () => juntarTodos(pares) }),
      h('p.mini.muted', 'Juntando, o nome CURTO fica e o completo vira apelido — é o nome curto que '
        + 'já carrega o faturamento e que sai no relatório de comissão.'),
      h('div.empilha', { style: { gap: '4px', marginTop: '8px' } },
        ...pares.map((p) => h('p.mini', `${p.curto.nome} ← ${p.longo.nome}`)))),

    /**
     * A primeira importação pergunta por todo mundo. Confirmar um por um seria
     * seis toques dizendo a mesma coisa — então existe o botão que confirma
     * todos, e quem não for vendedor ela marca depois, pelo nome.
     */
    (() => {
      const aConfirmar = abertas.filter((p) => p.tipo === 'vendedor_a_confirmar');
      if (aConfirmar.length < 2) return null;
      return card(`${aConfirmar.length} nomes apareceram como vendedor`,
        botao('São todos vendedores', {
          tipo: 'primario', pequeno: true, onClick: () => confirmarTodosVendedores(aConfirmar),
        }),
        h('p.mini.muted', 'Quem emite nota nem sempre é quem vendeu. Confirme os que vendem de uma '
          + 'vez e marque "não vende" só em quem não for — as notas dessa pessoa passam a vir para '
          + 'cá, uma a uma, para você dizer de quem era.'),
        h('div.empilha', { style: { gap: '4px', marginTop: '8px' } },
          ...aConfirmar.map((p) => h('p.mini', p.titulo))));
    })(),

    /**
     * O MESMO ATALHO DOS VENDEDORES, para as entregas com o custo em branco.
     * Ela disse que em branco quase sempre quer dizer que não houve custo — o
     * cliente retirou. Então a resposta mais comum vira um toque só.
     */
    (() => {
      const semValor = abertas.filter((p) => p.tipo === 'frete_sem_valor');
      if (semValor.length < 2) return null;
      return card(`${semValor.length} entregas sem custo informado`,
        botao('Nenhuma teve custo', {
          tipo: 'primario', pequeno: true, onClick: () => nenhumaTeveCusto(semValor),
        }),
        h('p.mini.muted', 'A planilha veio com o campo em branco nessas entregas. Em branco não é '
          + 'zero — mas quando não houve custo mesmo (o cliente retirou, foi carro nosso sem '
          + 'extra), isto resolve todas de uma vez. Se alguma teve custo, informe ela antes, uma '
          + 'a uma.'));
    })(),

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
    /**
     * UM BOTÃO. "Eu clico no vendedor correto e acabou."
     *
     * Nada de "mandar relatório", nada de "ver NF", nada de conferir. A única
     * coisa que ela quer fazer aqui é dizer de quem foi a venda.
     */
    botoes.push(botao('Escolher vendedor', { tipo: 'primario', pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
  } else if (p.tipo === 'nf_sem_pedido') {
    botoes.push(botao('Definir vendedor', { pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
    botoes.push(botao('Ver NF', { pequeno: true, onClick: () => verNf(p, contexto) }));
  } else if (p.tipo === 'vendedor_duplicado') {
    // juntar é decisão dela: o app mostra a evidência e os dois botões
    botoes.push(botao('É a mesma pessoa', { tipo: 'primario', pequeno: true, onClick: () => juntar(p) }));
    botoes.push(botao('São pessoas diferentes', { pequeno: true, onClick: () => ignorar(p, 'São pessoas diferentes') }));
  } else if (p.tipo === 'devolucao_sem_origem') {
    // o que resolve é dizer de QUEM abater: a venda original não está na base
    botoes.push(botao('De quem era a venda', { tipo: 'primario', pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
    botoes.push(botao('Ver NF', { pequeno: true, onClick: () => verNf(p, contexto) }));
  } else if (p.tipo === 'vendedor_a_confirmar') {
    botoes.push(botao('É vendedor(a)', { tipo: 'primario', pequeno: true, onClick: () => confirmarVendedor(p, true) }));
    botoes.push(botao('Não vende', { pequeno: true, onClick: () => confirmarVendedor(p, false) }));
  } else if (p.tipo === 'frete_sem_valor') {
    botoes.push(botao('Não teve custo', { tipo: 'primario', pequeno: true, onClick: () => custoDaEntrega(p, 0) }));
    botoes.push(botao('Informar valor', { pequeno: true, onClick: () => custoDaEntrega(p) }));
  } else if (p.tipo === 'nf_vendedor_nao_vende') {
    botoes.push(botao('De quem era a venda', { tipo: 'primario', pequeno: true, onClick: () => resolverVendedor(p, contexto) }));
    // a volta atrás mora aqui: marcar "não vende" por engano não pode ser sem saída
    botoes.push(botao('Na verdade vende', { pequeno: true, onClick: () => voltarAVender(p, contexto) }));
    botoes.push(botao('Ver NF', { pequeno: true, onClick: () => verNf(p, contexto) }));
  } else if (p.tipo === 'pedido_sem_vendedor') {
    botoes.push(botao('Mandar comissão por venda', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/comissoes') }));
    botoes.push(botao('Definir à mão', { pequeno: true, onClick: () => navigate('/conciliacao/vendedores') }));
  } else if (p.tipo === 'extrato_sem_vinculo') {
    botoes.push(botao('Vincular', { tipo: 'primario', pequeno: true, onClick: () => vincularMovimento(p, contexto) }));
  } else if (p.tipo === 'receber_sem_nf') {
    botoes.push(botao('Vincular à NF', { tipo: 'primario', pequeno: true, onClick: () => vincularNfDoTitulo(p, contexto) }));
  } else if (p.tipo === 'divergencia_faturamento') {
    botoes.push(botao('Ver o que falta', { tipo: 'primario', pequeno: true, onClick: () => navigate(href('/conciliacao', { t: 'pedido_sem_vendedor' })) }));
  } else if (p.tipo === 'produto_sem_custo') {
    botoes.push(botao('Importar custos', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/produtos') }));
  } else if (p.tipo === 'item_sem_nf') {
    botoes.push(botao('Importar NFs', { tipo: 'primario', pequeno: true, onClick: () => navigate('/arquivos/nfs') }));
  } else if (p.tipo === 'nf_repetida') {
    /**
     * UM BOTÃO POR NOTA, com o número e o cliente escritos nele. A pergunta é
     * "qual delas morreu?" e a resposta só pode vir dela — o arquivo diz
     * "autorizada" nas duas.
     */
    for (const n of p.notas || []) {
      botoes.push(botao(`NF ${n.numero} foi cancelada`, {
        pequeno: true,
        onClick: () => marcarCancelada(p, n),
      }));
    }
  } else if (p.tipo === 'pagar_sem_categoria') {
    botoes.push(botao('Ver o caixa', { tipo: 'primario', pequeno: true, onClick: () => navigate('/fluxo') }));
  } else if (p.tipo === 'pago_sem_banco') {
    botoes.push(botao('Ver o caixa', { tipo: 'primario', pequeno: true, onClick: () => navigate('/fluxo') }));
  }

  if (p.status === 'ignorada') {
    botoes.push(botao('Reabrir', { pequeno: true, onClick: () => reabrir(p) }));
  } else {
    /**
     * IGNORAR EM UM TOQUE.
     *
     * "Quando se clica em ignorar seria interessante ter uma forma mais rápida,
     *  em vez de ter que escrever o motivo. Poderia ser algo como 'a nota está
     *  correta', e aí seria um botão escrito isso que só clicando já faria a
     *  ação acontecer."
     *
     * Ignorar quase sempre quer dizer a mesma coisa: o app está certo, isto não
     * é problema. Então o motivo mais comum é um botão, e digitar virou a
     * exceção — mas continua existindo, porque o registro de POR QUE alguém
     * ignorou é o que permite rever depois.
     */
    botoes.push(botao(`✓ ${motivoRapido(p.tipo)}`, {
      tipo: 'ok', pequeno: true, onClick: () => ignorar(p, motivoRapido(p.tipo)),
    }));
    /**
     * O SEGUNDO MOTIVO DE UM TOQUE.
     *
     * "Todas as que foram para ignoradas são as notas que foram canceladas."
     *
     * Nota cancelada é um motivo concreto e frequente — e é diferente de "não
     * está na base". Guardar qual dos dois foi é o que permite rever depois: um
     * se resolve mandando o XML, o outro não se resolve, acabou.
     */
    for (const extra of MOTIVOS_EXTRA[p.tipo] || []) {
      botoes.push(botao(`✓ ${extra}`, {
        tipo: 'ok',
        pequeno: true,
        /**
         * "A NF foi cancelada" não pode ser só um motivo para sumir da lista.
         *
         * "Todas as que foram para ignoradas são as notas que foram canceladas."
         *
         * Antes, dizer isso escondia a pendência e deixava a nota faturando: ela
         * continuava no total do mês, na margem e na comissão. Agora a frase faz
         * o que diz — a nota é marcada como cancelada e sai de todas as telas.
         */
        onClick: () => (extra === CANCELOU_A_NOTA && p.alvo?.store === 'nfs'
          ? cancelarPelaPendencia(p, extra)
          : ignorar(p, extra)),
      }));
    }
    botoes.push(botao('Outro motivo…', { pequeno: true, onClick: () => ignorar(p) }));
  }
  return botoes;
}

/**
 * O motivo de um toque, escrito na língua de cada pendência: "está correta" não
 * quer dizer a mesma coisa numa nota e num movimento de banco.
 */
/** Motivos de um toque que valem só para alguns tipos, ao lado do principal. */
const CANCELOU_A_NOTA = 'A NF foi cancelada';

const MOTIVOS_EXTRA = {
  nf_sem_vendedor: [CANCELOU_A_NOTA],
  nf_sem_pedido: [CANCELOU_A_NOTA],
  devolucao_sem_origem: [CANCELOU_A_NOTA],
};

const MOTIVO_RAPIDO = {
  nf_repetida: 'São duas vendas diferentes',
  nf_sem_vendedor: 'Deixar sem vendedor',
  nf_sem_pedido: 'A nota está correta',
  nf_vendedor_nao_vende: 'Pode deixar como está',
  frete_sem_valor: 'Depois eu vejo',
  vendedor_a_confirmar: 'Depois eu digo',
  devolucao_sem_origem: 'A devolução está correta',
  pedido_sem_vendedor: 'O pedido está correto',
  /**
   * "Eu pus 'o título está correto' e ele vai para as ignoradas, mas continua
   *  sem nota fiscal identificada. Eu preciso vincular, não ignorar."
   *
   * O motivo de um toque dizia a coisa errada: o título estar correto não
   * resolve o vínculo. O único motivo legítimo de deixar de lado é a nota não
   * estar na base — e é isso que o botão diz agora.
   */
  receber_sem_nf: 'A NF não está na base',
  extrato_sem_vinculo: 'O movimento está correto',
  pago_sem_banco: 'A baixa está correta',
  divergencia_faturamento: 'A diferença está explicada',
  vendedor_duplicado: 'São pessoas diferentes',
  item_sem_nf: 'Está correto',
  produto_sem_custo: 'Está correto',
  pagar_sem_categoria: 'Está correto',
};

function motivoRapido(tipo) {
  return MOTIVO_RAPIDO[tipo] || 'Está correto';
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

/**
 * É VENDEDOR OU SÓ EMITE NOTA? Um toque, aqui mesmo.
 *
 * "Não precisa ir em ajustes, vendedores, editar o papel. A gente já pode ir
 *  para a segunda etapa: toda nota que sair no nome da Marina Alves vira
 *  pendência. Aí eu vou lá e ajusto."
 *
 * Dizer "não vende" não mexe em nota nenhuma: ele só liga a pendência, e cada
 * nota continua sendo resolvida uma a uma, por ela.
 */
async function confirmarVendedor(p, vende) {
  const v = await store.vendedores.obter(p.alvo?.id);
  if (!v) { erro('Vendedor não encontrado.'); return; }
  await store.vendedores.salvar({ ...v, confirmado: true, naoVende: !vende });
  await recalcular();
  await atualizarAlertas();
  ok(vende ? `${v.nome}: vendedor(a) confirmado(a).`
    : `${v.nome}: as notas no nome dessa pessoa vão aparecer aqui para você vincular.`);
  refresh();
}

/** Desfaz o "não vende": a pessoa volta a ser vendedora e as pendências somem. */
async function voltarAVender(p, { nfs }) {
  const nf = nfs.find((n) => n.id === p.alvo?.id);
  const v = nf?.vendedorId ? await store.vendedores.obter(nf.vendedorId) : null;
  if (!v) { erro('Vendedor não encontrado.'); return; }
  await store.vendedores.salvar({ ...v, confirmado: true, naoVende: false });
  await recalcular();
  await atualizarAlertas();
  ok(`${v.nome} voltou a ser vendedor(a).`);
  refresh();
}

/**
 * Confirmar vários de uma vez, porque a primeira importação pergunta por todo
 * mundo e responder seis vezes a mesma coisa é trabalho à toa.
 */
async function confirmarTodosVendedores(pendentes) {
  for (const p of pendentes) {
    const v = await store.vendedores.obter(p.alvo?.id);
    if (v) await store.vendedores.salvar({ ...v, confirmado: true, naoVende: false });
  }
  await recalcular();
  await atualizarAlertas();
  ok(`${pendentes.length} vendedor(es) confirmado(s).`);
  refresh();
}

/**
 * O CUSTO DA ENTREGA, EM UM TOQUE OU DIGITADO.
 *
 * "Essas em branco realmente não tivemos custo com ela. Eu vinculo e ponho zero.
 *  Coloca um botão para fazer isso."
 *
 * Zero informado por ela é um dado; branco deixado pelo arquivo não é. Por isso
 * o registro guarda que o valor veio daqui, e não da planilha — reimportar a
 * planilha não apaga o que ela decidiu.
 */
async function custoDaEntrega(p, valorPronto) {
  const frete = await store.fretes.obter(p.alvo?.id);
  if (!frete) { erro('Entrega não encontrada.'); return; }

  let valor = valorPronto;
  if (valor == null) {
    const r = await formulario({
      titulo: 'Custo desta entrega',
      descricao: [frete.descricao, frete.responsavel, frete.vendedorNome].filter(Boolean).join(' · '),
      campos: [{ chave: 'valor', label: 'Quanto custou', tipo: 'dinheiro', obrigatorio: true, valor: '' }],
      confirmar: 'Salvar',
    });
    if (!r) return;
    valor = Number(r.valor);
  }
  await store.fretes.salvar({ ...frete, valor, valorOrigem: 'manual' });
  /**
   * SEM ESTE recalcular() O BOTÃO NÃO FAZIA NADA VISÍVEL.
   *
   * "A gente clicava em 'não teve custo' e não acontecia nenhuma ação de fato."
   *
   * E não acontecia mesmo: o valor era gravado, mas quem apaga a pendência é o
   * recalcular — ela fica no banco até alguém refazer a conta. Salvar sem
   * recalcular é meio trabalho, e meio trabalho aqui parece trabalho nenhum.
   */
  await recalcular();
  await atualizarAlertas();
  ok(valor ? 'Custo informado.' : 'Entrega sem custo — registrado.');
  refresh();
}

/**
 * As 22 de uma vez. Vinte e dois toques dizendo a mesma coisa é trabalho à toa —
 * e cada um deles refazendo a conta inteira é espera à toa. Aqui é um toque e um
 * recálculo só.
 */
async function nenhumaTeveCusto(pendentes) {
  const linhas = [];
  for (const p of pendentes) {
    const frete = await store.fretes.obter(p.alvo?.id);
    if (frete) linhas.push({ ...frete, valor: 0, valorOrigem: 'manual' });
  }
  if (!linhas.length) { erro('Nenhuma entrega encontrada.'); return; }
  await store.fretes.salvarMuitos(linhas);
  await recalcular();
  await atualizarAlertas();
  ok(`${linhas.length} entregas marcadas sem custo.`);
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

/**
 * VINCULAR, NÃO IGNORAR.
 *
 * "Eu pus 'o título está correto' e ele vai para as ignoradas. Aí continua com o
 *  título sem nota fiscal identificada. Eu vou em 'escolher nota' e só aparece
 *  uma outra, nada a ver. Eu preciso vincular, não ignorar."
 *
 * Duas coisas estavam erradas aqui. A lista de candidatas não trazia na frente a
 * nota que o PRÓPRIO TÍTULO CITA — ela se perdia no meio de sessenta notas do
 * mesmo cliente. E não havia como simplesmente DIGITAR o número, que é o que
 * alguém faz quando já sabe qual é.
 *
 * Agora: a nota citada vem primeiro e marcada, dá para digitar o número, e o
 * resto vem ordenado por quem tem mais chance — mesmo valor, depois o cliente.
 */
async function vincularNfDoTitulo(p, { nfs }) {
  const titulo = (await store.receber.listar()).find((t) => t.id === p.alvo?.id);
  if (!titulo) { erro('Título não encontrado.'); return; }

  const soDigitos = (x) => String(x ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const citado = soDigitos(titulo.nfNumero);
  const mesmoNumero = (n) => !!citado && soDigitos(n.numero) === citado;
  const mesmoValor = (n) => titulo.valor != null && n.valorTotal != null
    && Math.abs(n.valorTotal - titulo.valor) < 0.01;

  /**
   * O NÚMERO DO PEDIDO está nos dois lados: o título se chama "Venda de nº 871"
   * e o XML traz <xPed>871</xPed>. Quando a nota citada não está na base, é esta
   * que quase sempre é a certa — então ela vem logo atrás.
   */
  const pedido = soDigitos(titulo.pedidoNumero);
  const mesmoPedido = (n) => !!pedido && soDigitos(n.pedidoNumero) === pedido;

  const peso = (n) => (mesmoNumero(n) ? 0 : mesmoPedido(n) ? 1 : mesmoValor(n) ? 2
    : n.clienteId === titulo.clienteId ? 3 : 4);
  const candidatas = nfs
    .filter((n) => mesmoNumero(n) || mesmoPedido(n) || mesmoValor(n) || n.clienteId === titulo.clienteId)
    .sort((a, b) => peso(a) - peso(b) || String(b.dataEmissao).localeCompare(String(a.dataEmissao)))
    .slice(0, 80);

  const rotulo = (n) => [
    `NF ${n.numero}`,
    formatDate(n.dataEmissao),
    money(n.valorTotal),
    (n.clienteNome || '').slice(0, 24),
    mesmoNumero(n) ? '\u2190 a que o título cita'
      : mesmoPedido(n) ? `\u2190 mesmo pedido (${titulo.pedidoNumero})`
        : mesmoValor(n) ? '\u2190 mesmo valor' : '',
  ].filter(Boolean).join(' \u00b7 ');

  /**
   * UM CAMPO SÓ, E O ESTADO DITO EM PALAVRAS.
   *
   * "A primeira nota tá certa, que é a que você mesmo tá vinculando. Só que aí
   *  aparece 'ou escolha na lista'. Aí, se eu apertar vincular, não sei qual das
   *  duas que vai. Não entendi nada."
   *
   * Eu tinha posto dois controles para uma decisão só — um campo de número e uma
   * lista — e nada dizia qual ganhava. Agora é UMA lista, a nota citada já vem
   * escolhida quando existe, e a linha de cima diz, em palavras, se ela existe ou
   * não. Quem lê não precisa adivinhar regra nenhuma.
   */
  const citadas = citado ? nfs.filter(mesmoNumero) : [];
  const situacao = !titulo.nfNumero
    ? 'Este título não cita número de nota.'
    : citadas.length === 1
      ? `✅ A NF ${titulo.nfNumero} está na base e já vem escolhida abaixo.`
      : citadas.length > 1
        ? `⚠️ Existe mais de uma NF ${titulo.nfNumero} na base. Escolha qual é.`
        : `⚠️ A NF ${titulo.nfNumero} NÃO está na base. Importe o XML dela — ou escolha abaixo `
          + 'a nota certa, se o número do relatório estiver errado.'
          + (candidatas.some(mesmoPedido)
            ? ` A primeira da lista é a nota do mesmo pedido (${titulo.pedidoNumero}).` : '');

  if (!candidatas.length) {
    erro(`A NF ${titulo.nfNumero || ''} não está na base e não há nota parecida para escolher. `
      + 'Importe o XML dessa nota.');
    return;
  }

  const r = await formulario({
    titulo: `Título ${titulo.documento || ''} — vincular à NF`,
    descricao: [
      [titulo.clienteNome, money(titulo.valor), `vence ${formatDate(titulo.vencimento)}`]
        .filter(Boolean).join(' \u00b7 '),
      situacao,
    ].join('\n'),
    campos: [
      {
        chave: 'nfId',
        label: citadas.length === 1 ? 'Nota fiscal' : 'Escolha a nota fiscal',
        tipo: 'select',
        opcoes: candidatas.map((n) => ({ valor: n.id, label: rotulo(n) })),
      },
      { chave: 'motivo', label: 'Motivo', tipo: 'texto', obrigatorio: true, valor: 'conferido no relatório' },
    ],
    confirmar: 'Vincular',
  });
  if (!r) return;

  const nf = candidatas.find((n) => n.id === r.nfId);
  if (!nf) { erro('Escolha uma nota.'); return; }

  await store.receber.salvar({
    ...titulo, nfId: nf.id, nfNumero: nf.numero, vendedorId: nf.vendedorId || titulo.vendedorId,
  });
  await store.registrar('titulo_nf', { alvoId: titulo.id, alvo: titulo.documento, para: `NF ${nf.numero}`, motivo: r.motivo });
  await recalcular();
  await atualizarAlertas();
  ok(`Título vinculado à NF ${nf.numero}.`);
  refresh();
}

/**
 * Junta dois cadastros de vendedor. O nome que FICA é o que ela escolhe — e é
 * uma escolha de verdade, porque é o nome que vai sair no relatório de comissão
 * que ela manda para o pai.
 */
/** Junta todos os pares de uma vez, com uma confirmação só. */
async function juntarTodos(pares) {
  const r = await formulario({
    titulo: `Juntar ${pares.length} pares?`,
    descricao: `${pares.map((p) => `${p.curto.nome} ← ${p.longo.nome}`).join('\n')}\n\n`
      + 'O nome curto fica, o completo vira apelido, e tudo que estava no completo passa para ele.',
    campos: [],
    confirmar: 'Juntar todos',
  });
  if (!r) return;
  const feitos = await juntarTodosOsPares('confirmado: são as mesmas pessoas');
  await atualizarAlertas();
  ok(`${feitos.length} cadastro(s) juntado(s).`);
  refresh();
}

async function juntar(p) {
  const vendedores = await store.vendedores.listar();
  const curto = vendedores.find((v) => v.id === p.vendedorCurtoId);
  const longo = vendedores.find((v) => v.id === p.vendedorLongoId);
  if (!curto || !longo) { erro('Um dos cadastros já não existe.'); refresh(); return; }

  const r = await formulario({
    titulo: 'Qual nome fica?',
    descricao: `O outro vira apelido, e tudo que estava nele passa para o que ficar. `
      + 'É este nome que vai sair nos relatórios.',
    campos: [{
      chave: 'fica',
      label: 'Nome que fica',
      tipo: 'opcoes',
      valor: curto.id,
      opcoes: [{ valor: curto.id, label: curto.nome }, { valor: longo.id, label: longo.nome }],
    }],
    confirmar: 'Juntar',
  });
  if (!r) return;
  const saiId = r.fica === curto.id ? longo.id : curto.id;
  const { nfs, pedidos } = await juntarVendedores(r.fica, saiId, 'confirmado na conciliação');
  await atualizarAlertas();
  ok(`Juntados — ${nfs} nota(s) e ${pedidos} pedido(s) passaram para o cadastro que ficou.`);
  refresh();
}

async function ignorar(p, motivoPronto) {
  let motivo = motivoPronto;
  if (!motivo) {
    const r = await formulario({
      titulo: 'Ignorar esta pendência',
      descricao: 'Ela some da lista, mas continua registrada — e volta se o motivo deixar de existir.',
      campos: [{ chave: 'motivo', label: 'Por quê?', tipo: 'texto', obrigatorio: true }],
      confirmar: 'Ignorar',
    });
    if (!r) return;
    motivo = r.motivo;
  }
  await store.pendencias.salvar({ ...p, status: 'ignorada', motivoIgnorada: motivo, ignoradaEm: Date.now() });
  await store.registrar('pendencia_ignorada', { alvoId: p.id, alvo: p.titulo, motivo });
  await atualizarAlertas();
  ok(`Pendência ignorada — ${motivo.toLowerCase()}.`);
  refresh();
}

/**
 * Marcar a nota como cancelada é mexer no faturamento de um mês inteiro, então
 * a tela mostra antes exatamente o que vai sair e de onde.
 */
async function marcarCancelada(p, nota) {
  const r = await formulario({
    titulo: `Cancelar a NF ${nota.numero}?`,
    descricao: `${nota.clienteNome || 'cliente não identificado'} · ${money(nota.valor)}\n\n`
      + 'Ela sai do faturamento, da margem, do DRE e da comissão do vendedor — em todas as '
      + 'telas, a partir de agora. A marca fica gravada e sobrevive quando você reenviar o '
      + 'relatório de notas.\n\n'
      + 'Se for engano, dá para voltar atrás: a nota reaparece aqui como cancelada por você.',
    campos: [{
      chave: 'motivo',
      label: 'Por quê? (opcional)',
      tipo: 'texto',
      valor: 'Cancelada e reemitida',
    }],
    confirmar: 'Sim, foi cancelada',
  });
  if (!r) return;
  try {
    await cancelarNota(nota.id, r.motivo || 'Cancelada e reemitida');
    await atualizarAlertas();
    ok(`NF ${nota.numero} marcada como cancelada.`);
    refresh();
  } catch (e) {
    erro(e.message || 'Não deu para cancelar.');
  }
}

/** Dizer "foi cancelada" numa pendência de nota cancela a nota de verdade. */
async function cancelarPelaPendencia(p, motivo) {
  try {
    await cancelarNota(p.alvo.id, motivo);
    await atualizarAlertas();
    ok('Nota marcada como cancelada — ela sai do faturamento e da comissão.');
    refresh();
  } catch (e) {
    erro(e.message || 'Não deu para cancelar.');
  }
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
 * Quando dá, a unidade de trabalho é o PEDIDO: você define uma vez e todas as
 * notas daquele pedido herdam, inclusive as que forem emitidas depois. Quando a
 * nota não chegou a pedido nenhum — as duas pontes falharam — ela entra na mesma
 * lista e recebe vendedor direto. Um toque no nome resolve e a linha sai da
 * frente.
 */
export async function telaVendedores({ query }) {
  const janela = Number(query.j || suggest.JANELA_PADRAO);
  const [pedidos, lista, vendedores, faltando] = await Promise.all([
    vendasSemVendedor(),
    suggest.sugestoes({ janelaDias: janela }),
    store.vendedores.listar(),
    suggest.pedidosFaltando(),
  ]);
  const quantosPedidos = pedidos.filter((x) => x.tipo === 'pedido').length;
  const quantasNotas = pedidos.length - quantosPedidos;
  definirTitulo('De quem foi esta venda?',
    `${quantosPedidos} pedido(s) · ${quantasNotas} nota(s)`);

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
          label: 'Vendas sem dono', valor: String(pedidos.length), icone: '🧾', cor: 'atencao',
        }),
        kpi({ label: 'Valor parado', valor: money(totalPedidos), icone: '💰' })),

      aviso('O jeito certo é mandar o RELATÓRIO DE COMISSÃO POR VENDA: ele traz o vendedor '
        + 'de todas de uma vez. Marcar aqui é para o que sobrar depois dele.', 'atencao'),

      botao('📤 Mandar comissão por venda', {
        tipo: 'primario', bloco: true, onClick: () => navigate('/arquivos/comissoes'),
      }),

      h('div.lista', ...pedidos.slice(0, 50).map((p) => linhaVenda(p, vendedores))),
      pedidos.length > 50 && h('p.pequeno.muted.centro',
        `Mostrando os 50 maiores de ${pedidos.length}. Resolva estes e os próximos aparecem.`)),

    lista.length > 0 && h('div.empilha', { style: { gap: '10px' } },
      h('h2', { style: { marginTop: '6px' } }, `${lista.length} NF(s) que não chegaram a um pedido`),
      aviso('Estas notas não acharam o pedido delas. Toda nota vem de um pedido — quem liga os '
        + 'dois é o CONTAS A RECEBER, que traz a nota e o número do pedido na mesma linha. Se o '
        + 'seu export sai só com os títulos EM ABERTO, ele deixa de fora justamente a venda já '
        + 'recebida, que é a que ligaria a nota deste mês ao pedido. Mande uma vez um contas a '
        + 'receber do mês SEM o filtro de situação e estas se resolvem sozinhas.', 'atencao'),

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
function linhaVenda(item, vendedores) {
  const marcar = async (v) => {
    const motivo = 'definido na tela de vendedores';
    if (item.tipo === 'pedido') await definirVendedorDoPedido(item.pedido.id, v.id, motivo);
    else await definirVendedorDaNf(item.nf.id, v.id, motivo);
    await atualizarAlertas();
    ok(`${item.titulo} é de ${v.nome}.`);
    refresh();
  };

  return h('div.card',
    h('div.linha.linha--entre', { style: { alignItems: 'flex-start' } },
      h('div.crescer',
        h('strong', item.titulo),
        h('div.mini.muted', { style: { marginTop: '2px' } }, item.cliente),
        h('div.mini.muted', item.data ? formatDate(item.data) : 'sem data'),
        h('div.mini.muted', { style: { marginTop: '2px' } }, item.explicacao)),
      h('div.empilha', { style: { alignItems: 'flex-end' } },
        h('span.num.forte', money(item.valor)),
        h('span.mini.muted', item.nota))),

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

/* ------------------------------------------------- um nome, um vendedor */

/**
 * A TELA QUE RESOLVE TREZENTAS E QUARENTA E UMA DE UMA VEZ.
 *
 * "Eu não consigo linkar 341 coisas olhando uma por uma. Quero que ele linke
 *  todas as variações do Antonio Bento, e do Rodrigo."
 *
 * A unidade de trabalho aqui não é a nota: é a PESSOA. O app agrupa os
 * cadastros que dividem um pedaço de nome, mostra quantas notas e quanto
 * dinheiro cada um carrega, e ela confirma a família inteira num toque.
 *
 * O que ele marca sozinho é só o que é quase certo — o nome inteiro de um
 * dentro do outro ("ANTONIO BENTO" dentro de "ANTONIO BENTO 8"). O que divide
 * apenas um pedaço ("PAULO BENTO" e "ANTONIO BENTO" dividem o BENTO) vem
 * desmarcado, com o pedaço repetido escrito do lado. Marcar por semelhança
 * continua proibido; sugerir e deixar ela olhar, não.
 */
export async function telaNomes() {
  const [familias, vazios] = await Promise.all([familiasDeNomes(), vendedoresSemMovimento()]);
  definirTitulo('Um nome, um vendedor',
    familias.length ? `${familias.length} pessoa(s) com nome repetido` : 'nada repetido');

  if (!familias.length && vazios.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      cardSemMovimento(vazios),
      botao('Voltar', { bloco: true, onClick: () => navigate('/conciliacao') }));
  }

  if (!familias.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      h('div.tudo-ok',
        h('div.tudo-ok__icone', '✅'),
        h('h3', 'Nenhum nome repetido'),
        h('p.pequeno.muted',
          'Todo vendedor cadastrado tem um nome só. Quando um arquivo novo trouxer uma '
          + 'variação de grafia, ela aparece aqui para você juntar.')),
      botao('Voltar', { bloco: true, onClick: () => navigate('/conciliacao') }));
  }

  const notas = familias.reduce((a, f) => a + f.notasEmJogo, 0);
  const valor = cents(sum(familias, (f) => f.valorEmJogo));

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--2',
      kpi({
        label: 'Nomes para juntar',
        valor: String(familias.reduce((a, f) => a + f.membros.length, 0)),
        icone: '👥', cor: 'atencao', nota: `em ${familias.length} pessoa(s)`,
      }),
      kpi({ label: 'Notas em jogo', valor: String(notas), icone: '🧾', nota: money(valor) })),

    aviso('Cada arquivo escreve o nome do vendedor do seu jeito, e o app trata o nome como '
      + 'dado: nome novo, cadastro novo. É o certo — ligar por semelhança seria inventar '
      + 'vínculo. Mas aqui você diz, de uma vez, quais grafias são a mesma pessoa. O que você '
      + 'confirmar fica guardado como apelido: o próximo arquivo com aquela grafia já cai no '
      + 'lugar certo sozinho.', 'info'),

    ...familias.map((f) => cardFamilia(f)),

    vazios.length > 0 && cardSemMovimento(vazios));
}

/**
 * OS CADASTROS QUE NÃO TÊM NADA ATRÁS.
 *
 * "Tem um vendedor de um real, vendedor sei lá Amazonas, e nenhum daquilo é
 *  venda."
 *
 * Eram nomes fabricados pelo leitor de PDF, que colava a coluna do vendedor na
 * da quantidade. O leitor já foi consertado, mas o cadastro que ele criou não
 * some sozinho — reimportar o relatório tira as linhas, não o cadastro.
 *
 * O app não apaga por achar o nome estranho: apaga o que não tem UMA nota, UM
 * pedido, UM título, UMA linha de comissão atrás. É fato verificável, está
 * escrito na tela, e quem tiver qualquer movimento não aparece aqui.
 */
function cardSemMovimento(vazios) {
  const tortos = vazios.filter((v) => v.pareceLeituraTorta);
  const limpar = async () => {
    const sim = await confirmar({
      titulo: `Apagar ${vazios.length} cadastro(s)?`,
      texto: `${vazios.slice(0, 10).map((v) => v.nome).join('\n')}`
        + (vazios.length > 10 ? `\n… e mais ${vazios.length - 10}` : '')
        + '\n\nNenhum deles tem nota, pedido, título ou linha de comissão atrás — '
        + 'apagar não muda número nenhum em tela nenhuma. Se um nome voltar num '
        + 'arquivo novo, o cadastro é criado de novo.',
      confirmar: 'Apagar',
      perigo: true,
    });
    if (!sim) return;
    const apagados = await removerVendedores(vazios.map((v) => v.id), 'cadastro sem nenhuma venda');
    await atualizarAlertas();
    ok(`${apagados.length} cadastro(s) apagado(s).`);
    refresh();
  };

  return card(`${vazios.length} cadastro(s) de vendedor sem nenhuma venda`,
    botao('Apagar todos', { tipo: 'primario', pequeno: true, onClick: limpar }),
    h('p.pequeno.muted', { style: { marginBottom: '10px' } },
      'Nenhum deles tem nota, pedido, título ou linha de comissão atrás. Apagar não muda '
      + 'número nenhum — e se o nome voltar num arquivo, o cadastro é criado de novo.'),
    tortos.length > 0 && aviso(`${tortos.length} deles têm um valor colado no fim do nome `
      + '("NOME 1.050,00"). Isso era o leitor de PDF grudando a coluna do vendedor na da '
      + 'quantidade — já está consertado. Reenvie o relatório de comissão por produto e '
      + 'depois apague estes aqui.', 'info'),
    h('div.empilha', { style: { gap: '2px', marginTop: '10px' } },
      ...vazios.slice(0, 30).map((v) => h('div.linha.linha--entre', { style: { padding: '5px 0' } },
        h('span.pequeno.crescer', { style: { minWidth: 0 } }, v.nome),
        v.pareceLeituraTorta ? selo('leitura torta', 'atencao') : null))),
    vazios.length > 30 && h('p.mini.muted', { style: { marginTop: '8px' } },
      `e mais ${vazios.length - 30}.`));
}

function cardFamilia(f) {
  /* quem fica pode ser trocado: o padrão é o cadastro com mais notas */
  let destinoId = f.destino.id;
  const marcados = new Set(f.membros.filter((m) => m.certeza === 'contido').map((m) => m.id));

  const botaoJuntar = h('button.btn.btn--primario', { style: { width: '100%' } });
  const corpo = h('div.empilha', { style: { gap: '2px' } });

  const nomeDoDestino = () => (f.opcoes.find((o) => o.id === destinoId)?.nome || f.destino.nome);

  const redesenhar = () => {
    const outros = [...f.membros, f.destino]
      .filter((m) => m.id !== destinoId)
      .sort((a, b) => b.notas - a.notas);
    corpo.replaceChildren(...outros.map((m) => linhaDoNome(m, marcados, atualizar)));
    atualizar();
  };

  function atualizar() {
    const quantos = [...marcados].filter((id) => id !== destinoId).length;
    botaoJuntar.textContent = quantos
      ? `Juntar ${quantos} nome(s) em ${nomeDoDestino()}`
      : 'Marque os nomes que são a mesma pessoa';
    botaoJuntar.disabled = !quantos;
  }

  botaoJuntar.addEventListener('click', () => juntarFamilia(f, destinoId, [...marcados], nomeDoDestino()));

  const seletor = h('select.entrada', {
    onChange: (e) => { destinoId = e.target.value; marcados.delete(destinoId); redesenhar(); },
  }, ...f.opcoes.map((o) => h('option', {
    value: o.id, selected: o.id === destinoId,
  }, o.nome)));

  redesenhar();

  return card(null, null,
    h('div.empilha', { style: { gap: '4px', marginBottom: '10px' } },
      h('span.mini.muted', 'O VENDEDOR QUE FICA'),
      seletor,
      h('span.mini.muted',
        `${f.destino.notas} nota(s) · ${money(f.destino.valor)} já estão neste cadastro.`)),
    h('span.mini.muted', 'SÃO A MESMA PESSOA?'),
    corpo,
    h('div', { style: { marginTop: '10px' } }, botaoJuntar));
}

function linhaDoNome(m, marcados, atualizar) {
  const caixa = h('input', {
    type: 'checkbox',
    checked: marcados.has(m.id),
    onChange: (e) => {
      if (e.target.checked) marcados.add(m.id); else marcados.delete(m.id);
      atualizar();
    },
  });
  const porque = m.certeza === 'contido'
    ? 'o nome inteiro aparece no outro'
    : `só ${m.pedacosComuns.map((p) => p.toUpperCase()).join(' e ')} se repete`;

  return h('label.linha.linha--entre', { style: { padding: '8px 0', gap: '10px' } },
    caixa,
    h('span.crescer', { style: { minWidth: 0 } },
      h('span.pequeno', m.nome),
      h('span.mini.muted', { style: { display: 'block' } },
        `${m.notas} nota(s) · ${m.pedidos} pedido(s) · ${money(m.valor)}`),
      h('span.mini.muted', { style: { display: 'block' } }, porque)),
    m.naoVende ? selo('não vende', 'atencao') : null);
}

async function juntarFamilia(f, destinoId, marcados, nomeDoDestino) {
  const ids = marcados.filter((id) => id !== destinoId);
  if (!ids.length) return;
  const nomes = [...f.membros, f.destino].filter((m) => ids.includes(m.id)).map((m) => m.nome);
  const notas = [...f.membros, f.destino].filter((m) => ids.includes(m.id))
    .reduce((a, m) => a + m.notas, 0);

  const r = await formulario({
    titulo: `Juntar em ${nomeDoDestino}?`,
    descricao: `${nomes.join('\n')}\n\n`
      + `${notas} nota(s) passam para ${nomeDoDestino}, junto com os pedidos, os títulos e as `
      + 'linhas de comissão. Os nomes acima viram apelidos dele — o próximo arquivo que trouxer '
      + 'qualquer um deles já cai no lugar certo, sem perguntar.\n\n'
      + 'Faturamento, margem e comissão do mês mudam na hora.',
    campos: [],
    confirmar: 'Juntar',
  });
  if (!r) return;
  try {
    const feito = await juntarNomes(destinoId, ids, `confirmado por você: ${nomes.join(', ')}`);
    await atualizarAlertas();
    ok(`${feito.nomes.length} nome(s) juntados · ${feito.notas} nota(s) agora são de ${nomeDoDestino}.`);
    refresh();
  } catch (e) {
    erro(e.message || 'Não deu para juntar.');
  }
}
