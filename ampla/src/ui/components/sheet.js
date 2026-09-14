/** Folha deslizante: detalhe, formulário e confirmação — sempre em poucos cliques. */

import { h } from '../../core/dom.js';

let aberta = null;

export function abrirFolha({ titulo, corpo, acoes, aoFechar }) {
  fechar();
  const fundo = h('div.sheet-fundo', {
    onClick: (e) => { if (e.target === fundo) fechar(); },
  });
  const folha = h('div.sheet',
    h('div.sheet__topo',
      h('h2', titulo),
      h('button.sheet__fechar', { onClick: () => fechar(), 'aria-label': 'Fechar' }, '✕')),
    h('div.sheet__corpo', corpo),
    acoes && h('div.sheet__rodape', acoes));
  fundo.appendChild(folha);
  document.getElementById('sheet-root').appendChild(fundo);
  aberta = { fundo, aoFechar };
  document.body.style.overflow = 'hidden';
  return fundo;
}

export function fechar() {
  if (!aberta) return;
  const { fundo, aoFechar } = aberta;
  aberta = null;
  fundo.remove();
  document.body.style.overflow = '';
  aoFechar?.();
}

/** Confirmação curta. Resolve true/false. */
export function confirmar({ titulo, texto, confirmar: rotulo = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    let decidido = false;
    const responder = (valor) => { decidido = true; fechar(); resolve(valor); };
    abrirFolha({
      titulo,
      corpo: h('p.dim', texto),
      acoes: [
        h('button.btn.btn--fantasma', { onClick: () => responder(false) }, 'Cancelar'),
        h(`button.btn.${perigo ? 'btn--perigo' : 'btn--primario'}`, { onClick: () => responder(true) }, rotulo),
      ],
      aoFechar: () => { if (!decidido) resolve(false); },
    });
  });
}

/**
 * Formulário rápido. `campos` é uma lista de
 * { chave, label, tipo: 'texto'|'numero'|'dinheiro'|'data'|'area'|'select'|'opcoes', opcoes, valor, obrigatorio, ajuda }
 * Resolve com os valores, ou null se cancelar.
 */
export function formulario({ titulo, campos, confirmar: rotulo = 'Salvar', descricao }) {
  return new Promise((resolve) => {
    const valores = {};
    let decidido = false;
    const erroEl = h('p.mini.ruim');

    const controles = campos.map((campo) => {
      valores[campo.chave] = campo.valor ?? (campo.tipo === 'opcoes' ? campo.opcoes?.[0]?.valor : '');

      let controle;
      if (campo.tipo === 'area') {
        controle = h('textarea.entrada', {
          placeholder: campo.placeholder || '',
          value: valores[campo.chave] || '',
          onInput: (e) => { valores[campo.chave] = e.target.value; },
        });
      } else if (campo.tipo === 'select') {
        controle = h('select.entrada', {
          onChange: (e) => { valores[campo.chave] = e.target.value; },
        }, ...(campo.opcoes || []).map((o) => h('option', {
          value: o.valor, selected: String(o.valor) === String(valores[campo.chave]),
        }, o.label)));
        if (campo.opcoes?.length) valores[campo.chave] = valores[campo.chave] || campo.opcoes[0].valor;
      } else if (campo.tipo === 'opcoes') {
        const botoes = (campo.opcoes || []).map((o) => h('button.opcao', {
          onClick: () => {
            valores[campo.chave] = o.valor;
            botoes.forEach((b, i) => b.classList.toggle('opcao--ativa', campo.opcoes[i].valor === o.valor));
            campo.aoMudar?.(o.valor);
          },
          class: o.valor === valores[campo.chave] ? 'opcao--ativa' : '',
        }, o.label));
        controle = h('div.opcoes', ...botoes);
      } else {
        const tipos = { numero: 'number', dinheiro: 'number', data: 'date' };
        controle = h('input.entrada', {
          type: tipos[campo.tipo] || 'text',
          inputmode: campo.tipo === 'dinheiro' || campo.tipo === 'numero' ? 'decimal' : undefined,
          step: campo.tipo === 'dinheiro' ? '0.01' : undefined,
          placeholder: campo.placeholder || '',
          value: valores[campo.chave] ?? '',
          onInput: (e) => { valores[campo.chave] = e.target.value; },
        });
      }

      return h('div.campo',
        h('label', campo.label, campo.obrigatorio && h('span.ruim', ' *')),
        controle,
        campo.ajuda && h('span.campo__ajuda', campo.ajuda));
    });

    const enviar = () => {
      const faltando = campos.filter((c) => c.obrigatorio && !String(valores[c.chave] ?? '').trim());
      if (faltando.length) {
        erroEl.textContent = `Falta preencher: ${faltando.map((c) => c.label).join(', ')}.`;
        return;
      }
      decidido = true;
      fechar();
      resolve(valores);
    };

    abrirFolha({
      titulo,
      corpo: h('div.empilha', { style: { gap: '12px' } },
        descricao && h('p.pequeno.muted', descricao),
        ...controles,
        erroEl),
      acoes: [
        h('button.btn.btn--fantasma', { onClick: () => fechar() }, 'Cancelar'),
        h('button.btn.btn--primario', { onClick: enviar }, rotulo),
      ],
      aoFechar: () => { if (!decidido) resolve(null); },
    });
  });
}

/** Folha só de leitura, com blocos já montados. */
export function detalhe(titulo, ...blocos) {
  return abrirFolha({
    titulo,
    corpo: h('div.empilha', { style: { gap: '12px' } }, ...blocos),
    acoes: [h('button.btn.btn--primario', { onClick: () => fechar() }, 'Fechar')],
  });
}

/** Lista de valores rótulo → valor, usada nos detalhes. */
export function linhas(pares) {
  return h('div.empilha', { style: { gap: '7px' } },
    ...pares.filter(Boolean).map(([rotulo, valor]) => h('div.linha.linha--entre',
      h('span.pequeno.muted', rotulo),
      h('span.pequeno.forte.num', valor ?? '—'))));
}
