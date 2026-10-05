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
import { formulario, confirmar, detalhe } from '../components/sheet.js';
import { ok, erro } from '../components/toast.js';
import { money, monthKey, monthLabel, today, addMonths, timestampLabel } from '../../core/format.js';
import * as backup from '../../logic/backup.js';
import * as nuvem from '../../logic/nuvem.js';
import { ligarNuvem, desligarNuvem, descreverEstadoNuvem, corDoEstado } from '../nuvem-ui.js';
import { download } from '../../core/util.js';

export async function telaAjustes() {
  await ligarNuvem();
  const [cfg, vendedores, contas, auditoria, nuvemEstado] = await Promise.all([
    store.config(), store.vendedores.listar(), store.contas.listar(), store.auditoria.listar(),
    nuvem.estado().catch((e) => ({ ligado: false, erro: e.message })),
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
     * SINCRONIZAÇÃO DE VERDADE.
     *
     * "Quero a sincronização de verdade. É exatamente isso que precisamos."
     *
     * A base vira um arquivo na conta Google DELA. Nenhum serviço no meio,
     * nenhuma fatura, e no dia em que ela quiser parar é apagar um arquivo do
     * próprio Drive. O app enxerga só esse arquivo — o escopo que o Google
     * concede aqui (drive.file) não dá acesso a mais nada do Drive dela.
     */
    secao('Sincronizar com o Google Drive',
      selo(nuvemEstado.ligado ? 'ligada' : 'desligada', corDoEstado(nuvemEstado)),
      card(null, null,
        h('p.pequeno', descreverEstadoNuvem(nuvemEstado)),
        nuvemEstado.remoto && h('p.mini.muted',
          `Na nuvem: ${Math.max(1, Math.round((nuvemEstado.remoto.tamanho || 0) / 1024))} KB`
          + (nuvemEstado.remoto.registros ? ` · ${nuvemEstado.remoto.registros} registros` : '')
          + (nuvemEstado.remoto.dispositivo ? ` · do ${nuvemEstado.remoto.dispositivo}` : '')),

        !nuvemEstado.ligado
          ? h('div.empilha', { style: { gap: '8px', marginTop: '10px' } },
            h('p.pequeno.muted',
              'Para ligar, você precisa criar uma chave gratuita no Google — é o que autoriza '
              + 'este app a guardar um arquivo no SEU Drive, e só esse arquivo. Leva uns dez '
              + 'minutos, uma vez só.'),
            h('div.btn-linha',
              botao('Ligar sincronização', { tipo: 'primario', onClick: () => configurarNuvem() }),
              botao('Como consigo a chave?', { onClick: () => comoConseguirChave() })))
          : h('div.empilha', { style: { gap: '8px', marginTop: '10px' } },
            h('div.btn-linha',
              botao('⬆️ Enviar deste aparelho', {
                tipo: nuvemEstado.enviarPendente ? 'primario' : undefined,
                onClick: () => enviarParaNuvem(),
              }),
              botao('⬇️ Buscar da nuvem', {
                tipo: nuvemEstado.buscarPendente && !nuvemEstado.conflito ? 'primario' : undefined,
                onClick: () => buscarDaNuvem(),
              })),
            h('div.btn-linha',
              botao('Trocar a chave', { pequeno: true, onClick: () => configurarNuvem() }),
              botao('Desligar', { pequeno: true, onClick: () => desligar() }))),

        h('p.mini.muted', { style: { marginTop: '10px' } },
          'Ao abrir o app, ele busca sozinho quando a nuvem está mais nova — mas nunca envia '
          + 'sozinho. Enviar é sempre no botão, para abrir o app no celular jamais sobrescrever '
          + 'o que você fez no computador.'))),

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

    /* o rodapé não pode mentir: com a nuvem ligada, os dados não são só locais */
    h('p.mini.muted.centro', { style: { padding: '10px 0 20px' } },
      nuvemEstado.ligado
        ? 'AMPLA — gestão administrativa · dados no aparelho e no seu Google Drive'
        : 'AMPLA — gestão administrativa · dados locais no aparelho'));
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
async function configurarNuvem() {
  const cfg = await store.config();
  const r = await formulario({
    titulo: 'Chave do Google',
    descricao: 'Cole aqui o "ID do cliente OAuth" que você criou no Google Cloud. '
      + 'Ele fica guardado só neste aparelho.',
    campos: [{
      chave: 'clientId',
      label: 'ID do cliente OAuth',
      tipo: 'texto',
      obrigatorio: true,
      valor: cfg.nuvem?.clientId || '',
      placeholder: '000000-xxxxx.apps.googleusercontent.com',
    }],
    confirmar: 'Ligar',
  });
  if (!r) return;
  const limpo = String(r.clientId).trim();
  if (!/\.apps\.googleusercontent\.com$/.test(limpo)) {
    erro('Essa chave não parece um ID do cliente OAuth — ele termina em .apps.googleusercontent.com');
    return;
  }
  await store.salvarConfig({ nuvem: { clientId: limpo } });
  await ligarNuvem();
  try {
    await nuvem.transporteAtual().conectar();
    ok('Conectado ao Google Drive.');
  } catch (e) {
    erro(e.message);
  }
  refresh();
}

async function enviarParaNuvem() {
  try {
    if (!(await nuvem.transporteAtual().conectado())) await nuvem.transporteAtual().conectar();
    const r = await nuvem.enviar();
    ok(`Enviado — ${r.registros} registros, ${Math.max(1, Math.round(r.tamanho / 1024))} KB.`);
    refresh();
  } catch (e) { erro(e.message); }
}

async function buscarDaNuvem() {
  try {
    if (!(await nuvem.transporteAtual().conectado())) await nuvem.transporteAtual().conectar();
    const atual = await backup.montarSnapshot({});
    const confirmado = await confirmar({
      titulo: 'Trazer a base da nuvem?',
      texto: `O que está neste aparelho (${backup.contarRegistros(atual)} registros) será `
        + 'substituído pela versão que está na nuvem. O que você fez só aqui e ainda não enviou '
        + 'se perde.',
      confirmar: 'Trazer',
      perigo: true,
    });
    if (!confirmado) return;
    const r = await nuvem.buscar({ aoRestaurar: () => recalcular() });
    await atualizarAlertas();
    ok(`Base atualizada — ${r.registros} registros${r.de ? ` (do ${r.de})` : ''}.`);
    navigate('/');
  } catch (e) { erro(e.message); }
}

async function desligar() {
  const sim = await confirmar({
    titulo: 'Desligar a sincronização?',
    texto: 'Este aparelho para de conversar com o Drive. A base daqui e o arquivo que já está no '
      + 'seu Drive continuam intactos.',
    confirmar: 'Desligar',
  });
  if (!sim) return;
  await desligarNuvem();
  ok('Sincronização desligada.');
  refresh();
}

function comoConseguirChave() {
  detalhe('Como criar a chave do Google',
    h('div.empilha', { style: { gap: '8px' } },
      h('p.pequeno.muted', 'Uma vez só, no computador. O que você vai criar é gratuito e fica na '
        + 'sua conta Google.'),
      h('p.pequeno', h('strong', '1.'), ' Abra ', h('strong', 'console.cloud.google.com'),
        ' e crie um projeto (o nome não importa — "AMPLA" serve).'),
      h('p.pequeno', h('strong', '2.'), ' Em "APIs e serviços" → "Biblioteca", procure ',
        h('strong', 'Google Drive API'), ' e clique em Ativar.'),
      h('p.pequeno', h('strong', '3.'), ' Em "Tela de permissão OAuth", escolha ', h('strong', 'Externo'),
        ', preencha nome e seu e-mail e salve.'),
      h('p.pequeno', h('strong', '4.'), ' ', h('strong', 'IMPORTANTE:'), ' nessa mesma tela, clique em ',
        h('strong', 'PUBLICAR'), ' o app. Se ficar em "Teste", o Google corta o acesso a cada 7 dias '
        + 'e você teria que refazer o login toda semana.'),
      h('p.pequeno', h('strong', '5.'), ' Em "Credenciais" → "Criar credenciais" → ',
        h('strong', 'ID do cliente OAuth'), ' → tipo ', h('strong', 'Aplicativo da Web'), '.'),
      h('p.pequeno', h('strong', '6.'), ' Em "Origens JavaScript autorizadas", acrescente ',
        h('strong', 'https://kao100.github.io'), ' e salve.'),
      h('p.pequeno', h('strong', '7.'), ' Copie o ID que aparece (termina em '
        + '.apps.googleusercontent.com) e cole aqui no app, em "Ligar sincronização".'),
      aviso('O escopo que o app pede é o mais estreito que existe (drive.file): ele só enxerga o '
        + 'arquivo que ele mesmo criar. O resto do seu Drive continua invisível para ele.', 'info')));
}

async function exportarBackup() {
  const snapshot = await backup.montarSnapshot({ dispositivo: await nuvem.nomeDoAparelho() });
  const { blob, comprimido } = await backup.comprimir(snapshot);
  download(`ampla_backup_${today()}.json${comprimido ? '.gz' : ''}`, blob);
  ok(`Backup exportado — ${Math.max(1, Math.round(blob.size / 1024))} KB.`);
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
      const conteudo = backup.validarSnapshot(JSON.parse(await backup.descomprimir(arquivo)));
      const confirmado = await confirmar({
        titulo: 'Substituir os dados atuais?',
        texto: `Tudo que está no aparelho será substituído pelo conteúdo do backup `
          + `(${backup.contarRegistros(conteudo)} registros).`,
        confirmar: 'Substituir',
        perigo: true,
      });
      if (!confirmado) return;
      await backup.restaurarSnapshot(conteudo);
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
