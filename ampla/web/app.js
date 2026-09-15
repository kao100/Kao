/**
 * Painel Ampla Dados.
 * Módulo ES nativo: sem build, sem bundler, sem dependência externa.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/painel/api${caminho}`, {
    credentials: 'same-origin',
    headers: opcoes.body ? { 'content-type': 'application/json' } : {},
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.mensagem || `Erro ${resposta.status}`);
  return dados;
}

const reais = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (valor) => Number(valor || 0).toLocaleString('pt-BR');
const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR');

// --- Login ------------------------------------------------------------------

$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = new FormData(evento.target);
  const erro = $('#erro-login');
  erro.hidden = true;
  try {
    await api('/login', { method: 'POST', body: { email: form.get('email'), senha: form.get('senha') } });
    await entrar();
  } catch (e) {
    erro.textContent = e.message;
    erro.hidden = false;
  }
});

$('#btn-sair').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

async function entrar() {
  const { usuario } = await api('/eu');
  $('#nome-usuario').textContent = `${usuario.nome} · ${usuario.papel}`;
  $('#login').hidden = true;
  $('#app').hidden = false;
  await carregarResumo();
}

// --- Abas -------------------------------------------------------------------

const carregadores = {
  resumo: carregarResumo,
  fontes: carregarFontes,
  chaves: carregarChaves,
  auditoria: carregarAuditoria,
  consultar: async () => {},
};

$$('.abas button').forEach((botao) => {
  botao.addEventListener('click', async () => {
    const aba = botao.dataset.aba;
    $$('.abas button').forEach((b) => b.classList.toggle('ativa', b === botao));
    $$('[data-painel]').forEach((p) => (p.hidden = p.dataset.painel !== aba));
    await carregadores[aba]();
  });
});

// --- Resumo -----------------------------------------------------------------

async function carregarResumo() {
  const r = await api('/resumo');

  const resolvidasSemRede =
    (r.porOrigem.find((o) => o.origem === 'cache')?.total ?? 0);

  $('#cartoes-resumo').innerHTML = `
    ${metrica('Consultas hoje', numero(r.hoje), '')}
    ${metrica('Últimos 30 dias', numero(r.mes), `${numero(resolvidasSemRede)} vieram do cache`)}
    ${metrica('Custo real', reais(r.custoRealCentavos), 'o que saiu de fonte paga')}
    ${metrica(
      'Economia no período',
      reais(r.economiaCentavos),
      `contra ${reais(r.custoSeCompradoCentavos)} comprando pronto`,
      true,
    )}
    ${metrica('Latência média', `${numero(r.latenciaMediaMs)} ms`, '')}
  `;

  $('#grafico-serie').innerHTML = desenharSerie(r.serie);
  $('#grafico-origem').innerHTML = desenharBarras(
    r.porOrigem.map((o) => ({
      rotulo: { cache: 'cache', fonte: 'fonte', nenhuma: 'sem retorno' }[o.origem] ?? o.origem,
      valor: o.total,
    })),
  );

  $('#tabela-produtos').innerHTML = r.porProduto.length
    ? `<div class="rolagem"><table>
        <thead><tr><th>Produto</th><th class="num">Consultas</th><th class="num">Custo</th></tr></thead>
        <tbody>${r.porProduto
          .map(
            (p) =>
              `<tr><td>${escapar(p.produto)}</td><td class="num">${numero(p.total)}</td><td class="num">${reais(p.custo ?? 0)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
    : '<p class="vazio">Nenhuma consulta registrada ainda.</p>';
}

function metrica(rotulo, valor, detalhe, destaque = false) {
  return `<div class="metrica ${destaque ? 'destaque' : ''}">
    <div class="rotulo">${escapar(rotulo)}</div>
    <div class="valor">${escapar(valor)}</div>
    ${detalhe ? `<div class="detalhe">${escapar(detalhe)}</div>` : ''}
  </div>`;
}

/** Gráfico de linha em SVG puro — não vale importar biblioteca para isto. */
function desenharSerie(serie) {
  if (!serie.length) return '<p class="vazio">Sem dados no período.</p>';
  // Um único dia não é uma série: desenhar linha aqui daria um bloco cheio,
  // que sugere um histórico que ainda não existe.
  if (serie.length === 1) {
    return `<p class="vazio">Só há dados de um dia (${escapar(serie[0].dia)}):
      <strong>${numero(serie[0].total)}</strong> consultas. O gráfico aparece a partir do segundo dia.</p>`;
  }

  const largura = 100;
  const altura = 100;
  // 15% de folga no topo para o pico não encostar na borda do cartão.
  const maximo = Math.max(...serie.map((p) => p.total), 1) * 1.15;
  const pontos = serie.map((p, i) => {
    const x = (i / (serie.length - 1)) * largura;
    const y = altura - (p.total / maximo) * altura;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const pico = Math.max(...serie.map((p) => p.total));

  return `<svg viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" role="img"
              aria-label="Consultas por dia nos últimos 30 dias">
    <polygon points="0,${altura} ${pontos.join(' ')} ${largura},${altura}" fill="var(--destaque)" opacity=".12"/>
    <polyline points="${pontos.join(' ')}" fill="none" stroke="var(--destaque)" stroke-width="1.5"
              vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>
  <p class="nota">Pico de ${numero(pico)} consultas em um dia.</p>`;
}

function desenharBarras(itens) {
  const total = itens.reduce((s, i) => s + Number(i.valor), 0) || 1;
  if (!itens.length) return '<p class="vazio">Sem dados.</p>';
  return itens
    .map(
      (i) => `<div class="barra-linha">
        <span>${escapar(i.rotulo)}</span>
        <span class="barra-trilho"><span class="barra-preenchida" style="width:${((i.valor / total) * 100).toFixed(1)}%"></span></span>
        <span class="fim">${numero(i.valor)}</span>
      </div>`,
    )
    .join('');
}

// --- Fontes -----------------------------------------------------------------

async function carregarFontes() {
  const { fontes } = await api('/fontes');
  const etiqueta = (f) => {
    if (!f.disponivel) {
      return f.motivo === 'fonte_desabilitada'
        ? '<span class="etiqueta off">desligada</span>'
        : `<span class="etiqueta alerta">${escapar(f.motivo)}</span>`;
    }
    return '<span class="etiqueta ok">ativa</span>';
  };
  const tipo = (f) =>
    f.tipoFonte === 'paga'
      ? '<span class="etiqueta paga">paga</span>'
      : `<span class="etiqueta off">${escapar(f.tipoFonte)}</span>`;

  $('#lista-fontes').innerHTML = `<div class="rolagem"><table>
    <thead><tr><th>#</th><th>Fonte</th><th>Produto</th><th>Tipo</th><th class="num">Custo</th><th>Estado</th></tr></thead>
    <tbody>${fontes
      .map(
        (f) => `<tr>
          <td class="num">${f.ordem}</td>
          <td><strong>${escapar(f.id)}</strong><br><span class="detalhe">${escapar(f.descricao)}</span>
              ${f.detalhe ? `<br><span class="detalhe">${escapar(f.detalhe)}</span>` : ''}</td>
          <td>${escapar(f.produto)}</td>
          <td>${tipo(f)}</td>
          <td class="num">${f.custoCentavos ? reais(f.custoCentavos) : 'grátis'}</td>
          <td>${etiqueta(f)}</td>
        </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

// --- Consulta manual --------------------------------------------------------

$('#form-consulta').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = new FormData(evento.target);
  const cartao = $('#cartao-resultado');
  const resumo = $('#resumo-resultado');
  cartao.hidden = false;
  resumo.innerHTML = '<p class="vazio">Consultando…</p>';
  $('#json-resultado').textContent = '';

  try {
    const r = await api('/consultar', {
      method: 'POST',
      body: {
        produto: form.get('produto'),
        valor: form.get('valor'),
        nome: form.get('nome') || undefined,
        finalidade: form.get('finalidade'),
        semFontePaga: form.get('semFontePaga') === 'on',
      },
    });
    resumo.innerHTML = resumirResultado(r);
    $('#json-resultado').textContent = JSON.stringify(r, null, 2);
  } catch (e) {
    resumo.innerHTML = `<p class="erro">${escapar(e.message)}</p>`;
  }
});

function resumirResultado(r) {
  const cabecalho = `
    <div class="cartoes">
      ${metrica('Encontrado', r.encontrado ? 'sim' : 'não', `origem: ${r.origem}`)}
      ${metrica('Custo', reais(r.custoTotalCentavos), r.custoTotalCentavos === 0 ? 'nenhuma fonte paga usada' : '')}
      ${metrica('Tempo', `${numero(r.latenciaTotalMs)} ms`, '')}
    </div>`;

  const fontes = r.fontes.length
    ? `<div class="rolagem"><table>
        <thead><tr><th>Fonte</th><th>Resultado</th><th class="num">ms</th></tr></thead>
        <tbody>${r.fontes
          .map(
            (f) =>
              `<tr><td>${escapar(f.fonte)}</td><td>${
                f.ok ? '<span class="etiqueta ok">respondeu</span>' : `<span class="etiqueta off">${escapar(f.motivo ?? '')}</span>`
              }${f.detalhe ? `<br><span class="detalhe">${escapar(f.detalhe)}</span>` : ''}</td><td class="num">${f.latenciaMs}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
    : '<p class="nota">Resposta veio do cache — nenhuma fonte foi consultada.</p>';

  let corpo = '';
  const d = r.dados;
  if (d && r.produto === 'cnpj') {
    corpo = `<h2 style="margin-top:16px">${escapar(d.razaoSocial)}</h2>
      <p class="nota">${escapar(d.cnpj)} · ${escapar(d.situacaoCadastral)} · ${escapar(d.porte ?? '')}</p>
      <p class="nota">${escapar([d.endereco.logradouro, d.endereco.numero, d.endereco.bairro, d.endereco.municipio, d.endereco.uf].filter(Boolean).join(', '))}</p>
      <p class="nota">${d.socios.length} sócio(s) · CNAE ${escapar(d.cnaePrincipal?.codigo ?? '—')} ${escapar(d.cnaePrincipal?.descricao ?? '')}</p>`;
  } else if (d && r.produto === 'compliance') {
    corpo = `<div class="alerta-caixa"><strong>Resumo</strong><ul>${d.alertas
      .map((a) => `<li>${escapar(a)}</li>`)
      .join('')}</ul></div>`;
  } else if (d && r.produto === 'cpf') {
    const faltando = d.camposIndisponiveis?.length
      ? `<div class="alerta-caixa">Campos que exigem fonte paga e não foram preenchidos:
          <strong>${escapar(d.camposIndisponiveis.join(', '))}</strong>.</div>`
      : '';
    corpo = `<p class="nota">CPF ${escapar(d.cpf)} — ${d.valido ? 'válido' : 'inválido'}.
      ${d.participacoesSocietarias.length} vínculo(s) societário(s) confirmado(s).</p>${faltando}`;
  }

  return cabecalho + corpo + '<h2 style="margin-top:18px">Cascata</h2>' + fontes;
}

// --- Chaves -----------------------------------------------------------------

$('#form-chave').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = new FormData(evento.target);
  try {
    const r = await api('/chaves', {
      method: 'POST',
      body: {
        nome: form.get('nome'),
        ambiente: form.get('ambiente'),
        limiteDiario: Number(form.get('limiteDiario')),
      },
    });
    const caixa = $('#chave-nova');
    caixa.hidden = false;
    caixa.className = 'chave-revelada';
    caixa.innerHTML = `<strong>${escapar(r.aviso)}</strong><code>${escapar(r.chave)}</code>`;
    evento.target.reset();
    await carregarChaves();
  } catch (e) {
    alert(e.message);
  }
});

async function carregarChaves() {
  const { chaves } = await api('/chaves');
  $('#lista-chaves').innerHTML = chaves.length
    ? `<div class="rolagem"><table>
        <thead><tr><th>Nome</th><th>Prefixo</th><th>Ambiente</th><th class="num">Limite/dia</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
        <tbody>${chaves
          .map(
            (c) => `<tr>
              <td>${escapar(c.nome)}</td>
              <td><code>${escapar(c.prefixo)}…</code></td>
              <td>${escapar(c.ambiente)}</td>
              <td class="num">${numero(c.limite_diario)}</td>
              <td>${c.ultimo_uso_em ? dataHora(c.ultimo_uso_em) : '—'}</td>
              <td>${c.ativo ? '<span class="etiqueta ok">ativa</span>' : '<span class="etiqueta off">revogada</span>'}</td>
              <td>${c.ativo ? `<button class="secundario" data-revogar="${c.id}">revogar</button>` : ''}</td>
            </tr>`,
          )
          .join('')}</tbody></table></div>`
    : '<p class="vazio">Nenhuma chave criada.</p>';

  $$('[data-revogar]').forEach((botao) =>
    botao.addEventListener('click', async () => {
      if (!confirm('Revogar esta chave? Os sistemas que a usam param de funcionar na hora.')) return;
      await api(`/chaves/${botao.dataset.revogar}`, { method: 'DELETE' });
      await carregarChaves();
    }),
  );
}

// --- Auditoria --------------------------------------------------------------

$('#btn-filtrar').addEventListener('click', () => carregarAuditoria());

async function carregarAuditoria() {
  const parametros = new URLSearchParams();
  if ($('#filtro-documento').value.trim()) parametros.set('documento', $('#filtro-documento').value.trim());
  if ($('#filtro-produto').value) parametros.set('produto', $('#filtro-produto').value);

  const { consultas } = await api(`/consultas?${parametros}`);
  $('#lista-auditoria').innerHTML = consultas.length
    ? `<div class="rolagem"><table>
        <thead><tr><th>Quando</th><th>Produto</th><th>Documento</th><th>Finalidade</th><th>Quem</th><th>Origem</th><th class="num">ms</th><th class="num">Custo</th></tr></thead>
        <tbody>${consultas
          .map(
            (c) => `<tr>
              <td>${dataHora(c.criado_em)}</td>
              <td>${escapar(c.produto)}</td>
              <td>${escapar(c.documento)}</td>
              <td>${escapar(c.finalidade)}</td>
              <td>${escapar(c.usuario_nome || c.chave_nome || '—')}</td>
              <td>${escapar(c.origem)}</td>
              <td class="num">${c.latencia_ms}</td>
              <td class="num">${reais(c.custo_centavos)}</td>
            </tr>`,
          )
          .join('')}</tbody></table></div>`
    : '<p class="vazio">Nenhuma consulta registrada.</p>';
}

// --- Início -----------------------------------------------------------------

entrar().catch(() => {
  $('#login').hidden = false;
});
