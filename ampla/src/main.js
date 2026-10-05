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
import { montarShell, aoTrocarRota, atualizarAlertas } from './ui/shell.js';
import { semear } from './data/seed.js';

import { telaEmpresa } from './ui/views/empresa.js';
import { telaDiario } from './ui/views/diario.js';
import { telaCaixa, telaSimulacao } from './ui/views/caixa.js';
import { telaCobranca } from './ui/views/cobranca.js';
import { telaComercial, telaVendedor } from './ui/views/comercial.js';
import { telaProdutos, telaProduto } from './ui/views/produtos.js';
import { telaComissoes } from './ui/views/comissoes.js';
import { telaPagar } from './ui/views/pagar.js';
import { telaReceber } from './ui/views/receber.js';
import { telaBancos } from './ui/views/bancos.js';
import { telaConciliacao, telaVendedores } from './ui/views/conciliacao.js';
import { telaRt } from './ui/views/rt.js';
import { telaArquivos, telaImportar } from './ui/views/arquivos.js';
import { telaAjustes } from './ui/views/ajustes.js';
import { telaFechamento } from './ui/views/fechamento.js';
import { telaOrcamentos } from './ui/views/orcamentos.js';
import { telaClientes, telaCliente } from './ui/views/clientes.js';
import { telaMargem } from './ui/views/margem.js';

const ROTAS = [
  { path: '/', view: telaDiario, titulo: 'Relatório' },
  { path: '/diario', view: telaDiario, titulo: 'Relatório' },
  { path: '/empresa', view: telaEmpresa, titulo: 'Visão da empresa' },
  { path: '/caixa', view: telaCaixa, titulo: 'Fluxo de caixa' },
  { path: '/caixa/simulacao', view: telaSimulacao, titulo: 'Simulação de cenários' },
  { path: '/cobranca', view: telaCobranca, titulo: 'Inadimplência' },
  { path: '/comercial', view: telaComercial, titulo: 'Comercial' },
  { path: '/comercial/:id', view: telaVendedor, titulo: 'Vendedor' },
  { path: '/orcamentos', view: telaOrcamentos, titulo: 'Orçamentos' },
  { path: '/clientes', view: telaClientes, titulo: 'Clientes' },
  { path: '/clientes/detalhe', view: telaCliente, titulo: 'Cliente' },
  { path: '/margem', view: telaMargem, titulo: 'Margem e frete' },
  { path: '/produtos', view: telaProdutos, titulo: 'Produtos e curva ABC' },
  { path: '/produtos/:id', view: telaProduto, titulo: 'Produto' },
  { path: '/comissoes', view: telaComissoes, titulo: 'Comissões' },
  { path: '/pagar', view: telaPagar, titulo: 'Contas a pagar' },
  { path: '/receber', view: telaReceber, titulo: 'Contas a receber' },
  { path: '/bancos', view: telaBancos, titulo: 'Bancos e extrato' },
  { path: '/rt', view: telaRt, titulo: 'RT (indicação)' },
  { path: '/conciliacao', view: telaConciliacao, titulo: 'Conciliação' },
  { path: '/conciliacao/vendedores', view: telaVendedores, titulo: 'De quem foi esta venda?' },
  { path: '/fechamento', view: telaFechamento, titulo: 'Pasta do mês' },
  { path: '/arquivos', view: telaArquivos, titulo: 'Relatórios que você manda' },
  { path: '/arquivos/:fonte', view: telaImportar, titulo: 'Mandar relatório' },
  { path: '/ajustes', view: telaAjustes, titulo: 'Ajustes' },
];

async function iniciar() {
  const raiz = document.getElementById('app-root');
  try {
    // recomeço pedido pela empresa: apaga tudo o que já foi importado, uma vez
    // só por marca. Vem antes da migração para o banco antigo não trazer tudo
    // de volta.
    const recomeco = await reiniciarSePreciso();
    const migracao = recomeco.reiniciou ? { migrou: false } : await migrarDoNomeAntigo();
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
