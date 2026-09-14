/**
 * RELATÓRIOS (item 17 do projeto)
 *
 * PDF: para reunião, vendedor e compartilhamento — montado como página de
 *      impressão, com cabeçalho, indicadores e tabelas limpas (não é uma
 *      tabela gigante jogada no papel).
 * Excel: para análise e conferência — .xlsx de verdade, com moeda, data e
 *      percentual no tipo certo, filtro e cabeçalho congelado.
 */

import { h } from '../core/dom.js';
import { buildXlsx } from '../core/files/xlsxw.js';
import { download } from '../core/util.js';
import { money, pct, num, formatDate, timestampLabel, today } from '../core/format.js';

/* -------------------------------------------------------------------- Excel */

export function exportarExcel(nomeArquivo, planilhas) {
  const blob = buildXlsx(planilhas);
  download(`${limparNome(nomeArquivo)}.xlsx`, blob);
}

function limparNome(nome) {
  return String(nome).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}

/* ---------------------------------------------------------------------- PDF */

/**
 * Monta a folha e chama a impressão do sistema (o usuário escolhe
 * "Salvar em PDF"). Funciona no iPhone, no Mac e no Windows sem dependência.
 *
 * @param {object} relatorio
 * @param {string} relatorio.titulo
 * @param {string} [relatorio.subtitulo]
 * @param {Array}  relatorio.blocos  ver montarBloco()
 */
export function imprimir({ titulo, subtitulo, periodo, blocos = [], rodape }) {
  const raiz = document.getElementById('print-root');
  if (!raiz) return;

  raiz.replaceChildren(h('div.folha',
    h('header.folha__topo',
      h('div',
        h('div.folha__empresa',
          h('svg', { viewBox: '0 0 100 51.45', width: 26, height: 13, 'aria-hidden': 'true' },
            h('path', { d: 'M50 0 L100 34.91 L100 51.45 L50 21.64 L0 51.45 L0 34.91 Z', fill: '#0044B9' })),
          h('span', 'AMPLA')),
        h('h1.folha__titulo', titulo),
        subtitulo && h('p.folha__subtitulo', subtitulo)),
      h('div.folha__meta',
        periodo && h('div', periodo),
        h('div', `Emitido em ${timestampLabel(Date.now())}`))),
    ...blocos.filter(Boolean).map(montarBloco),
    h('footer.folha__rodape',
      rodape || 'Documento gerado pelo aplicativo de gestão administrativa da AMPLA.')));

  document.body.classList.add('imprimindo');
  const limpar = () => {
    document.body.classList.remove('imprimindo');
    raiz.replaceChildren();
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  setTimeout(() => window.print(), 60);
}

function montarBloco(bloco) {
  if (bloco.tipo === 'kpis') {
    return h('section.folha__kpis',
      ...bloco.itens.map((kpi) => h('div.folha__kpi',
        h('span.folha__kpi-label', kpi.label),
        h('strong.folha__kpi-valor', kpi.valor),
        kpi.nota && h('span.folha__kpi-nota', kpi.nota))));
  }

  if (bloco.tipo === 'texto') {
    return h('section.folha__secao',
      bloco.titulo && h('h2', bloco.titulo),
      h('p.folha__texto', bloco.texto));
  }

  if (bloco.tipo === 'barras') {
    const maior = Math.max(...bloco.itens.map((i) => Math.abs(i.valor)), 1);
    return h('section.folha__secao',
      bloco.titulo && h('h2', bloco.titulo),
      h('div.folha__barras', ...bloco.itens.map((item) => h('div.folha__barra',
        h('span.folha__barra-nome', item.nome),
        h('span.folha__barra-trilho',
          h('span.folha__barra-preenchida', { style: { width: `${(Math.abs(item.valor) / maior) * 100}%` } })),
        h('span.folha__barra-valor', item.rotulo || money(item.valor))))));
  }

  // tabela — o total vai no tfoot da MESMA tabela, senão as colunas não alinham
  return h('section.folha__secao',
    bloco.titulo && h('h2', bloco.titulo),
    h('table.folha__tabela',
      h('thead', h('tr', ...bloco.colunas.map((c) => h(`th${c.alinhar === 'direita' ? '.dir' : ''}`, c.header)))),
      h('tbody', ...bloco.linhas.map((linha) => h('tr',
        ...bloco.colunas.map((c) => h(
          `td${c.alinhar === 'direita' ? '.dir' : ''}`,
          formatarCelula(linha[c.key], c.tipo),
        ))))),
      bloco.total && h('tfoot', h('tr.folha__total-linha',
        ...bloco.colunas.map((c) => h(
          `td${c.alinhar === 'direita' ? '.dir' : ''}`,
          bloco.total[c.key] == null ? '' : formatarCelula(bloco.total[c.key], c.tipo),
        ))))));
}

function formatarCelula(valor, tipo) {
  if (valor == null || valor === '') return '—';
  if (tipo === 'money') return money(valor);
  if (tipo === 'pct') return pct(valor);
  if (tipo === 'date') return formatDate(valor);
  if (tipo === 'num') return num(valor, 2);
  if (tipo === 'int') return num(valor, 0);
  return String(valor);
}

/* ------------------------------------------------------- atalhos de colunas */

/** Converte as colunas de uma tabela da tela em colunas de Excel. */
export function colunasExcel(colunas) {
  return colunas.map((c) => ({ header: c.header, key: c.key, type: c.tipo || 'text', width: c.largura }));
}

export function nomeArquivoPadrao(base, periodo) {
  const sufixo = periodo?.de && periodo?.ate
    ? `${periodo.de}_a_${periodo.ate}`
    : today();
  return `${base}_${sufixo}`;
}
