/**
 * CENTRAL DE ARQUIVOS / ROTINA DIÁRIA (itens 15 e 16)
 *
 * O app conduz: mostra o que falta importar, importa, dá o check e sai da frente.
 * O importador não assume layout de arquivo nenhum — quem liga coluna → campo é
 * você, uma vez por fonte; depois disso o perfil fica salvo.
 */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as ingest from '../../logic/ingest.js';
import { recalcular } from '../../logic/link.js';
import { rotina, selo as seloRotina, historico } from '../../logic/routine.js';
import { FONTES, FONTES_LISTA, PERIODICIDADE } from '../../data/sources.js';
import { readFile, detectHeaderRow, rowsToObjects, FORMATOS } from '../../core/files/read.js';
import { definirTitulo, seloDados, atualizarAlertas } from '../shell.js';
import { kpi, card, secao, botao, progresso, aviso, selo } from '../components/ui.js';
import { detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { formatDate, timestampLabel, num } from '../../core/format.js';

/* ------------------------------------------------------- central de arquivos */

export async function telaArquivos() {
  const [r, selo, ultimas] = await Promise.all([rotina(), seloRotina(), historico({ limite: 12 })]);
  definirTitulo('Central de arquivos', `${r.diarias.feitas}/${r.diarias.total} fontes do dia`);

  const pendentes = r.pendentes;
  const concluidas = r.concluidas;

  return h('div.empilha', { style: { gap: '14px' } },
    seloDados(selo),

    card(`Atualização de ${formatDate(r.referencia)}`,
      h('span.num.forte', `${r.progresso}%`),
      progresso({
        valor: concluidas.length,
        total: r.total,
        cor: r.progresso === 100 ? 'var(--verde)' : 'var(--azul)',
        esquerda: `${concluidas.length} de ${r.total} fontes atualizadas`,
        direita: pendentes.length ? `${pendentes.length} pendente(s)` : 'tudo em dia 🎉',
      })),

    pendentes.length === 0
      ? h('div.tudo-ok',
        h('div.tudo-ok__icone', '✅'),
        h('h3', 'Rotina do dia concluída'),
        h('p.pequeno.muted', 'Tudo importado e conciliado. Pode abrir qualquer área que os números estão completos.'))
      : secao('Falta fazer', null, h('div.lista', ...pendentes.map((t) => cardTarefa(t)))),

    concluidas.length > 0 && secao(`Já atualizadas (${concluidas.length})`, null,
      h('div.lista', ...concluidas.map((t) => cardTarefa(t)))),

    secao('Outras fontes', null, h('div.lista',
      ...FONTES_LISTA.filter((f) => f.periodicidade === 'demanda').map((f) => h('div.tarefa',
        h('span.tarefa__icone', f.icone),
        h('div.tarefa__corpo',
          h('div.tarefa__nome', f.nome),
          h('div.tarefa__sub', f.verdadeDe)),
        botao('Importar', { pequeno: true, onClick: () => navigate(`/arquivos/${f.id}`) }))))),

    secao('Histórico de importações', null,
      ultimas.length
        ? h('div.lista', ...ultimas.map((imp) => h('button.item.card--clicavel', { onClick: () => verImportacao(imp) },
          h('div.item__corpo',
            h('div.item__titulo', `${FONTES[imp.fonte]?.icone || '📄'} ${imp.arquivo}`),
            h('div.item__sub',
              h('span', FONTES[imp.fonte]?.nome || imp.fonte),
              h('span', timestampLabel(imp.momento)),
              imp.periodo?.ate && h('span', `até ${formatDate(imp.periodo.ate)}`),
              imp.totalErros > 0 && h('span.ruim', `${imp.totalErros} erro(s)`))),
          h('div.empilha',
            h('div.item__valor', num(imp.resumo.total, 0)),
            h('div.mini.muted.dir', 'registros')))))
        : h('p.pequeno.muted', 'Nenhuma importação ainda.')),

    aviso('Reimportar o mesmo arquivo não duplica nada: cada NF, título ou movimento tem uma chave própria '
      + 'e é atualizado no lugar.', 'info'));
}

function cardTarefa(t) {
  const classe = ['tarefa', t.feito && 'tarefa--feita', !t.feito && t.atrasada && 'tarefa--atrasada'].filter(Boolean).join('.');
  return h(`div.${classe}`,
    h('span.tarefa__icone', t.feito ? '✅' : t.icone),
    h('div.tarefa__corpo',
      h('div.tarefa__nome', t.nome),
      h('div.tarefa__sub',
        t.feito && t.ultima
          ? `${formatDate(t.ultima.data)} às ${timestampLabel(t.ultima.momento).split('às')[1]?.trim() || ''} · ${num(t.ultima.resumo.total, 0)} registros`
          : t.nunca ? `${t.periodicidadeLabel} · nunca importado`
            : t.observacao || `${t.periodicidadeLabel} · última vez há ${t.desde} dia(s)`),
      t.erros > 0 && h('div.mini.ruim', `⚠️ ${t.erros} registro(s) precisaram de atenção`)),
    t.fonteId === 'conciliacao'
      ? botao(`Resolver (${t.quantidade})`, { tipo: 'primario', pequeno: true, onClick: () => navigate('/conciliacao') })
      : botao(t.feito ? 'Atualizar' : 'Importar', {
        tipo: t.feito ? undefined : 'primario', pequeno: true, onClick: () => navigate(`/arquivos/${t.fonteId}`),
      }));
}

function verImportacao(imp) {
  detalhe(imp.arquivo,
    linhasDetalhe([
      ['Fonte', FONTES[imp.fonte]?.nome || imp.fonte],
      ['Formato', FORMATOS[imp.formato] || imp.formato],
      ['Importado em', timestampLabel(imp.momento)],
      ['Período dos dados', imp.periodo?.de ? `${formatDate(imp.periodo.de)} a ${formatDate(imp.periodo.ate)}` : '—'],
      ['Registros', num(imp.resumo.total, 0)],
      ['Novos', num(imp.resumo.novos, 0)],
      ['Atualizados', num(imp.resumo.atualizados, 0)],
      ['Já existentes (ignorados)', num(imp.resumo.repetidos, 0)],
      ['Erros', num(imp.totalErros, 0)],
    ]),
    imp.erros?.length ? h('div',
      h('h3', { style: { margin: '8px 0 6px' } }, 'Linhas que não entraram'),
      h('div.empilha', { style: { gap: '6px' } }, ...imp.erros.slice(0, 40).map((e) => h('div.erro-linha',
        h('span.erro-linha__n', `L${e.linha}`),
        h('span', e.motivo))))) : null,
    imp.avisos?.length ? aviso(imp.avisos.join(' · '), 'atencao') : null);
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

  const desenhar = () => raiz.replaceChildren(...montarPassos(estado, { fonte, contas, perfis, desenhar }));
  desenhar();
  return raiz;
}

function montarPassos(estado, ctx) {
  if (estado.passo === 'arquivo') return passoArquivo(estado, ctx);
  if (estado.passo === 'mapear') return passoMapear(estado, ctx);
  if (estado.passo === 'conferir') return passoConferir(estado, ctx);
  return [h('p', 'Passo desconhecido.')];
}

/* ----- passo 1: escolher o arquivo */

function passoArquivo(estado, ctx) {
  const { fonte, contas } = ctx;
  const input = h('input', {
    type: 'file',
    style: { display: 'none' },
    accept: '.xlsx,.xlsm,.csv,.txt,.xml,.ofx,.qfx,.zip',
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
  h('span.pequeno.muted', `Formatos aceitos: ${fonte.formatos.join(', ').toUpperCase()}`),
  input);

  return [
    card(fonte.nome, selo(PERIODICIDADE[fonte.periodicidade].label),
      h('p.pequeno.dim', fonte.descricao),
      h('p.mini.muted', { style: { marginTop: '6px' } }, `Fonte da verdade para: ${fonte.verdadeDe}`)),

    fonte.contaObrigatoria && contas.length > 0 && h('div.campo',
      h('label', 'Este extrato é de qual banco?'),
      h('select.entrada', { onChange: (e) => { estado.contaId = e.target.value; } },
        ...contas.map((c) => h('option', { value: c.id }, c.nome)))),

    zona,
    estado.aviso && aviso(estado.aviso, 'ruim'),
    fonte.ajuda && aviso(fonte.ajuda, 'info'),

    card('O que este arquivo precisa ter', null,
      h('div.empilha', { style: { gap: '6px' } },
        ...fonte.campos.filter((c) => c.obrigatorio).map((c) => h('div.linha',
          h('span.ok', '•'), h('span.pequeno', c.label), h('span.mini.muted', 'obrigatório'))),
        ...fonte.campos.filter((c) => !c.obrigatorio).slice(0, 8).map((c) => h('div.linha',
          h('span.muted', '•'), h('span.pequeno.muted', c.label))))),
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
  const faltando = ingest.camposFaltando(fonte.id, estado.mapeamento);

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
        `div.mapa-campo${campo.obrigatorio && !estado.mapeamento[campo.chave] ? '.mapa-campo--faltando' : ''}`,
        h('div.mapa-campo__nome',
          h('span', campo.label, campo.obrigatorio ? ' *' : ''),
          h('span', estado.mapeamento[campo.chave]
            ? `exemplo: ${String(registros[0]?.[estado.mapeamento[campo.chave]] ?? '').slice(0, 28) || '(vazio)'}`
            : (campo.obrigatorio ? 'obrigatório' : 'opcional'))),
        opcoesColuna(campo.chave)))),

    card('Prévia do arquivo', null,
      h('div.tabela-rolagem',
        h('table.tabela.previa',
          h('thead', h('tr', ...cabecalho.slice(0, 8).map((c) => h('th', c)))),
          h('tbody', ...registros.slice(0, 5).map((r) => h('tr',
            ...cabecalho.slice(0, 8).map((c) => h('td', String(r[c] ?? '').slice(0, 30))))))))),

    faltando.length
      ? aviso(`Ainda falta ligar: ${faltando.map((c) => c.label).join(', ')}.`, 'ruim')
      : null,

    botao(estado.ocupado ? 'Conferindo…' : 'Conferir antes de importar', {
      tipo: 'primario', grande: true, bloco: true, desabilitado: faltando.length > 0 || estado.ocupado,
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

    p.erros.length > 0 && card(`${p.erros.length} linha(s) não vão entrar`, null,
      h('p.mini.muted', 'Elas ficam de fora inteiras — o app não importa registro pela metade nem inventa o que falta.'),
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
    ok(`✓ Importado — ${num(registro.resumo.total, 0)} registros.`);
    navigate('/arquivos');
  } catch (err) {
    estado.aviso = err.message;
    estado.ocupado = false;
    desenhar();
  }
}
