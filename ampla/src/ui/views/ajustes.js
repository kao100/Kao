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
              v.ativo === false && selo('inativo', 'ruim'))),
          botao('Editar', { pequeno: true, onClick: () => editarVendedor(v) }))))
        : h('p.pequeno.muted', 'Nenhum vendedor ainda — eles aparecem sozinhos quando você importa os pedidos.')),
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
          + 'Eles aparecem à parte, e entram no caixa quando houver promessa de pagamento.'))))),

    secao('Quem está usando', null, card(null, null,
      h('div.linha.linha--entre',
        h('span.pequeno', 'Nome que assina os ajustes e as cobranças'),
        h('div.linha',
          h('span.forte', cfg.usuario || 'administração'),
          botao('Editar', { pequeno: true, onClick: () => editarUsuario(cfg) }))))),

    secao('Meus dados', null, card(null, null,
      h('p.pequeno.muted', 'Tudo fica no seu aparelho: nenhum número da empresa sai daqui. '
        + 'Exporte o backup antes de trocar de aparelho ou de endereço do app.'),
      h('div.btn-linha', { style: { marginTop: '10px' } },
        botao('⬇️ Exportar backup (JSON)', { onClick: () => exportarBackup() }),
        botao('⬆️ Importar backup', { onClick: () => importarBackup() }),
        botao('🔄 Refazer vínculos', { onClick: () => refazerVinculos() })),
      h('div.btn-linha', { style: { marginTop: '8px' } },
        botao('🗑️ Apagar movimentos', { tipo: 'perigo', onClick: () => limparMovimentos() })))),

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

async function exportarBackup() {
  const dados = {};
  for (const nome of Object.keys(db.STORES)) dados[nome] = await db.getAll(nome);
  const blob = new Blob([JSON.stringify({ app: 'ampla', versao: 1, em: Date.now(), dados }, null, 1)], { type: 'application/json' });
  download(`ampla_backup_${today()}.json`, blob);
  ok('Backup exportado.');
}

function importarBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const conteudo = JSON.parse(await arquivo.text());
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
    texto: 'Apaga notas, itens, pedidos, títulos, extrato e conciliações. '
      + 'Vendedores, contas bancárias, regras de comissão e ajustes continuam. Não dá para desfazer.',
    confirmar: 'Apagar tudo',
    perigo: true,
  });
  if (!confirmado) return;
  for (const nome of ['nfs', 'nfItens', 'pedidos', 'receber', 'pagar', 'extrato', 'saldos', 'cobrancas', 'pendencias', 'importacoes']) {
    await db.clearStore(nome);
  }
  await db.put('kv', { key: 'marcos', valor: {}, atualizadoEm: Date.now() });
  store.limparCache();
  await atualizarAlertas();
  ok('Movimentos apagados.');
  navigate('/');
}
