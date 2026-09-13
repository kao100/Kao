/** Tabela com formatação por tipo e exportação para PDF/Excel no cabeçalho. */

import { h } from '../../core/dom.js';
import { money, pct, num, formatDate } from '../../core/format.js';
import { exportarExcel, imprimir, colunasExcel } from '../../logic/reports.js';

/**
 * @param {object} opcoes
 * @param {Array<{header, key, tipo, alinhar, formatar}>} opcoes.colunas
 * @param {Array<object>} opcoes.linhas
 * @param {object} [opcoes.total]
 * @param {function} [opcoes.aoClicar]
 */
export function tabela({ colunas, linhas, total, aoClicar, vazio = 'Sem registros.' }) {
  if (!linhas.length) return h('p.pequeno.muted.centro', { style: { padding: '18px 0' } }, vazio);
  return h('div.tabela-rolagem',
    h('table.tabela',
      h('thead', h('tr', ...colunas.map((c) => h(`th${c.alinhar === 'direita' ? '.dir' : ''}`, c.header)))),
      h('tbody', ...linhas.map((linha) => h(`tr${aoClicar ? '.clicavel' : ''}`,
        { onClick: aoClicar ? () => aoClicar(linha) : undefined },
        ...colunas.map((c) => h(
          `td${c.alinhar === 'direita' ? '.dir' : ''}${ehNumero(c.tipo) ? '.num' : ''}`,
          c.formatar ? c.formatar(linha[c.key], linha) : formatar(linha[c.key], c.tipo),
        )))),),
      total && h('tfoot', h('tr', ...colunas.map((c) => h(
        `td${c.alinhar === 'direita' ? '.dir' : ''}${ehNumero(c.tipo) ? '.num' : ''}`,
        total[c.key] == null ? '' : formatar(total[c.key], c.tipo),
      ))))));
}

function ehNumero(tipo) {
  return ['money', 'num', 'int', 'pct'].includes(tipo);
}

export function formatar(valor, tipo) {
  if (valor == null || valor === '') return '—';
  if (tipo === 'money') return money(valor);
  if (tipo === 'pct') return pct(valor);
  if (tipo === 'date') return formatDate(valor);
  if (tipo === 'num') return num(valor, 2);
  if (tipo === 'int') return num(valor, 0);
  return String(valor);
}

/**
 * Botões [PDF] [EXCEL] — todo relatório relevante tem os dois (item 17).
 * @param {function} montar  devolve { titulo, subtitulo, periodo, colunas, linhas, total, blocos, nomeArquivo }
 */
export function exportadores(montar) {
  return h('div.btn-linha',
    h('button.btn.btn--pequeno', {
      onClick: () => {
        const r = montar();
        imprimir({
          titulo: r.titulo,
          subtitulo: r.subtitulo,
          periodo: r.periodo,
          blocos: r.blocos || [{ tipo: 'tabela', colunas: r.colunas, linhas: r.linhas, total: r.total }],
        });
      },
    }, '📄 PDF'),
    h('button.btn.btn--pequeno', {
      onClick: () => {
        const r = montar();
        exportarExcel(r.nomeArquivo || r.titulo, r.planilhas || [{
          name: r.titulo.slice(0, 28),
          title: r.subtitulo ? `${r.titulo} — ${r.subtitulo}` : r.titulo,
          columns: colunasExcel(r.colunas),
          rows: r.linhas,
          total: r.total,
        }]);
      },
    }, '📊 Excel'));
}
