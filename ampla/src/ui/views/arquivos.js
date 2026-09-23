/**
 * CENTRAL DE ARQUIVOS / ROTINA DIÁRIA (itens 15 e 16)
 *
 * O app conduz: mostra o que falta importar, importa, dá o check e sai da frente.
 * O importador não assume layout de arquivo nenhum — quem liga coluna → campo é
 * você, uma vez por fonte; depois disso o perfil fica salvo.
 */

import { h, frag } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as ingest from '../../logic/ingest.js';
import { recalcular, pedidosSemVendedor, definirVendedorDoPedido } from '../../logic/link.js';
import { rotina, selo as seloRotina } from '../../logic/routine.js';
import { FONTES, FONTES_LISTA, PERIODICIDADE } from '../../data/sources.js';
import { readFile, detectHeaderRow, rowsToObjects, FORMATOS, formatoSuportado, acceptSuportado } from '../../core/files/read.js';
import { definirTitulo, seloDados, atualizarAlertas } from '../shell.js';
import { kpi, card, secao, botao, aviso, selo } from '../components/ui.js';
import { ok } from '../components/toast.js';
import { formulario } from '../components/sheet.js';
import { formatDate, timestampLabel, num, money } from '../../core/format.js';
import { cents, sum } from '../../core/util.js';

/* ------------------------------------------------------- central de arquivos */

export async function telaArquivos() {
  const [r, selo] = await Promise.all([rotina(), seloRotina()]);
  definirTitulo('Relatórios que você manda', `${r.diarias.feitas}/${r.diarias.total} atualizados hoje`);

  const doDia = r.tarefas.filter((t) => t.periodicidade === 'diaria');
  const deVezEmQuando = r.tarefas.filter((t) => t.periodicidade !== 'diaria' && t.periodicidade !== 'demanda');
  const quandoPrecisar = FONTES_LISTA.filter((f) => f.periodicidade === 'demanda');

  return h('div.empilha', { style: { gap: '14px' } },
    seloDados(selo),

    aviso('O arquivo que você manda ATUALIZA o que já está aqui — ele não vira um relatório novo. '
      + 'Boleto prorrogado continua o mesmo boleto com a data nova, e o que o seu sistema já '
      + 'baixou entra como pago.', 'info'),

    secao('Todo dia', null,
      h('div.lista', ...doDia.map((t) => cardTarefa(t)))),

    deVezEmQuando.length > 0 && secao('De vez em quando', null,
      h('div.lista', ...deVezEmQuando.map((t) => cardTarefa(t)))),

    quandoPrecisar.length > 0 && secao('Quando precisar', null, h('div.lista',
      ...quandoPrecisar.map((f) => h('div.tarefa',
        h('span.tarefa__icone', f.icone),
        h('div.tarefa__corpo',
          h('div.tarefa__nome', f.nome),
          h('div.tarefa__sub', f.verdadeDe)),
        botao('Mandar', { pequeno: true, onClick: () => navigate(`/arquivos/${f.id}`) }))))));
}

/**
 * Uma linha por relatório, dizendo com qual arquivo ele está atualizado. Não é
 * um check de tarefa: é a data do dado que está na tela agora.
 */
function cardTarefa(t) {
  const classe = ['tarefa', t.feito && 'tarefa--feita', !t.feito && t.atrasada && 'tarefa--atrasada'].filter(Boolean).join('.');
  return h(`div.${classe}`,
    h('span.tarefa__icone', t.icone),
    h('div.tarefa__corpo',
      h('div.tarefa__nome', t.nome),
      h('div.tarefa__sub',
        t.ultima
          ? `atualizado com o arquivo de ${formatDate(t.ultima.data)} · ${num(t.ultima.resumo.principal || t.ultima.resumo.total, 0)} registros`
          : 'nunca recebido'),
      t.erros > 0 && h('div.mini.ruim', `⚠️ ${t.erros} registro(s) precisaram de atenção`)),
    t.fonteId === 'conciliacao'
      ? botao(`Ver (${t.quantidade})`, { pequeno: true, onClick: () => navigate('/conciliacao') })
      : botao('Mandar', {
        tipo: t.feito ? undefined : 'primario', pequeno: true, onClick: () => navigate(`/arquivos/${t.fonteId}`),
      }));
}

/* ------------------------------------------------------------- importador */

export async function telaImportar({ params }) {
  const fonte = FONTES[params.fonte];
  if (!fonte) { navigate('/arquivos'); return h('div'); }
  definirTitulo(`Importar — ${fonte.nome}`);

  const [contas, perfis] = await Promise.all([store.contas.listar(), store.perfisImport.listar()]);
  const raiz = h('div.importador');
  const estado = {
    passo: 'arquivo',
    leitura: null,
    planilhaIndex: 0,
    headerRow: 0,
    mapeamento: {},
    contaId: contas[0]?.id || null,
    preparo: null,
    ocupado: false,
    aviso: null,
  };

  // frag() filtra os nulos das condicionais; replaceChildren() cru viraria
  // texto "undefined"/"null" na tela.
  const desenhar = () => raiz.replaceChildren(frag(...montarPassos(estado, { fonte, contas, perfis, desenhar })));
  desenhar();
  return raiz;
}

function montarPassos(estado, ctx) {
  if (estado.passo === 'arquivo') return passoArquivo(estado, ctx);
  if (estado.passo === 'mapear') return passoMapear(estado, ctx);
  if (estado.passo === 'conferir') return passoConferir(estado, ctx);
  if (estado.passo === 'vendedores') return passoVendedores(estado, ctx);
  return [h('p', 'Passo desconhecido.')];
}

/* ----- passo 1: escolher o arquivo */

const maiusc = (fs) => fs.map((f) => f.toUpperCase());

/** Dos formatos que a fonte anuncia, os que o leitor abre hoje. */
function aceitos(fonte) {
  return fonte.formatos.filter(formatoSuportado);
}

/** Os que a fonte cita mas o leitor ainda não abre — dito na cara, não escondido. */
function aindaNao(fonte) {
  return fonte.formatos.filter((f) => !formatoSuportado(f));
}

function passoArquivo(estado, ctx) {
  const { fonte, contas } = ctx;
  const input = h('input', {
    type: 'file',
    style: { display: 'none' },
    accept: acceptSuportado(),
    onChange: (e) => e.target.files[0] && carregar(e.target.files[0], estado, ctx),
  });

  const zona = h('button.solta', {
    onClick: () => input.click(),
    onDragover: (e) => { e.preventDefault(); zona.classList.add('solta--ativo'); },
    onDragleave: () => zona.classList.remove('solta--ativo'),
    onDrop: (e) => {
      e.preventDefault();
      zona.classList.remove('solta--ativo');
      const arquivo = e.dataTransfer.files[0];
      if (arquivo) carregar(arquivo, estado, ctx);
    },
  },
  h('span.solta__icone', estado.ocupado ? '⏳' : fonte.icone),
  h('strong', estado.ocupado ? 'Lendo o arquivo…' : 'Toque para escolher, ou arraste o arquivo aqui'),
  h('span.pequeno.muted', `Formatos aceitos: ${maiusc(aceitos(fonte)).join(', ')}`),
  input);

  return [
    card(fonte.nome, selo(PERIODICIDADE[fonte.periodicidade].label),
      h('p.pequeno.dim', fonte.descricao),
      fonte.colunasReais && h('p.mini.muted', { style: { marginTop: '8px' } },
        'Colunas que o app aproveita: ', h('strong', fonte.colunasReais.join(' · '))),
      h('p.mini.muted', { style: { marginTop: '6px' } }, `Fonte da verdade para: ${fonte.verdadeDe}`)),

    fonte.contaObrigatoria && contas.length > 0 && h('div.campo',
      h('label', 'Este extrato é de qual banco?'),
      h('select.entrada', { onChange: (e) => { estado.contaId = e.target.value; } },
        ...contas.map((c) => h('option', { value: c.id }, c.nome)))),

    zona,
    aindaNao(fonte).length > 0 && aviso(
      `Este relatório também sai em ${maiusc(aindaNao(fonte)).join(', ')}, mas o app `
      + 'ainda não lê esse formato. Por enquanto exporte em '
      + `${maiusc(aceitos(fonte)).join(' ou ')}.`, 'atencao'),
    estado.aviso && aviso(estado.aviso, 'ruim'),
    fonte.ajuda && aviso(fonte.ajuda, 'info'),

    card('O que o app aproveita deste arquivo', null,
      h('p.mini.muted', { style: { marginBottom: '8px' } },
        'Nenhuma coluna é obrigatória. Mande o relatório como ele sai do sistema.'),
      h('div.empilha', { style: { gap: '6px' } },
        ...fonte.campos.map((c) => h('div.linha',
          h('span', { class: c.chaveNatural ? 'ok' : 'muted' }, '•'),
          h('span.pequeno', c.label),
          c.chaveNatural && h('span.mini.muted', 'identifica o registro'))))),
  ];
}

async function carregar(arquivo, estado, ctx) {
  const { fonte, perfis, desenhar } = ctx;
  estado.ocupado = true;
  estado.aviso = null;
  desenhar();
  try {
    const leitura = await readFile(arquivo);
    estado.leitura = leitura;

    const anterior = await ingest.importacaoAnterior(leitura.hash);
    if (anterior) {
      estado.aviso = `Este arquivo já foi importado em ${timestampLabel(anterior.momento)}. `
        + 'Pode seguir: os registros serão atualizados, não duplicados.';
    }

    // XML de NF-e e OFX têm layout fixo: vão direto para a conferência
    if (leitura.formato === 'nfe' || leitura.formato === 'zip') {
      estado.preparo = await ingest.prepararNfe({ leitura });
      estado.passo = 'conferir';
    } else if (leitura.formato === 'ofx') {
      if (!estado.contaId) throw new Error('Cadastre uma conta bancária antes de importar o extrato.');
      estado.preparo = await ingest.prepararOfx({ leitura, contaId: estado.contaId });
      estado.passo = 'conferir';
    } else {
      estado.planilhaIndex = 0;
      const linhas = leitura.planilhas[0].linhas;
      estado.headerRow = detectHeaderRow(linhas);
      const { cabecalho } = rowsToObjects(linhas, estado.headerRow);
      const perfil = perfis.find((p) => p.fonte === fonte.id && p.assinatura === assinatura(cabecalho));
      estado.mapeamento = perfil?.mapa || ingest.sugerirMapeamento(fonte.id, cabecalho);
      estado.perfilSalvo = !!perfil;
      estado.passo = 'mapear';
    }
  } catch (err) {
    estado.aviso = err.message;
  } finally {
    estado.ocupado = false;
    desenhar();
  }
}

function assinatura(cabecalho) {
  return cabecalho.join('|').slice(0, 400);
}

/* ----- passo 2: ligar coluna → campo */

function passoMapear(estado, ctx) {
  const { fonte, desenhar } = ctx;
  const planilha = estado.leitura.planilhas[estado.planilhaIndex];
  const { cabecalho, registros } = rowsToObjects(planilha.linhas, estado.headerRow);
  const semChave = ingest.camposSemLigacao(fonte.id, estado.mapeamento);

  const opcoesColuna = (chave) => h('select.entrada', {
    onChange: (e) => { estado.mapeamento[chave] = e.target.value || undefined; desenhar(); },
  },
  h('option', { value: '', selected: !estado.mapeamento[chave] }, '— não tem —'),
  ...cabecalho.map((c) => h('option', { value: c, selected: estado.mapeamento[chave] === c }, c)));

  return [
    h('div.linha.linha--entre',
      h('div',
        h('strong', estado.leitura.arquivo),
        h('div.mini.muted', `${registros.length} linhas · ${cabecalho.length} colunas`)),
      botao('Trocar arquivo', { pequeno: true, onClick: () => { estado.passo = 'arquivo'; estado.leitura = null; desenhar(); } })),

    estado.aviso && aviso(estado.aviso, 'atencao'),
    estado.perfilSalvo && aviso('Já conhecia este layout — as colunas vieram do perfil salvo.', 'ok'),

    estado.leitura.planilhas.length > 1 && h('div.campo',
      h('label', 'Planilha'),
      h('select.entrada', {
        onChange: (e) => {
          estado.planilhaIndex = Number(e.target.value);
          const linhas2 = estado.leitura.planilhas[estado.planilhaIndex].linhas;
          estado.headerRow = detectHeaderRow(linhas2);
          estado.mapeamento = ingest.sugerirMapeamento(fonte.id, rowsToObjects(linhas2, estado.headerRow).cabecalho);
          desenhar();
        },
      }, ...estado.leitura.planilhas.map((p, i) => h('option', { value: i, selected: i === estado.planilhaIndex }, p.nome)))),

    h('div.campo',
      h('label', 'Linha do cabeçalho'),
      h('select.entrada', {
        onChange: (e) => {
          estado.headerRow = Number(e.target.value);
          estado.mapeamento = ingest.sugerirMapeamento(fonte.id, rowsToObjects(planilha.linhas, estado.headerRow).cabecalho);
          desenhar();
        },
      }, ...planilha.linhas.slice(0, 12).map((linha, i) => h('option', { value: i, selected: i === estado.headerRow },
        `Linha ${i + 1}: ${linha.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}`))),
      h('span.campo__ajuda', 'Relatórios de sistema costumam ter títulos antes da tabela.')),

    card('Ligar colunas', null,
      h('p.mini.muted', 'O app sugere, você confirma. Campo que não existe no arquivo fica "não tem" — nada é preenchido por suposição.'),
      ...fonte.campos.map((campo) => h(
        'div.mapa-campo',
        h('div.mapa-campo__nome',
          h('span', campo.label),
          h('span', estado.mapeamento[campo.chave]
            ? `exemplo: ${String(registros[0]?.[estado.mapeamento[campo.chave]] ?? '').slice(0, 28) || '(vazio)'}`
            : (campo.chaveNatural ? 'identifica o registro' : 'se o arquivo tiver'))),
        opcoesColuna(campo.chave)))),

    card('Prévia do arquivo', null,
      h('div.tabela-rolagem',
        h('table.tabela.previa',
          h('thead', h('tr', ...cabecalho.slice(0, 8).map((c) => h('th', c)))),
          h('tbody', ...registros.slice(0, 5).map((r) => h('tr',
            ...cabecalho.slice(0, 8).map((c) => h('td', String(r[c] ?? '').slice(0, 30))))))))),

    semChave.length
      ? aviso(`Sem ${semChave.map((c) => c.label).join(' e ')}, o app não consegue reconhecer o mesmo `
        + 'registro numa reimportação — ele vai identificar pela linha inteira. Pode seguir assim.', 'atencao')
      : null,

    botao(estado.ocupado ? 'Conferindo…' : 'Conferir antes de importar', {
      tipo: 'primario', grande: true, bloco: true, desabilitado: estado.ocupado,
      onClick: () => preparar(estado, ctx),
    }),
  ];
}

async function preparar(estado, ctx) {
  const { fonte, desenhar } = ctx;
  estado.ocupado = true;
  estado.aviso = null;
  desenhar();
  try {
    estado.preparo = await ingest.prepararTabular({
      fonteId: fonte.id,
      leitura: estado.leitura,
      planilhaIndex: estado.planilhaIndex,
      headerRow: estado.headerRow,
      mapeamento: estado.mapeamento,
      contaId: estado.contaId,
    });
    estado.passo = 'conferir';
  } catch (err) {
    estado.aviso = err.message;
  } finally {
    estado.ocupado = false;
    desenhar();
  }
}

/* ----- passo 3: conferir e gravar */

function passoConferir(estado, ctx) {
  const { desenhar } = ctx;
  const p = estado.preparo;
  const porStore = Object.entries(p.porStore).map(([nome, mapa]) => ({ nome, quantidade: mapa.size }));

  return [
    h('div.linha.linha--entre',
      h('div',
        h('strong', p.arquivo),
        h('div.mini.muted', `${FORMATOS[p.formato] || p.formato}${p.periodo.de ? ` · ${formatDate(p.periodo.de)} a ${formatDate(p.periodo.ate)}` : ''}`)),
      botao('Voltar', { pequeno: true, onClick: () => { estado.passo = estado.leitura.planilhas.length ? 'mapear' : 'arquivo'; desenhar(); } })),

    h('div.grade.grade--4',
      kpi({ label: 'Novos', valor: num(p.resumo.novos, 0), cor: 'ok', icone: '✨' }),
      kpi({ label: 'Atualizados', valor: num(p.resumo.atualizados, 0), cor: 'info', icone: '🔄' }),
      kpi({ label: 'Já existiam', valor: num(p.resumo.repetidos, 0), icone: '🟰' }),
      kpi({ label: 'Erros', valor: num(p.erros.length, 0), cor: p.erros.length ? 'ruim' : undefined, icone: '⚠️' })),

    porStore.length > 1 && card('O que será gravado', null,
      h('div.empilha', { style: { gap: '5px' } }, ...porStore.map((s) => h('div.linha.linha--entre',
        h('span.pequeno', rotuloStore(s.nome)),
        h('span.num.forte', num(s.quantidade, 0)))))),

    p.cancelamentos.length > 0 && aviso(`${p.cancelamentos.length} evento(s) de cancelamento — as notas serão marcadas como canceladas.`, 'atencao'),
    ...p.avisos.map((a) => aviso(a, 'atencao')),
    estado.aviso && aviso(estado.aviso, 'ruim'),

    p.atencao?.length > 0 && card(`${p.atencao.length} linha(s) com campo que não deu para ler`, null,
      h('p.mini.muted', 'Elas ENTRAM assim mesmo — só o campo que não deu para interpretar fica vazio.'),
      h('div.empilha', { style: { gap: '6px', marginTop: '8px' } },
        ...p.atencao.slice(0, 15).map((e) => h('div.erro-linha', { style: { background: 'var(--amarelo-fraco)' } },
          h('span.erro-linha__n', `L${e.linha}`),
          h('div', h('div', e.motivo)))),
        p.atencao.length > 15 && h('p.mini.muted', `… e mais ${p.atencao.length - 15}.`))),

    p.erros.length > 0 && card(`${p.erros.length} linha(s) não puderam ser montadas`, null,
      h('p.mini.muted', 'Normalmente é falta de escolher a conta bancária, ou linha de cabeçalho repetida no meio do relatório.'),
      h('div.empilha', { style: { gap: '6px', marginTop: '8px' } },
        ...p.erros.slice(0, 25).map((e) => h('div.erro-linha',
          h('span.erro-linha__n', `L${e.linha}`),
          h('div', h('div', e.motivo), e.dados && h('div.mini.muted', e.dados)))),
        p.erros.length > 25 && h('p.mini.muted', `… e mais ${p.erros.length - 25}.`))),

    botao(estado.ocupado ? 'Importando…' : `Importar ${num(p.resumo.novos + p.resumo.atualizados, 0)} registro(s)`, {
      tipo: 'ok', grande: true, bloco: true, desabilitado: estado.ocupado,
      onClick: () => confirmarImportacao(estado, ctx),
    }),

    botao('Cancelar', { bloco: true, onClick: () => navigate('/arquivos') }),
  ];
}

/* ----- passo 4: de quem foi esta venda? (só quando faltou vendedor) */

/**
 * Aparece logo depois de importar, porque é o único momento em que dá para
 * resolver: o sistema de origem não deixa acrescentar vendedor a um pedido já
 * feito, então o vínculo só pode nascer aqui, com o relatório na mão.
 */
function passoVendedores(estado, ctx) {
  const { desenhar } = ctx;
  const pendentes = estado.pendentes || [];
  const vendedores = estado.vendedores || [];
  const total = cents(sum(pendentes, (x) => x.valor));

  const marcar = async (item, vendedorId) => {
    estado.ocupado = true;
    desenhar();
    await definirVendedorDoPedido(item.pedido.id, vendedorId,
      `definido na importação de ${estado.preparo.arquivo}`);
    estado.pendentes = await pedidosSemVendedor();
    estado.vendedores = await store.vendedores.listar();
    estado.ocupado = false;
    await atualizarAlertas();
    if (!estado.pendentes.length) {
      ok('Pronto — todo o faturamento tem dono.');
      navigate('/arquivos');
      return;
    }
    desenhar();
  };

  const novoVendedor = async (item) => {
    const r = await formulario({
      titulo: 'Quem vendeu?',
      descricao: `Pedido ${item.pedido.numero || ''} · ${item.pedido.clienteNome || ''}`,
      campos: [{ chave: 'nome', label: 'Nome do vendedor', tipo: 'texto', obrigatorio: true }],
    });
    if (!r?.nome) return;
    const v = await store.vendedores.salvar({ nome: String(r.nome).trim(), apelidos: [], ativo: true });
    await marcar(item, v.id);
  };

  if (!pendentes.length) return [h('p.pequeno.muted', 'Nada pendente.')];

  // Um mês inteiro de vendas sem a coluna de vendedor são centenas de cartões:
  // a tela trava e ninguém resolve 334 de uma vez. Mostra as que mais pesam e
  // diz onde está o resto.
  const LOTE = 20;
  const mostrar = pendentes.slice(0, LOTE);
  const resto = pendentes.length - mostrar.length;

  return [
    card(`${pendentes.length} venda(s) vieram sem vendedor`,
      h('span.num.forte', money(total)),
      h('p.pequeno.dim',
        'O arquivo não trouxe o vendedor destas. Diga aqui de quem foi cada uma: '
        + 'todas as notas do pedido recebem o mesmo vendedor, inclusive as próximas.'),
      h('p.mini.muted', { style: { marginTop: '6px' } },
        'Se deixar para depois, esse faturamento fica fora do ranking e da comissão até alguém resolver.')),

    resto > 0 && aviso(`O arquivo não trouxe a coluna VENDEDOR. São ${pendentes.length} vendas sem dono — `
      + `aqui estão as ${LOTE} maiores. Se o seu relatório puder sair com a coluna do vendedor, `
      + 'a comissão fecha sozinha e você não precisa marcar nenhuma.', 'atencao'),

    ...mostrar.map((item) => h('div.card',
      h('div.linha.linha--entre', { style: { alignItems: 'flex-start' } },
        h('div.crescer',
          h('strong', `Pedido ${item.pedido.numero || '(sem número)'}`),
          h('div.mini.muted', { style: { marginTop: '2px' } },
            item.pedido.clienteNome || 'cliente não identificado'),
          h('div.mini.muted', item.pedido.data ? formatDate(item.pedido.data) : 'sem data')),
        h('div.empilha', { style: { alignItems: 'flex-end' } },
          h('span.num.forte', money(item.valor)),
          h('span.mini.muted', item.notas.length
            ? `${item.notas.length} NF: ${item.notas.map((n) => n.numero).filter(Boolean).slice(0, 3).join(', ')}`
            : 'ainda sem NF'))),

      h('div.btn-linha', { style: { marginTop: '10px', flexWrap: 'wrap' } },
        ...vendedores.map((v) => botao(v.nome, {
          pequeno: true, desabilitado: estado.ocupado, onClick: () => marcar(item, v.id),
        })),
        botao('+ outro', { pequeno: true, desabilitado: estado.ocupado, onClick: () => novoVendedor(item) })))),

    resto > 0 && h('p.pequeno.muted.centro',
      `e mais ${resto} — o resto fica no menu ☰ › O que ficou sem vendedor.`),

    botao('Deixar para depois', {
      bloco: true,
      onClick: () => navigate('/arquivos'),
    }),
  ];
}

function rotuloStore(nome) {
  return {
    nfs: 'Notas fiscais', nfItens: 'Itens das notas', pedidos: 'Pedidos', receber: 'Títulos a receber',
    pagar: 'Contas a pagar', extrato: 'Movimentos bancários', saldos: 'Saldos', produtos: 'Produtos',
    clientes: 'Clientes', fornecedores: 'Fornecedores', vendedores: 'Vendedores',
  }[nome] || nome;
}

async function confirmarImportacao(estado, ctx) {
  const { fonte, desenhar } = ctx;
  estado.ocupado = true;
  desenhar();
  try {
    const registro = await ingest.confirmar(estado.preparo);

    // guarda o perfil de colunas para a próxima vez ser um clique só
    if (estado.leitura.planilhas.length && Object.keys(estado.mapeamento).length) {
      const { cabecalho } = rowsToObjects(estado.leitura.planilhas[estado.planilhaIndex].linhas, estado.headerRow);
      await store.perfisImport.salvar({
        id: `perfil_${fonte.id}_${assinatura(cabecalho).length}_${cabecalho.length}`,
        fonte: fonte.id,
        assinatura: assinatura(cabecalho),
        mapa: estado.mapeamento,
        headerRow: estado.headerRow,
        atualizadoEm: Date.now(),
      });
    }

    await recalcular();
    await atualizarAlertas();
    ok(`✓ Importado — ${num(registro.resumo.principal || registro.resumo.total, 0)} registros.`);

    // No sistema dela não dá para voltar e pôr o vendedor num pedido já feito.
    // Então é AGORA, com o arquivo na mão, que ela diz de quem foi cada venda —
    // depois de sair desta tela ela não teria mais como consertar na origem.
    const semDono = await pedidosSemVendedor();
    if (semDono.length) {
      estado.pendentes = semDono;
      estado.vendedores = await store.vendedores.listar();
      estado.passo = 'vendedores';
      estado.ocupado = false;
      desenhar();
      return;
    }
    navigate('/arquivos');
  } catch (err) {
    estado.aviso = err.message;
    estado.ocupado = false;
    desenhar();
  }
}
