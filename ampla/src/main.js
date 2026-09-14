/**
 * AMPLA — Gestão administrativa
 *
 * Abrir o aplicativo e saber como a empresa está.
 * Este arquivo só liga as peças: banco, rotas e service worker.
 */

import { defineRoutes, initRouter } from './core/router.js';
import { requestPersistence } from './core/db.js';
import { montarShell, aoTrocarRota, atualizarAlertas } from './ui/shell.js';
import { semear } from './data/seed.js';

import { telaEmpresa } from './ui/views/empresa.js';
import { telaCaixa, telaSimulacao } from './ui/views/caixa.js';
import { telaCobranca } from './ui/views/cobranca.js';
import { telaComercial, telaVendedor } from './ui/views/comercial.js';
import { telaProdutos, telaProduto } from './ui/views/produtos.js';
import { telaComissoes } from './ui/views/comissoes.js';
import { telaPagar } from './ui/views/pagar.js';
import { telaReceber } from './ui/views/receber.js';
import { telaBancos } from './ui/views/bancos.js';
import { telaConciliacao, telaVendedores } from './ui/views/conciliacao.js';
import { telaArquivos, telaImportar } from './ui/views/arquivos.js';
import { telaAjustes } from './ui/views/ajustes.js';

const ROTAS = [
  { path: '/', view: telaEmpresa, titulo: 'Visão da empresa' },
  { path: '/caixa', view: telaCaixa, titulo: 'Fluxo de caixa' },
  { path: '/caixa/simulacao', view: telaSimulacao, titulo: 'Simulação de cenários' },
  { path: '/cobranca', view: telaCobranca, titulo: 'Inadimplência e cobrança' },
  { path: '/comercial', view: telaComercial, titulo: 'Comercial' },
  { path: '/comercial/:id', view: telaVendedor, titulo: 'Vendedor' },
  { path: '/produtos', view: telaProdutos, titulo: 'Produtos e curva ABC' },
  { path: '/produtos/:id', view: telaProduto, titulo: 'Produto' },
  { path: '/comissoes', view: telaComissoes, titulo: 'Comissões' },
  { path: '/pagar', view: telaPagar, titulo: 'Contas a pagar' },
  { path: '/receber', view: telaReceber, titulo: 'Contas a receber' },
  { path: '/bancos', view: telaBancos, titulo: 'Bancos e extrato' },
  { path: '/conciliacao', view: telaConciliacao, titulo: 'Conciliação' },
  { path: '/conciliacao/vendedores', view: telaVendedores, titulo: 'Atribuir vendedores' },
  { path: '/arquivos', view: telaArquivos, titulo: 'Central de arquivos' },
  { path: '/arquivos/:fonte', view: telaImportar, titulo: 'Importar' },
  { path: '/ajustes', view: telaAjustes, titulo: 'Ajustes' },
];

async function iniciar() {
  const raiz = document.getElementById('app-root');
  try {
    await semear();
    const outlet = montarShell(raiz);
    defineRoutes(ROTAS);
    await initRouter(outlet, { after: aoTrocarRota });
    atualizarAlertas();
    requestPersistence();
    registrarServiceWorker();
  } catch (err) {
    console.error(err);
    raiz.innerHTML = `<div class="boot"><div class="boot__logo">AMPLA</div>
      <p class="boot__msg">Não foi possível abrir o aplicativo.<br><span class="mini">${String(err.message || err)}</span></p></div>`;
  }
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = new URL('../sw.js', import.meta.url);
  navigator.serviceWorker.register(sw.href, { scope: new URL('../', import.meta.url).href })
    .catch(() => { /* funcionar offline é um extra, não um requisito */ });
}

iniciar();
