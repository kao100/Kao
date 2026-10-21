/**
 * AMPLA — Gestão administrativa
 *
 * Abrir o aplicativo e saber como a empresa está.
 * Este arquivo só liga as peças: banco, rotas e service worker.
 */

import { defineRoutes, initRouter } from './core/router.js';
import { requestPersistence } from './core/db.js';
import { migrarDoNomeAntigo } from './core/migrar.js';
import { reiniciarSePreciso } from './core/reiniciar.js';
import { repararSituacaoNegada } from './core/reparar.js';
import { montarShell, aoTrocarRota, atualizarAlertas } from './ui/shell.js';
import { semear } from './data/seed.js';

import { telaDiario } from './ui/views/diario.js';
import { telaFluxo } from './ui/views/fluxo.js';
import { telaComercial, telaVendedor } from './ui/views/comercial.js';
import { telaProdutos, telaProduto } from './ui/views/produtos.js';
import { telaComissoes } from './ui/views/comissoes.js';
import { telaConciliacao, telaVendedores } from './ui/views/conciliacao.js';
import { telaRt } from './ui/views/rt.js';
import { telaArquivos, telaImportar } from './ui/views/arquivos.js';
import { telaAjustes } from './ui/views/ajustes.js';
import { telaFechamento } from './ui/views/fechamento.js';
import { telaOrcamentos } from './ui/views/orcamentos.js';
import { telaClientes, telaCliente } from './ui/views/clientes.js';
import { telaMargem } from './ui/views/margem.js';
import { telaDre } from './ui/views/dre.js';
import { telaCompras } from './ui/views/compras.js';

/**
 * CINCO LUGARES, E SÓ.
 *
 * "Ficou muito complexo, onde eu não conseguia mais entender e fazer nada."
 *
 * Eram vinte e oito rotas e dezessete itens de menu. Nada do que ela pede é
 * novo — o faturamento diário, a meta, a pasta do mês, tudo já estava pronto e
 * enterrado. O conserto não é construir: é tirar.
 *
 * O que ficou são as cinco coisas que ela nomeou: mandar os relatórios, o fluxo
 * de caixa, o impulso comercial do dia, a comissão e o fechamento do mês. O
 * resto do comercial continua existindo, mas se entra POR DENTRO do comercial,
 * não por um menu que ela precise decorar.
 *
 * Saíram de vez, nas palavras dela: "não preciso mais do inadimplência, de
 * cobrança, nada disso — eu estou conseguindo fazer pelo sistema existente".
 * Com eles saiu o extrato bancário, que ela trocou pelo saldo informado: "o que
 * eu vou colocar é o saldo, para ele conseguir fazer a estimativa".
 */
const ROTAS = [
  { path: '/', view: telaDiario, titulo: 'Hoje' },
  { path: '/diario', view: telaDiario, titulo: 'Hoje' },
  { path: '/fluxo', view: telaFluxo, titulo: 'Fluxo de caixa' },
  { path: '/caixa', view: telaFluxo, titulo: 'Fluxo de caixa' },
  { path: '/comercial', view: telaComercial, titulo: 'Comercial' },
  { path: '/comercial/:id', view: telaVendedor, titulo: 'Vendedor' },
  { path: '/orcamentos', view: telaOrcamentos, titulo: 'Orçamentos' },
  { path: '/clientes', view: telaClientes, titulo: 'Clientes' },
  { path: '/clientes/detalhe', view: telaCliente, titulo: 'Cliente' },
  { path: '/margem', view: telaMargem, titulo: 'Margem e frete' },
  { path: '/produtos', view: telaProdutos, titulo: 'Produtos e curva ABC' },
  { path: '/produtos/:id', view: telaProduto, titulo: 'Produto' },
  { path: '/comissoes', view: telaComissoes, titulo: 'Comissão' },
  { path: '/rt', view: telaRt, titulo: 'RT (indicação)' },
  /**
   * A tela de pendências não é uma aba: é o destino de um aviso. Ela só aparece
   * quando o app tem uma pergunta — de quem foi esta venda, quanto custou esta
   * entrega — e é por isso que ela não ocupa vaga na barra.
   */
  { path: '/conciliacao', view: telaConciliacao, titulo: 'O que o app precisa saber' },
  { path: '/conciliacao/vendedores', view: telaVendedores, titulo: 'De quem foi esta venda?' },
  { path: '/dre', view: telaDre, titulo: 'DRE gerencial' },
  { path: '/compras', view: telaCompras, titulo: 'Compras' },
  { path: '/fechamento', view: telaFechamento, titulo: 'Fechamento do mês' },
  { path: '/arquivos', view: telaArquivos, titulo: 'Mandar os relatórios' },
  { path: '/arquivos/:fonte', view: telaImportar, titulo: 'Mandar relatório' },
  { path: '/ajustes', view: telaAjustes, titulo: 'Ajustes' },
];

/**
 * O APP CONFERE A PRÓPRIA REGRA DE LEITURA ANTES DE ABRIR.
 *
 * O cache do navegador servia arquivo velho por cima do service worker: o que
 * era novo chegava fresco, o que já estava guardado vinha antigo. O aparelho
 * dela rodou semanas com `versao.js` novo dizendo "v53" e `ingest.js` velho
 * lendo "Em aberto" como pago — dez consertos que nunca chegaram inteiros.
 *
 * Então o app pergunta a si mesmo três coisas cuja resposta eu conheço. Se
 * qualquer uma vier errada, o código é velho: ele joga fora o que está guardado
 * e recarrega uma vez. Uma só, marcada na sessão, para nunca virar um laço.
 *
 * É barato, roda em milissegundos, e é a diferença entre ela descobrir sozinha
 * em dois segundos e perder mais uma semana achando que o erro é dela.
 */
const PROVAS = [
  ['Em aberto', 'aberto'],
  ['Não pago', 'aberto'],
  ['Atrasado', 'aberto'],
  ['Confirmado', 'pago'],
  ['Recebido', 'pago'],
];

async function codigoEstaVelho() {
  try {
    const { interpretarStatusDoArquivo } = await import('./logic/ingest.js');
    if (typeof interpretarStatusDoArquivo !== 'function') return true;
    return PROVAS.some(([texto, esperado]) => interpretarStatusDoArquivo(texto) !== esperado);
  } catch {
    return true;
  }
}

async function jogarForaORestoEVoltar() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (typeof caches !== 'undefined') {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((n) => caches.delete(n)));
    }
  } catch { /* se não der, recarregar já tenta a rede */ }
  window.location.reload();
}

async function iniciar() {
  const raiz = document.getElementById('app-root');
  try {
    /* código velho não pode abrir: ele mostra número errado com cara de certo */
    if (await codigoEstaVelho()) {
      if (!sessionStorage.getItem('ampla_recarregou')) {
        sessionStorage.setItem('ampla_recarregou', '1');
        raiz.innerHTML = '<p style="padding:24px;font:15px system-ui">Atualizando o aplicativo…</p>';
        await jogarForaORestoEVoltar();
        return;
      }
      /* já tentou e continua velho: avisar é melhor que mostrar número errado */
      raiz.innerHTML = '<div style="padding:24px;font:15px system-ui;line-height:1.5">'
        + '<strong>O aplicativo está desatualizado neste aparelho.</strong><br>'
        + 'Feche todas as abas do AMPLA e abra de novo. Se continuar assim, abra o site '
        + 'numa aba anônima uma vez.</div>';
      return;
    }
    sessionStorage.removeItem('ampla_recarregou');
    // recomeço pedido pela empresa: apaga tudo o que já foi importado, uma vez
    // só por marca. Vem antes da migração para o banco antigo não trazer tudo
    // de volta.
    const recomeco = await reiniciarSePreciso();
    const migracao = recomeco.reiniciou ? { migrou: false } : await migrarDoNomeAntigo();
    /**
     * Conserta, uma vez, os títulos que entraram como baixados porque "NÃO
     * PAGO" contém "PAGO". Vem depois da migração, para alcançar também o que
     * veio do banco antigo, e antes de qualquer tela, para ela nunca ver o
     * número errado.
     */
    const reparo = recomeco.reiniciou ? { reparou: false } : await repararSituacaoNegada();
    await semear();
    const outlet = montarShell(raiz);
    defineRoutes(ROTAS);
    await initRouter(outlet, { after: aoTrocarRota });
    atualizarAlertas();
    requestPersistence();
    registrarServiceWorker();
    buscarDaNuvemSePreciso();
    if (recomeco.reiniciou) {
      const { ok } = await import('./ui/components/toast.js');
      ok('Aplicativo recomeçado do zero — pode mandar os relatórios.');
    } else if (migracao.migrou) {
      const { ok } = await import('./ui/components/toast.js');
      ok(`${migracao.registros} registro(s) trazidos do aplicativo antigo.`);
    }
    /**
     * O conserto é anunciado, não escondido. Ela viu o caixa zerado e precisa
     * saber que o número mudou, e por quê — um app que corrige silenciosamente
     * é um app em que não se pode confiar.
     */
    if (reparo.reparou) {
      const [{ money }, { ok }, store] = await Promise.all([
        import('./core/format.js'),
        import('./ui/components/toast.js'),
        import('./core/store.js'),
      ]);
      const partes = [];
      if (reparo.reabertos) partes.push(`${reparo.reabertos} voltaram para "em aberto" (${money(reparo.valorReaberto)})`);
      if (reparo.baixados) partes.push(`${reparo.baixados} foram dados como recebidos (${money(reparo.valorBaixado)})`);
      ok(`Títulos relidos do arquivo: ${partes.join(' e ')}.`);
      /* e fica no histórico: um aviso de rodapé passa, o número precisa ficar */
      await store.registrar('conserto', {
        alvo: 'Situações relidas do arquivo',
        de: `${reparo.mudados} títulos`,
        para: partes.join(' e '),
      });
    }
  } catch (err) {
    console.error(err);
    raiz.innerHTML = `<div class="boot"><div class="boot__logo">AMPLA</div>
      <p class="boot__msg">Não foi possível abrir o aplicativo.<br><span class="mini">${String(err.message || err)}</span></p></div>`;
  }
}

/**
 * A BUSCA AUTOMÁTICA DA ABERTURA.
 *
 * Roda SOLTA, depois da tela já estar de pé: a sincronização é um extra, e app
 * que não abre porque a internet caiu não serve para nada. E ela só BUSCA —
 * enviar é sempre no botão, para abrir o app no celular nunca sobrescrever o
 * que foi feito no computador.
 */
async function buscarDaNuvemSePreciso() {
  try {
    const { sincronizarAoAbrir } = await import('./ui/nuvem-ui.js');
    const r = await sincronizarAoAbrir();
    if (r.acao === 'buscou') {
      const { ok } = await import('./ui/components/toast.js');
      const { refresh } = await import('./core/router.js');
      await atualizarAlertas();
      ok(`Base atualizada da nuvem${r.de ? ` (do ${r.de})` : ''} — ${r.registros} registros.`);
      refresh();
    } else if (r.acao === 'conflito') {
      const { erro } = await import('./ui/components/toast.js');
      erro('A nuvem e este aparelho mudaram os dois. Veja em Ajustes qual versão vale.');
    }
  } catch { /* sem rede, sem login, sem nuvem: o app continua inteiro */ }
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = new URL('../sw.js', import.meta.url);
  navigator.serviceWorker.register(sw.href, { scope: new URL('../', import.meta.url).href })
    .catch(() => { /* funcionar offline é um extra, não um requisito */ });
}

iniciar();
