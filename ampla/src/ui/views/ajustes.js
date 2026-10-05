/**
 * AJUSTES
 * Metas, vendedores, contas, limites de caixa, backup e histórico de alterações.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as db from '../../core/db.js';
import { recalcular } from '../../logic/link.js';
import { definirTitulo, atualizarAlertas } from '../shell.js';
import { card, secao, botao, aviso, selo } from '../components/ui.js';
import { formulario, confirmar } from '../components/sheet.js';
import { ok, erro } from '../components/toast.js';
import { money, monthKey, monthLabel, today, addMonths, timestampLabel } from '../../core/format.js';
import { download } from '../../core/util.js';

export async function telaAjustes() {
  const [cfg, vendedores, contas, auditoria] = await Promise.all([
    store.config(), store.vendedores.listar(), store.contas.listar(), store.auditoria.listar(),
  ]);
  definirTitulo('Ajustes');

  const meses = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(today(), i - 1)));
  const historico = auditoria.sort((a, b) => b.momento - a.momento).slice(0, 40);

  return h('div.empilha', { style: { gap: '14px' } },
    secao('Metas de faturamento', null, card(null, null,
      h('div.empilha', { style: { gap: '8px' } },
        ...meses.map((mes) => h('div.linha.linha--entre',
          h('span.pequeno', monthLabel(mes)),
          h('div.linha',
            h('span.num.forte', money(cfg.metasPorMes?.[mes] ?? cfg.metaMensalPadrao)),
            botao('Editar', { pequeno: true, onClick: () => editarMeta(mes, cfg) })))),
        h('div.linha.linha--entre', { style: { borderTop: '1px solid var(--line)', paddingTop: '8px' } },
          h('span.pequeno.muted', 'Meta padrão (quando o mês não tem meta própria)'),
          h('div.linha',
            h('span.num.forte', money(cfg.metaMensalPadrao)),
            botao('Editar', { pequeno: true, onClick: () => editarMetaPadrao(cfg) })))))),

    secao('Vendedores', botao('+ Novo', { pequeno: true, onClick: () => editarVendedor(null) }),
      card(null, null, vendedores.length
        ? h('div.lista', ...vendedores.map((v) => h('div.item',
          h('div.item__corpo',
            h('div.item__titulo', v.nome),
            h('div.item__sub',
              v.codigo && h('span', `cód. ${v.codigo}`),
              v.apelidos?.length ? h('span', `também: ${v.apelidos.join(', ')}`) : h('span.muted', 'sem apelidos'),
              v.meta ? h('span', `meta ${money(v.meta)}`) : null,
              /**
               * O papel é decidido na CONCILIAÇÃO, em um toque, não aqui — "ir
               * em ajustes, vendedores, editar o papel é diferente para mim".
               * Aqui ele só aparece, para o cadastro não mentir.
               */
              v.naoVende && selo('só emite nota', 'atencao'),
              v.ativo === false && selo('inativo', 'ruim'))),
          botao('Editar', { pequeno: true, onClick: () => editarVendedor(v) }))))
        : h('p.pequeno.muted',
          'Nenhum vendedor ainda. Eles aparecem sozinhos quando você manda o relatório de '
          + 'comissão por venda — ou cadastre aqui, em "+ Novo", se quiser adiantar.')),
      aviso('Apelidos servem para o mesmo vendedor aparecer com nomes diferentes em arquivos diferentes '
        + '(ex.: "Eduardo" e "EDU"). Sem apelido, o app trata como duas pessoas — ele não junta por semelhança.', 'info')),

    secao('Contas bancárias', botao('Gerenciar', { pequeno: true, onClick: () => navigate('/bancos') }),
      card(null, null, h('div.lista', ...contas.map((c) => h('div.item',
        h('div.item__corpo',
          h('div.item__titulo', c.nome),
          h('div.item__sub', [c.agencia && `ag. ${c.agencia}`, c.numero && `c/c ${c.numero}`].filter(Boolean).join(' · ') || 'sem dados da conta'))))))),

    secao('Alertas de caixa', null, card(null, null,
      h('div.empilha', { style: { gap: '8px' } },
        h('div.linha.linha--entre',
          h('span.pequeno', '🟡 Avisar quando o saldo cair abaixo de'),
          h('div.linha', h('span.num.forte', money(cfg.caixa.alertaAtencao)),
            botao('Editar', { pequeno: true, onClick: () => editarAlerta('alertaAtencao', 'Saldo de atenção', cfg) }))),
        h('div.linha.linha--entre',
          h('span.pequeno', '🔴 Tratar como crítico abaixo de'),
          h('div.linha', h('span.num.forte', money(cfg.caixa.alertaCritico)),
            botao('Editar', { pequeno: true, onClick: () => editarAlerta('alertaCritico', 'Saldo crítico', cfg) })))))),

    secao('Projeção do caixa', null, card(null, null,
      h('button.check', {
        class: cfg.projecao.incluirVencidosSemPromessa ? 'check--marcado' : '',
        onClick: async () => {
          await store.salvarConfig({ projecao: { incluirVencidosSemPromessa: !cfg.projecao.incluirVencidosSemPromessa } });
          refresh();
        },
      },
      h('span.check__caixa', '✓'),
      h('div.crescer',
        h('div.pequeno.forte', 'Incluir títulos vencidos sem promessa na projeção'),
        h('div.mini.muted', 'Desligado (recomendado): o app não chuta quando o vencido vai entrar. '
          + 'Desligado, eles aparecem à parte: já venceram e não há data confiável para prever '
          + 'o recebimento. Ligado, entram no primeiro dia da projeção.'))))),

    secao('Quem está usando', null, card(null, null,
      h('div.linha.linha--entre',
        h('span.pequeno', 'Nome que assina os ajustes e as cobranças'),
        h('div.linha',
          h('span.forte', cfg.usuario || 'administração'),
          botao('Editar', { pequeno: true, onClick: () => editarUsuario(cfg) }))))),

    /**
     * O MESMO APP EM DOIS APARELHOS.
     *
     * "Enviamos os documentos pelo PC, mas não conseguimos ter a mesma visão
     *  quando entramos pelo celular."
     *
     * O app não tem servidor, e é isso que faz nenhum número desta empresa sair
     * do aparelho. O preço é que cada aparelho tem a sua base: o celular não
     * sabe o que o PC importou. A ponte é um arquivo, e o passo a passo fica
     * escrito aqui, porque é a pergunta que volta sempre.
     */
    secao('Levar para outro aparelho', null, card(null, null,
      h('p.pequeno.muted',
        'Os dados moram no aparelho — nenhum número da empresa sai daqui, e por isso o celular '
        + 'não enxerga o que você importou no computador. Para ver o mesmo no celular:'),
      h('div.empilha', { style: { gap: '6px', marginTop: '10px' } },
        h('p.pequeno', h('strong', '1.'), ' No computador, toque em ', h('strong', 'Exportar backup'),
          ' — sai um arquivo de menos de 1 MB.'),
        h('p.pequeno', h('strong', '2.'), ' Mande esse arquivo para você mesma: WhatsApp, e-mail, '
          + 'Google Drive, o que for mais rápido.'),
        h('p.pequeno', h('strong', '3.'), ' No celular, abra o app, venha em Ajustes e toque em ',
          h('strong', 'Importar backup'), '. Escolha o arquivo que você mandou.'),
        h('p.pequeno.muted', 'O celular passa a mostrar exatamente o que o computador mostra. '
          + 'Importou coisa nova no computador? Repita os três passos — o backup novo substitui o '
          + 'anterior inteiro, não mistura.')),
      h('div.btn-linha', { style: { marginTop: '12px' } },
        botao('⬇️ Exportar backup', { tipo: 'primario', onClick: () => exportarBackup() }),
        botao('⬆️ Importar backup', { onClick: () => importarBackup() }))),
    aviso('Vale para os dois lados: dá para importar no computador um backup feito no celular. '
      + 'Quem importa manda — o que estava no aparelho é substituído pelo backup inteiro.', 'info')),

    secao('Meus dados', null, card(null, null,
      h('p.pequeno.muted', 'Exporte o backup antes de trocar de aparelho ou de endereço do app.'),
      h('div.btn-linha', { style: { marginTop: '10px' } },
        botao('🔄 Refazer vínculos', { onClick: () => refazerVinculos() })),
      h('div.btn-linha', { style: { marginTop: '8px' } },
        botao('🗑️ Apagar tudo que veio de arquivo', { tipo: 'perigo', onClick: () => limparMovimentos() })))),

    secao('Histórico de alterações', null, card(null, null,
      historico.length
        ? h('div.empilha', { style: { gap: '7px' } }, ...historico.map((e) => h('div.aviso',
          h('div.crescer',
            h('strong.pequeno', `${rotuloAcao(e.acao)} — ${e.alvo || e.alvoId || ''}`),
            h('div.mini.muted',
              `${timestampLabel(e.momento)} · ${e.usuario}`,
              e.de != null || e.para != null ? ` · de ${formatarValor(e.de)} para ${formatarValor(e.para)}` : ''),
            e.motivo && h('div.mini', `"${e.motivo}"`)))))
        : h('p.pequeno.muted', 'Nenhuma alteração manual registrada ainda.'))),

    h('p.mini.muted.centro', { style: { padding: '10px 0 20px' } },
      'AMPLA — gestão administrativa · dados locais no aparelho'));
}

function formatarValor(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return money(v);
  return String(v);
}

function rotuloAcao(acao) {
  return {
    vendedor_da_nf: 'Vendedor definido na NF',
    conta_excluida: 'Conta bancária excluída',
    ajuste_comissao: 'Ajuste de comissão',
    ajuste_comissao_removido: 'Ajuste removido',
    status_comissao: 'Status das comissões',
    baixa_titulo: 'Baixa de título',
    baixa_pagamento: 'Pagamento registrado',
    prorrogacao: 'Prorrogação',
    conciliacao_manual: 'Conciliação manual',
    titulo_nf: 'Título vinculado à NF',
    pendencia_ignorada: 'Pendência ignorada',
    saldo_informado: 'Saldo informado',
    regra_comissao: 'Regra de comissão',
    meta: 'Meta alterada',
  }[acao] || acao;
}

/* ------------------------------------------------------------------ edições */

async function editarMeta(mes, cfg) {
  const r = await formulario({
    titulo: `Meta de ${monthLabel(mes)}`,
    campos: [{ chave: 'meta', label: 'Meta de faturamento', tipo: 'dinheiro', obrigatorio: true, valor: cfg.metasPorMes?.[mes] ?? cfg.metaMensalPadrao }],
  });
  if (!r) return;
  await store.salvarConfig({ metasPorMes: { ...(cfg.metasPorMes || {}), [mes]: Number(r.meta) } });
  await store.registrar('meta', { alvoId: mes, alvo: `Meta ${mes}`, de: cfg.metasPorMes?.[mes], para: Number(r.meta) });
  ok('Meta salva.');
  refresh();
}

async function editarMetaPadrao(cfg) {
  const r = await formulario({
    titulo: 'Meta padrão',
    descricao: 'Usada nos meses que não têm meta própria.',
    campos: [{ chave: 'meta', label: 'Meta mensal', tipo: 'dinheiro', obrigatorio: true, valor: cfg.metaMensalPadrao }],
  });
  if (!r) return;
  await store.salvarConfig({ metaMensalPadrao: Number(r.meta) });
  ok('Meta padrão salva.');
  refresh();
}

async function editarAlerta(chave, titulo, cfg) {
  const r = await formulario({
    titulo,
    campos: [{ chave: 'valor', label: 'Valor', tipo: 'dinheiro', obrigatorio: true, valor: cfg.caixa[chave] }],
  });
  if (!r) return;
  await store.salvarConfig({ caixa: { [chave]: Number(r.valor) } });
  ok('Alerta atualizado.');
  refresh();
}

async function editarUsuario(cfg) {
  const r = await formulario({
    titulo: 'Quem está usando',
    campos: [{ chave: 'usuario', label: 'Nome', tipo: 'texto', obrigatorio: true, valor: cfg.usuario || '' }],
  });
  if (!r) return;
  await store.salvarConfig({ usuario: r.usuario });
  ok('Nome salvo.');
  refresh();
}

async function editarVendedor(vendedor) {
  const r = await formulario({
    titulo: vendedor ? `Editar ${vendedor.nome}` : 'Novo vendedor',
    campos: [
      { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true, valor: vendedor?.nome || '' },
      { chave: 'codigo', label: 'Código no sistema', tipo: 'texto', valor: vendedor?.codigo || '' },
      {
        chave: 'apelidos',
        label: 'Como aparece nos arquivos',
        tipo: 'texto',
        valor: (vendedor?.apelidos || []).join(', '),
        ajuda: 'Separe por vírgula. Ex.: EDU, Eduardo S.',
      },
      { chave: 'meta', label: 'Meta mensal', tipo: 'dinheiro', valor: vendedor?.meta ?? '' },
      {
        chave: 'ativo',
        label: 'Situação',
        tipo: 'opcoes',
        valor: vendedor?.ativo === false ? 'nao' : 'sim',
        opcoes: [{ valor: 'sim', label: 'Ativo' }, { valor: 'nao', label: 'Inativo' }],
      },
    ],
  });
  if (!r) return;
  await store.vendedores.salvar({
    ...(vendedor || {}),
    id: vendedor?.id,
    nome: r.nome,
    codigo: r.codigo || null,
    apelidos: r.apelidos ? r.apelidos.split(',').map((s) => s.trim()).filter(Boolean) : [],
    meta: r.meta ? Number(r.meta) : null,
    ativo: r.ativo !== 'nao',
  });
  await recalcular();
  ok('Vendedor salvo.');
  refresh();
}

/* ------------------------------------------------------------------- dados */

/**
 * O BACKUP É O QUE LEVA OS DADOS DE UM APARELHO PARA O OUTRO.
 *
 * "Enviamos os documentos pelo PC, mas os relatórios não estamos conseguindo
 *  ter a mesma visão quando entramos pelo celular."
 *
 * Não existe servidor: os dados moram no navegador de cada aparelho, e é isso
 * que faz nenhum número desta empresa sair do aparelho. O preço disso é que o
 * celular não sabe o que o PC importou — e a ponte é este arquivo.
 *
 * ELE SAI COMPRIMIDO. A base dela dá 7,2 MB em JSON puro, o que já trava e-mail
 * e WhatsApp; comprimida dá 590 KB, que vai por qualquer lugar. Num navegador
 * sem CompressionStream, sai o JSON mesmo — grande, mas funcionando.
 */
async function exportarBackup() {
  const dados = {};
  for (const nome of Object.keys(db.STORES)) dados[nome] = await db.getAll(nome);
  const texto = JSON.stringify({ app: 'ampla', versao: 1, em: Date.now(), dados });

  if (typeof CompressionStream !== 'function') {
    download(`ampla_backup_${today()}.json`, new Blob([texto], { type: 'application/json' }));
    ok('Backup exportado.');
    return;
  }
  const comprimido = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(comprimido).blob();
  download(`ampla_backup_${today()}.json.gz`, new Blob([blob], { type: 'application/gzip' }));
  ok(`Backup exportado — ${Math.max(1, Math.round(blob.size / 1024))} KB.`);
}

/**
 * Lê o backup comprimido ou o JSON puro — e decide pelos BYTES, não pelo nome.
 * Arquivo que passeia por WhatsApp e Downloads troca de nome no caminho; os dois
 * primeiros bytes de um .gz, não.
 */
async function lerBackup(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const ehGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!ehGzip) return new TextDecoder().decode(buffer);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador não abre backup comprimido. Abra pelo Chrome ou Safari recente.');
  }
  const fluxo = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

function importarBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  // sem accept estreito: no iPhone ele esconde o arquivo que veio do WhatsApp
  /**
   * O INPUT PRECISA ESTAR NA PÁGINA para o iPhone abrir o seletor de arquivos.
   * Solto na memória, o clique não faz nada em algumas versões do Safari — o
   * mesmo motivo pelo qual o download põe o link no documento antes de clicar.
   */
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  const limpar = () => input.remove();
  input.onchange = async () => {
    const arquivo = input.files[0];
    if (!arquivo) { limpar(); return; }
    try {
      const conteudo = JSON.parse(await lerBackup(arquivo));
      if (conteudo.app !== 'ampla') throw new Error('Este arquivo não é um backup do aplicativo.');
      const confirmado = await confirmar({
        titulo: 'Substituir os dados atuais?',
        texto: 'Tudo que está no aparelho será substituído pelo conteúdo do backup.',
        confirmar: 'Substituir',
        perigo: true,
      });
      if (!confirmado) return;
      for (const [nome, registros] of Object.entries(conteudo.dados)) {
        if (!db.STORES[nome]) continue;
        await db.clearStore(nome);
        await db.putMany(nome, registros);
      }
      store.limparCache();
      await recalcular();
      await atualizarAlertas();
      ok('Backup restaurado.');
      navigate('/');
    } catch (e) {
      erro(e.message);
    } finally {
      limpar();
    }
  };
  input.click();
}

async function refazerVinculos() {
  const r = await recalcular();
  await atualizarAlertas();
  ok(`Pronto — ${r.pendencias} pendência(s) aberta(s).`);
}

async function limparMovimentos() {
  const confirmado = await confirmar({
    titulo: 'Apagar movimentos importados?',
    texto: 'Apaga TUDO o que veio de arquivo: notas, itens, pedidos, orçamentos, títulos, '
      + 'extrato, produtos, clientes, fretes e os relatórios de comissão e de produtos vendidos. '
      + 'Fica de pé o que você decidiu aqui dentro: vendedores (com apelidos e papéis), quem '
      + 'entrega, quem recebe RT, contas bancárias, regras de comissão e o histórico. '
      + 'Não dá para desfazer.',
    confirmar: 'Apagar tudo',
    perigo: true,
  });
  if (!confirmado) return;
  /**
   * O QUE SAI E O QUE FICA.
   *
   * "Apagar os arquivos que eu tinha te enviado até então e reenviar tudo de
   *  novo, para ver com todas essas alterações se está correto."
   *
   * Sai tudo que veio de arquivo — senão sobra registro de importação antiga
   * misturado com o reenvio, e o teste não prova nada. Fica o que ela decidiu
   * DENTRO do app: vendedor com apelido e papel, quem entrega o quê, quem recebe
   * RT, conta bancária, regra de comissão. Reapagar isso faria ela refazer à mão
   * o trabalho que já deu certo.
   */
  for (const nome of [
    'nfs', 'nfItens', 'pedidos', 'orcamentos', 'receber', 'pagar', 'extrato', 'saldos',
    'cobrancas', 'pendencias', 'importacoes', 'comissoesRelatorio', 'vendasProduto', 'fretes',
    'clientes', 'produtos', 'fornecedores', 'periodosComissao',
  ]) {
    await db.clearStore(nome);
  }
  await db.put('kv', { key: 'marcos', valor: {}, atualizadoEm: Date.now() });
  store.limparCache();
  await atualizarAlertas();
  ok('Movimentos apagados.');
  navigate('/');
}
