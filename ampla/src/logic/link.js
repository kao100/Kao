/**
 * VÍNCULOS E CONTROLE DE QUALIDADE
 *
 * Aqui mora a regra mais delicada do projeto (item 4): o faturamento é da NOTA
 * FISCAL, mas o vendedor é do PEDIDO. Este módulo liga as duas pontas e, quando
 * não consegue ligar com certeza, NÃO inventa: gera uma pendência para resolver
 * à mão na tela de Conciliação.
 *
 * AS DUAS PONTES: nenhum relatório da AMPLA traz o vendedor, e o relatório
 * fiscal não traz o pedido.
 *
 * A primeira ponte é o CONTAS A RECEBER, que tem a nota fiscal e a descrição
 * (número do pedido) na mesma linha:
 *
 *   NF ──(contas a receber)──► pedido ──(relatório de comissão)──► vendedor
 *
 * Só que ela tem um limite medido nos arquivos de verdade: de 336 notas do mês,
 * apenas 74 aparecem em algum título. Toda venda gera conta a receber — o que
 * falta é o EXPORT. O relatório que chega aqui vem só com os títulos EM ABERTO
 * (no arquivo real, 398 de 398, nenhum recebido), e o título de uma venda já
 * recebida é justamente o que ligaria a nota daquele mês ao pedido dela. As
 * notas citadas vão de 3489 a 4199, quase todas abaixo de 3878, que é onde o
 * relatório fiscal começa: o que sobrou foi o rabo de títulos velhos ainda em
 * aberto, não o mês. Resultado: R$ 624 mil de R$ 706 mil sem dono, e o relatório
 * por vendedor mostrando um quinto da realidade.
 *
 * Mandar uma vez o contas a receber SEM o filtro de situação fecha essa ponte
 * para o mês inteiro — e o app avisa isso na importação quando vê um arquivo em
 * que nenhum título está recebido. Mas depender disso todo dia seria frágil,
 * então existe a segunda ponte.
 *
 * A segunda ponte fecha esse buraco sem inventar nada. Nota e pedido da mesma
 * venda têm, nos dois relatórios, o MESMO cliente e o MESMO valor até o
 * centavo — e o pedido vem antes da nota. Então:
 *
 *   NF ──(mesmo cliente + mesmo valor + pedido anterior)──► pedido
 *
 * É comparação exata de dois campos, não semelhança: nada de nome parecido,
 * nada de valor aproximado, nada de "o mais próximo". E só vale quando o par é
 * ÚNICO na base inteira. Dois pedidos iguais do mesmo cliente na janela? O app
 * não escolhe: ou os dois são do mesmo vendedor (e então o vendedor é certo
 * mesmo sem saber qual pedido é qual), ou vira pendência.
 *
 * A prova de que a ponte está certa está nas datas: dos 292 pares únicos, 237
 * são do MESMO DIA e 54 caem em até sete dias. Nenhum pedido depois da nota.
 * Coincidência de valor não se comporta assim.
 *
 * Ordem de confiança para descobrir o vendedor de uma NF:
 *   1. decidido por você no app (vence tudo, e fica registrado)
 *   2. vendedor que veio no próprio relatório de NFs
 *   3. relatório de comissão que cita o número desta nota
 *   4. pedido informado na NF → vendedor do pedido
 *   5. título do contas a receber que cita a NF → pedido → vendedor
 *   6. pedido que aponta para esta NF → vendedor do pedido
 *   7. pedido único com mesmo cliente e mesmo valor → vendedor do pedido
 *   8. nenhuma das anteriores → ⚠️ NF SEM PEDIDO IDENTIFICADO
 */

import * as store from '../core/store.js';
import { today, monthKey, money, formatDate } from '../core/format.js';
import { normalize, docNumber, sameMoney, cents, sum } from '../core/util.js';

export const TIPOS_PENDENCIA = {
  nf_sem_pedido: {
    titulo: 'Nota sem pedido',
    icone: '🔗',
    gravidade: 'alta',
    explicacao: 'Toda nota vem de um pedido, mas o app ainda não sabe de qual. Ele tenta duas '
      + 'pontes: o contas a receber, que traz nota e pedido na mesma linha, e o pedido com '
      + 'mesmo cliente e mesmo valor. Quando nenhuma fecha com certeza, a nota vem para cá. '
      + 'Se o seu contas a receber sai só com os títulos EM ABERTO, mande uma vez um sem esse '
      + 'filtro: é o título já recebido que liga a nota do mês ao pedido.',
  },
  devolucao_sem_origem: {
    titulo: 'Devolução sem a venda original',
    icone: '↩️',
    gravidade: 'alta',
    explicacao: 'A comissão desta venda já foi paga, e esta devolução tem de abatê-la do vendedor '
      + 'certo. O app procura a nota original pelo mesmo cliente e mesmo valor, até seis meses '
      + 'antes — se ela não está na base, ou se a devolução é parcial, diga aqui de quem era.',
  },
  pedido_sem_vendedor: {
    titulo: 'Venda sem vendedor',
    icone: '🙋',
    gravidade: 'alta',
    explicacao: 'O vendedor vem do relatório de comissão por venda. Mande esse relatório e '
      + 'todas as notas do pedido ganham dono de uma vez.',
  },
  divergencia_faturamento: {
    titulo: 'Faturamento fiscal ≠ soma dos vendedores',
    icone: '⚖️',
    gravidade: 'alta',
    explicacao: 'O total das notas do mês não bate com o total atribuído aos vendedores.',
  },
  receber_sem_nf: {
    titulo: 'Título sem NF identificada',
    icone: '🔗',
    gravidade: 'media',
    explicacao: 'O título cita uma NF que não existe na base (ou existe mais de uma com esse número).',
  },
  extrato_sem_vinculo: {
    titulo: 'Movimento bancário sem vínculo',
    icone: '🏦',
    gravidade: 'media',
    explicacao: 'Entrou ou saiu dinheiro e o app não achou o título correspondente.',
  },
  pago_sem_banco: {
    titulo: 'Título pago sem movimento no banco',
    icone: '❓',
    gravidade: 'media',
    explicacao: 'O título está baixado, mas não há lançamento equivalente no extrato.',
  },
  item_sem_nf: {
    titulo: 'Item sem nota correspondente',
    icone: '📦',
    gravidade: 'baixa',
    explicacao: 'Chegou item de uma NF que ainda não foi importada.',
  },
  produto_sem_custo: {
    titulo: 'Produto vendido sem custo cadastrado',
    icone: '🏷️',
    gravidade: 'baixa',
    explicacao: 'Sem custo o app mostra faturamento, mas não calcula margem.',
  },
  pagar_sem_categoria: {
    titulo: 'Pagamento sem categoria',
    icone: '🗂️',
    gravidade: 'baixa',
    explicacao: 'Atrapalha a visão de onde o dinheiro está indo.',
  },
};

/**
 * Refaz todos os vínculos derivados. É chamado depois de cada importação e
 * pode ser chamado à mão. Não altera nada que o usuário tenha decidido.
 */
export async function recalcular() {
  const [nfs, pedidos, itens, titulos, pagamentos, movimentos, vendedores, produtos, comissoes] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.nfItens.listar(), store.receber.listar(),
    store.pagar.listar(), store.extrato.listar(), store.vendedores.listar(), store.produtos.listar(),
    store.comissoesRelatorio.listar(),
  ]);

  /**
   * O relatório de comissão é a ÚNICA fonte de vendedor. O número que ele traz
   * é o do pedido, mas o app confere contra pedido E contra nota: as duas são
   * comparações exatas de identificador, não palpite, e assim o vínculo fecha
   * mesmo que o relatório mude de referência um dia.
   */
  const vendedorPorNumero = new Map();
  for (const c of comissoes) {
    if (!c.numero || !c.vendedorNome) continue;
    const k = String(docNumber(c.numero) || c.numero);
    const atual = vendedorPorNumero.get(k);
    if (atual && normalize(atual) !== normalize(c.vendedorNome)) vendedorPorNumero.set(k, 'ambiguo');
    else if (!atual) vendedorPorNumero.set(k, c.vendedorNome);
  }

  const porNome = indiceVendedores(vendedores);
  const novosVendedores = [];

  /* 1. pedidos: vendedor definido por você vence; senão, o nome que veio no arquivo */
  const doRelatorioDeComissao = (numero) => {
    if (!numero) return null;
    const nome = vendedorPorNumero.get(String(numero));
    return nome && nome !== 'ambiguo' ? nome : null;
  };

  const pedidosAtualizados = [];
  for (const pedido of pedidos) {
    if (pedido.vendedorOrigem === 'manual') continue;   // decisão sua, não se mexe
    // o relatório de comissão manda: é o único que traz vendedor de verdade
    const daComissao = doRelatorioDeComissao(pedido.numero);
    const nome = daComissao || pedido.vendedorNome;
    const achado = resolverVendedor(nome, porNome, novosVendedores);
    const origem = daComissao ? 'comissao' : 'relatorio';
    if (achado && (pedido.vendedorId !== achado.id || pedido.vendedorOrigem !== origem)) {
      pedidosAtualizados.push({ ...pedido, vendedorId: achado.id, vendedorOrigem: origem });
    }
  }
  for (const p of pedidosAtualizados) {
    const i = pedidos.findIndex((x) => x.id === p.id);
    if (i >= 0) pedidos[i] = p;
  }

  /* 2. índices de pedido + a ponte que vem do contas a receber */
  const pedidoPorNumero = new Map();
  const pedidoPorNf = new Map();
  for (const pedido of pedidos) {
    if (pedido.numero) pedidoPorNumero.set(String(pedido.numero), pedido);
    if (pedido.nfNumero) {
      const k = String(pedido.nfNumero);
      if (pedidoPorNf.has(k)) pedidoPorNf.set(k, 'ambiguo');
      else pedidoPorNf.set(k, pedido);
    }
  }

  // título do contas a receber que traz NF e pedido na mesma linha: é a ponte.
  // Se dois títulos discordarem sobre a mesma NF, marca ambíguo e não usa.
  const pedidoDaNfPeloTitulo = new Map();
  for (const t of titulos) {
    if (!t.nfNumero || !t.pedidoNumero) continue;
    const k = String(t.nfNumero);
    const atual = pedidoDaNfPeloTitulo.get(k);
    if (atual && atual !== String(t.pedidoNumero)) pedidoDaNfPeloTitulo.set(k, 'ambiguo');
    else pedidoDaNfPeloTitulo.set(k, String(t.pedidoNumero));
  }

  /**
   * A segunda ponte: pedidos indexados por cliente + valor exato. Só entra
   * pedido com os dois campos preenchidos — meia chave ligaria tudo em todo
   * mundo, que é exatamente o que este projeto não faz.
   */
  const pedidoPorClienteValor = new Map();
  for (const pedido of pedidos) {
    const k = chaveClienteValor(pedido.clienteNome, pedido.valorTotal);
    if (!k) continue;
    if (!pedidoPorClienteValor.has(k)) pedidoPorClienteValor.set(k, []);
    pedidoPorClienteValor.get(k).push(pedido);
  }

  /**
   * DEVOLUÇÃO: de quem era a venda que voltou.
   *
   * "O Guilherme fez uma venda mês passado e o cliente devolveu esse mês. Só que
   *  eu já paguei a comissão do mês passado. Então eu preciso abater na comissão
   *  desse mês."
   *
   * Para abater no vendedor certo, a devolução precisa do dono da NOTA ORIGINAL —
   * não de um pedido. Índice: notas que NÃO são devolução, por cliente + valor.
   */
  const notaOriginalPorClienteValor = new Map();
  for (const nf of nfs) {
    if (nf.devolucao || nf.status === 'cancelada') continue;
    const k = chaveClienteValor(nf.clienteNome, nf.valorTotal);
    if (!k) continue;
    if (!notaOriginalPorClienteValor.has(k)) notaOriginalPorClienteValor.set(k, []);
    notaOriginalPorClienteValor.get(k).push(nf);
  }

  /**
   * 3. NFs: vendedor e mês de faturamento.
   *
   * A ORDEM IMPORTA. A devolução depende do vendedor da nota ORIGINAL, então as
   * notas normais são resolvidas primeiro e as devoluções depois, consultando o
   * que acabou de ser decidido. Tudo de uma vez deixava a devolução procurando
   * um vendedor que, naquele instante, ainda não existia.
   */
  const nfsAtualizadas = [];
  const vendedorJaResolvido = new Map();
  const naOrdem = [...nfs.filter((n) => !n.devolucao), ...nfs.filter((n) => n.devolucao)];
  for (const nf of naOrdem) {
    const antes = {
      vendedorId: nf.vendedorId,
      vendedorOrigem: nf.vendedorOrigem,
      pedidoId: nf.pedidoId,
      pedidoOrigem: nf.pedidoOrigem,
      notaDevolvida: nf.notaDevolvida,
    };
    const resolvido = resolverVendedorDaNf(nf, {
      porNome, pedidoPorNumero, pedidoPorNf, pedidoDaNfPeloTitulo, pedidoPorClienteValor,
      notaOriginalPorClienteValor, vendedorJaResolvido, novosVendedores, doRelatorioDeComissao,
    });
    vendedorJaResolvido.set(nf.id, resolvido.vendedorId || null);
    const mes = nf.dataEmissao ? monthKey(nf.dataEmissao) : null;
    const mudouNumero = String(resolvido.pedidoNumero ?? '') !== String(nf.pedidoNumero ?? '');
    if (resolvido.vendedorId !== antes.vendedorId || resolvido.vendedorOrigem !== antes.vendedorOrigem
      || resolvido.pedidoId !== antes.pedidoId || resolvido.pedidoOrigem !== antes.pedidoOrigem
      || (resolvido.notaDevolvida ?? null) !== (antes.notaDevolvida ?? null)
      || nf.mes !== mes || mudouNumero) {
      nfsAtualizadas.push({ ...nf, ...resolvido, mes });
    }
  }
  for (const n of nfsAtualizadas) {
    const i = nfs.findIndex((x) => x.id === n.id);
    if (i >= 0) nfs[i] = n;
  }

  /* 4. itens: herdam data/mês da nota (o item sozinho não tem data confiável) */
  const nfPorId = new Map(nfs.map((n) => [n.id, n]));
  const itensAtualizados = [];
  for (const item of itens) {
    const nf = nfPorId.get(item.nfId);
    if (!nf) continue;
    const custoTotal = item.custoTotal != null ? item.custoTotal
      : (item.custoUnitario != null ? cents(item.custoUnitario * (item.quantidade || 0)) : null);
    if (item.data !== nf.dataEmissao || item.mes !== nf.mes || item.vendedorId !== nf.vendedorId
      || item.custoTotal !== custoTotal || item.nfStatus !== nf.status) {
      itensAtualizados.push({
        ...item,
        data: nf.dataEmissao,
        mes: nf.mes,
        vendedorId: nf.vendedorId || null,
        clienteId: nf.clienteId || null,
        nfStatus: nf.status,
        nfDevolucao: !!nf.devolucao,
        custoTotal,
      });
    }
  }

  /* 5. contas a receber: liga na NF e herda o vendedor */
  const nfsPorNumero = new Map();
  for (const nf of nfs) {
    const k = String(docNumber(nf.numero) || nf.numero);
    if (!nfsPorNumero.has(k)) nfsPorNumero.set(k, []);
    nfsPorNumero.get(k).push(nf);
  }
  const titulosAtualizados = [];
  for (const titulo of titulos) {
    let nfId = titulo.nfId || null;
    let vendedorId = titulo.vendedorId || null;
    if (titulo.nfNumero) {
      const candidatas = nfsPorNumero.get(String(titulo.nfNumero)) || [];
      // só liga quando não há dúvida: uma única NF com aquele número
      if (candidatas.length === 1) nfId = candidatas[0].id;
    }
    const nf = nfId ? nfPorId.get(nfId) : null;
    if (nf?.vendedorId) vendedorId = nf.vendedorId;
    else if (!vendedorId && titulo.vendedorNome) {
      vendedorId = resolverVendedor(titulo.vendedorNome, porNome, novosVendedores)?.id || null;
    }
    const status = statusTitulo(titulo);
    if (nfId !== titulo.nfId || vendedorId !== titulo.vendedorId || status !== titulo.status) {
      titulosAtualizados.push({ ...titulo, nfId, vendedorId, status });
    }
  }

  /* 6. conciliação bancária: só o que casa sem ambiguidade */
  const conciliacao = conciliar(movimentos, titulos, pagamentos);

  /* 7. grava tudo de uma vez */
  await store.salvarLote({
    vendedores: novosVendedores,
    pedidos: pedidosAtualizados,
    nfs: nfsAtualizadas,
    nfItens: itensAtualizados,
    receber: titulosAtualizados,
    extrato: conciliacao.movimentos,
  });

  /* 8. pendências */
  const pendencias = await gerarPendencias({
    nfs,
    itens,
    titulos: titulos.map((t) => titulosAtualizados.find((x) => x.id === t.id) || t),
    pagamentos,
    movimentos: conciliacao.movimentos.length ? mesclarPorId(movimentos, conciliacao.movimentos) : movimentos,
    produtos,
    pedidoPorNumero,
    pedidoPorClienteValor,
    pedidos,
  });

  return {
    vendedoresCriados: novosVendedores.length,
    nfsAtualizadas: nfsAtualizadas.length,
    titulosLigados: titulosAtualizados.length,
    conciliados: conciliacao.movimentos.filter((m) => m.conciliacaoStatus === 'conciliado').length,
    pendencias: pendencias.abertas,
  };
}

function mesclarPorId(base, novos) {
  const mapa = new Map(base.map((b) => [b.id, b]));
  for (const n of novos) mapa.set(n.id, n);
  return [...mapa.values()];
}

/* ------------------------------------------------------------------ vendedor */

function indiceVendedores(vendedores) {
  const mapa = new Map();
  for (const v of vendedores) {
    mapa.set(normalize(v.nome), v);
    for (const a of v.apelidos || []) mapa.set(normalize(a), v);
    if (v.codigo) mapa.set(normalize(v.codigo), v);
  }
  return mapa;
}

/**
 * O nome que veio no arquivo é dado, não suposição: se ainda não existe
 * vendedor com aquele nome, o cadastro é criado. O que nunca acontece é
 * "parecer" com outro nome e ser ligado por semelhança.
 */
function resolverVendedor(nome, porNome, novos) {
  const alvo = normalize(nome);
  if (!alvo) return null;
  if (porNome.has(alvo)) return porNome.get(alvo);
  const novo = {
    id: `vend_${alvo.replace(/[^a-z0-9]/g, '').slice(0, 24) || Date.now().toString(36)}`,
    nome: String(nome).trim(),
    apelidos: [],
    ativo: true,
    criadoEm: Date.now(),
    origem: 'importacao',
  };
  porNome.set(alvo, novo);
  novos.push(novo);
  return novo;
}

/**
 * Como o app chegou ao vendedor de uma nota. Item 20: a origem sempre aparece,
 * para você saber se aquilo veio de um relatório, da ponte do contas a receber
 * ou de uma decisão sua.
 */
export const ORIGEM_VENDEDOR = {
  comissao: 'relatório de comissão',
  nf: 'relatório fiscal',
  pedido: 'pedido',
  'pedido-titulo': 'pedido (via contas a receber)',
  'pedido-valor': 'pedido com mesmo cliente e mesmo valor',
  'pedido-nf': 'pedido → NF',
  'pedido-confirmado': 'pedido que você confirmou',
  'vendedor-valor': 'pedidos iguais, todos do mesmo vendedor',
  'devolucao-nota': 'vendedor da nota devolvida',
  'devolucao-vendedor': 'notas devolvidas, todas do mesmo vendedor',
  manual: 'definido à mão',
};

/** De onde veio o número do pedido → como isso se chama no rótulo do vendedor. */
const ORIGEM_DO_PEDIDO = {
  titulo: 'pedido-titulo',
  valor: 'pedido-valor',
  'pedido-nf': 'pedido-nf',
  relatorio: 'pedido',
};

/**
 * Quantos dias a nota pode sair depois do pedido para o par ainda valer.
 * Nos arquivos de verdade nenhum par legítimo passou de 8 dias; trinta é folga
 * para quem fatura com prazo de entrega. Janela maior não liga mais nota
 * nenhuma — só faz aparecer um segundo candidato, e aí o app se recusa a
 * escolher, que é o comportamento certo.
 */
export const JANELA_PEDIDO_NOTA = 30;

/**
 * A chave da segunda ponte: cliente normalizado + valor em centavos. Devolve
 * null quando falta qualquer um dos dois — sem os dois não existe chave.
 */
export function chaveClienteValor(cliente, valor) {
  const nome = normalize(cliente);
  if (!nome || valor == null || valor === '') return null;
  return `${nome}|${cents(valor)}`;
}

function diasEntre(de, ate) {
  if (!de || !ate) return null;
  const a = new Date(`${de}T12:00`);
  const b = new Date(`${ate}T12:00`);
  if (Number.isNaN(+a) || Number.isNaN(+b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Pedidos que podem ser a origem desta nota: mesmo cliente, mesmo valor até o
 * centavo, e emitidos ANTES dela (ou no mesmo dia), dentro da janela. A ordem
 * cronológica não é detalhe: pedido depois da nota não é a venda dela, é outra
 * venda com o mesmo valor.
 */
export function candidatosPorClienteValor(nf, indice) {
  const k = chaveClienteValor(nf.clienteNome, nf.valorTotal);
  if (!k || !indice) return [];
  const todos = indice.get(k) || [];
  if (!nf.dataEmissao) return [];
  return todos.filter((pedido) => {
    const d = diasEntre(pedido.data, nf.dataEmissao);
    return d != null && d >= 0 && d <= JANELA_PEDIDO_NOTA;
  });
}

/**
 * Quantos dias uma devolução pode vir depois da venda. Ela mesma disse que a
 * venda de um mês é devolvida no mês seguinte, e às vezes depois: meio ano é
 * folga suficiente sem transformar a busca em palpite, porque a exigência de
 * cliente e valor idênticos continua valendo.
 */
export const JANELA_DEVOLUCAO = 180;

/**
 * De quem era a venda que voltou. Mesmo cliente, mesmo valor até o centavo, nota
 * emitida ANTES da devolução, e só vale quando não há dúvida de vendedor:
 *
 *  - uma única nota original candidata → o vendedor dela
 *  - várias, mas todas do mesmo vendedor → o vendedor é certo de qualquer jeito
 *  - várias de vendedores diferentes, ou nenhuma → o app não escolhe
 *
 * Nota original sem vendedor não serve: abater de ninguém não é abater.
 */
function vendedorDaNotaDevolvida(nf, indice, jaResolvido) {
  const k = chaveClienteValor(nf.clienteNome, nf.valorTotal);
  if (!k || !indice || !nf.dataEmissao) return null;
  // o vendedor da original pode ter sido decidido agora, neste mesmo recálculo:
  // vale o que já foi resolvido, não o que estava gravado antes
  const donoDe = (o) => (jaResolvido?.has(o.id) ? jaResolvido.get(o.id) : o.vendedorId) || null;
  const candidatas = (indice.get(k) || []).filter((o) => {
    if (o.id === nf.id || !donoDe(o) || !o.dataEmissao) return false;
    const d = diasEntre(o.dataEmissao, nf.dataEmissao);
    return d != null && d >= 0 && d <= JANELA_DEVOLUCAO;
  });
  if (!candidatas.length) return null;
  if (candidatas.length === 1) {
    return { vendedorId: donoDe(candidatas[0]), origem: 'devolucao-nota', numero: candidatas[0].numero };
  }
  const donos = new Set(candidatas.map(donoDe));
  if (donos.size === 1) return { vendedorId: [...donos][0], origem: 'devolucao-vendedor', numero: null };
  return null;
}

/**
 * A segunda ponte em si. Três respostas possíveis, e nenhuma delas é um palpite:
 *
 *  - um único candidato  → é o pedido desta nota
 *  - vários, mas todos do mesmo vendedor → não se sabe QUAL pedido, e não
 *    importa: o vendedor é o mesmo de qualquer jeito
 *  - vários de vendedores diferentes, ou nenhum → o app não escolhe
 */
function pontePorClienteValor(nf, indice) {
  const candidatos = candidatosPorClienteValor(nf, indice);
  if (candidatos.length === 1) return { pedido: candidatos[0] };
  if (candidatos.length > 1) {
    const donos = new Set(candidatos.map((c) => c.vendedorId).filter(Boolean));
    if (donos.size === 1 && candidatos.every((c) => c.vendedorId)) {
      return { vendedorId: [...donos][0], quantos: candidatos.length };
    }
  }
  return null;
}

/** Rótulo legível da origem, com travessão quando ainda não há vendedor. */
export function origemVendedor(valor) {
  return ORIGEM_VENDEDOR[valor] || '—';
}

/** Origens que vieram de uma decisão sua: o recálculo não mexe nelas. */
const DECIDIDO_POR_VOCE = new Set(['manual', 'pedido-confirmado']);

function resolverVendedorDaNf(nf, { porNome, pedidoPorNumero, pedidoPorNf, pedidoDaNfPeloTitulo, pedidoPorClienteValor, notaOriginalPorClienteValor, vendedorJaResolvido, novosVendedores, doRelatorioDeComissao }) {
  if (DECIDIDO_POR_VOCE.has(nf.vendedorOrigem) && nf.vendedorId) {
    return {
      vendedorId: nf.vendedorId,
      vendedorOrigem: nf.vendedorOrigem,
      pedidoId: nf.pedidoId || null,
      pedidoNumero: nf.pedidoNumero || null,
      pedidoOrigem: nf.pedidoOrigem || null,
    };
  }
  if (nf.vendedorNome) {
    const v = resolverVendedor(nf.vendedorNome, porNome, novosVendedores);
    if (v) {
      return { vendedorId: v.id, vendedorOrigem: 'nf', ...vinculoDeUmaNota(nf, pedidoPorNumero, pedidoDaNfPeloTitulo, pedidoPorClienteValor) };
    }
  }

  /**
   * DEVOLUÇÃO tem caminho próprio, e vem antes de qualquer ponte de pedido: o
   * dono de uma devolução é o dono da venda que voltou. Ligar devolução a pedido
   * daria o mesmo vendedor por acaso, mas penduraria no pedido uma segunda nota
   * que nunca existiu — e aí o pedido pareceria faturado duas vezes.
   */
  if (nf.devolucao) {
    const daOriginal = vendedorDaNotaDevolvida(nf, notaOriginalPorClienteValor, vendedorJaResolvido);
    if (daOriginal) {
      return {
        vendedorId: daOriginal.vendedorId,
        vendedorOrigem: daOriginal.origem,
        notaDevolvida: daOriginal.numero || null,
        pedidoId: null,
        pedidoNumero: null,
        pedidoOrigem: null,
      };
    }
    // sem a nota original na base não há como saber de quem abater: pendência
    return {
      vendedorId: null,
      vendedorOrigem: null,
      notaDevolvida: null,
      pedidoId: null,
      pedidoNumero: null,
      pedidoOrigem: null,
    };
  }

  // o relatório de comissão pode citar a própria nota: bate identificador com
  // identificador, então vale mesmo antes da ponte do contas a receber existir
  const pelaComissao = doRelatorioDeComissao?.(docNumber(nf.numero) || nf.numero);
  if (pelaComissao) {
    const v = resolverVendedor(pelaComissao, porNome, novosVendedores);
    if (v) {
      return { vendedorId: v.id, vendedorOrigem: 'comissao', ...vinculoDeUmaNota(nf, pedidoPorNumero, pedidoDaNfPeloTitulo, pedidoPorClienteValor) };
    }
  }

  // O pedido pode vir da própria NF (XML ou relatório que já o traga) ou da
  // ponte do contas a receber. Guardamos em pedidoOrigem DE ONDE ele veio: o
  // vínculo é gravado na nota, então sem isso o segundo recálculo não saberia
  // mais distinguir um do outro.
  const numero = String(docNumber(nf.numero) || nf.numero || '');
  const peloTitulo = pedidoDaNfPeloTitulo?.get(numero);
  const doTitulo = peloTitulo && peloTitulo !== 'ambiguo' ? String(peloTitulo) : null;
  /**
   * Vínculo DERIVADO (a ponte do contas a receber, a ponte de cliente + valor)
   * é refeito em cada recálculo: se um pedido novo fizer o par deixar de ser
   * único, o vínculo cai em vez de ficar pendurado de um cálculo antigo. Só o
   * pedido que veio escrito no arquivo é dado, e dado não se recalcula.
   */
  const derivado = nf.pedidoOrigem === 'valor' || nf.pedidoOrigem === 'titulo';
  const numeroDoArquivo = derivado ? null : (nf.pedidoNumero || null);
  const numeroPedido = numeroDoArquivo || doTitulo;
  const pedidoOrigem = numeroDoArquivo
    ? (nf.pedidoOrigem || 'relatorio')
    : (doTitulo ? 'titulo' : null);

  if (numeroPedido) {
    const pedido = pedidoPorNumero.get(String(numeroPedido));
    if (pedido?.vendedorId) {
      return {
        vendedorId: pedido.vendedorId,
        vendedorOrigem: ORIGEM_DO_PEDIDO[pedidoOrigem] || 'pedido',
        pedidoId: pedido.id,
        pedidoNumero: String(numeroPedido),
        pedidoOrigem,
      };
    }
  }

  const porNf = pedidoPorNf.get(numero);
  if (porNf && porNf !== 'ambiguo' && porNf.vendedorId) {
    return {
      vendedorId: porNf.vendedorId,
      vendedorOrigem: 'pedido-nf',
      pedidoId: porNf.id,
      pedidoNumero: porNf.numero,
      pedidoOrigem: 'pedido-nf',
    };
  }

  /**
   * Último recurso antes de virar pendência: a segunda ponte. Vem depois de
   * TODAS as outras porque é a única que não usa um número de documento — e
   * número é sempre melhor prova do que dois campos iguais, mesmo exatos.
   *
   * Ela também é a rede de quem tem número que não leva a lugar nenhum: o
   * contas a receber às vezes cita um pedido de mês anterior, ou um número que
   * não existe na base. Antes isso bloqueava a nota inteira — havia um número,
   * então o app parava ali, sem pedido e sem vendedor. Agora o número que não
   * resolve simplesmente não conta.
   */
  const porValor = pontePorClienteValor(nf, pedidoPorClienteValor);
  if (porValor?.pedido?.vendedorId) {
    return {
      vendedorId: porValor.pedido.vendedorId,
      vendedorOrigem: 'pedido-valor',
      pedidoId: porValor.pedido.id,
      pedidoNumero: porValor.pedido.numero ? String(porValor.pedido.numero) : null,
      pedidoOrigem: 'valor',
    };
  }
  if (porValor?.vendedorId) {
    // sabe de quem é a venda, mas não qual pedido: guarda só o vendedor
    return {
      vendedorId: porValor.vendedorId,
      vendedorOrigem: 'vendedor-valor',
      pedidoId: null,
      pedidoNumero: null,
      pedidoOrigem: null,
    };
  }

  // nada deu vendedor: fica com o melhor vínculo que existir, para a tela de
  // pendências saber dizer o que faltou
  if (numeroPedido) {
    const pedido = pedidoPorNumero.get(String(numeroPedido));
    return {
      vendedorId: null,
      vendedorOrigem: null,
      pedidoId: pedido?.id || null,
      pedidoNumero: String(numeroPedido),
      pedidoOrigem,
    };
  }
  if (porValor?.pedido) {
    return {
      vendedorId: null,
      vendedorOrigem: null,
      pedidoId: porValor.pedido.id,
      pedidoNumero: porValor.pedido.numero ? String(porValor.pedido.numero) : null,
      pedidoOrigem: 'valor',
    };
  }
  return { vendedorId: null, vendedorOrigem: null, pedidoId: null, pedidoNumero: null, pedidoOrigem: null };
}

/**
 * O pedido de uma nota que já tem vendedor por outro caminho. O vendedor não
 * muda, mas o vínculo com o pedido continua valendo: é dele que vem o custo, e
 * com ele a margem. Mesma ordem de confiança das pontes.
 */
function vinculoDeUmaNota(nf, pedidoPorNumero, pedidoDaNfPeloTitulo, pedidoPorClienteValor) {
  const derivado = nf.pedidoOrigem === 'valor' || nf.pedidoOrigem === 'titulo';
  const doArquivo = derivado ? null : (nf.pedidoNumero || null);
  if (doArquivo) {
    const pedido = pedidoPorNumero?.get(String(doArquivo));
    return { pedidoId: pedido?.id || null, pedidoNumero: String(doArquivo), pedidoOrigem: nf.pedidoOrigem || 'relatorio' };
  }
  const numero = String(docNumber(nf.numero) || nf.numero || '');
  const peloTitulo = pedidoDaNfPeloTitulo?.get(numero);
  if (peloTitulo && peloTitulo !== 'ambiguo') {
    const pedido = pedidoPorNumero?.get(String(peloTitulo));
    return { pedidoId: pedido?.id || null, pedidoNumero: String(peloTitulo), pedidoOrigem: 'titulo' };
  }
  const porValor = pontePorClienteValor(nf, pedidoPorClienteValor);
  if (porValor?.pedido) {
    return {
      pedidoId: porValor.pedido.id,
      pedidoNumero: porValor.pedido.numero ? String(porValor.pedido.numero) : null,
      pedidoOrigem: 'valor',
    };
  }
  return { pedidoId: null, pedidoNumero: null, pedidoOrigem: null };
}

/**
 * Define o vendedor de um PEDIDO. É o jeito certo de resolver: todas as notas
 * daquele pedido herdam de uma vez.
 */
export async function definirVendedorDoPedido(pedidoId, vendedorId, motivo) {
  const pedido = await store.pedidos.obter(pedidoId);
  if (!pedido) throw new Error('Pedido não encontrado.');
  const antes = pedido.vendedorId;
  await store.pedidos.salvar({
    ...pedido, vendedorId, vendedorOrigem: 'manual', vendedorDefinidoEm: Date.now(),
  });
  await store.registrar('vendedor_do_pedido', {
    alvoId: pedidoId, alvo: `Pedido ${pedido.numero || pedidoId}`, de: antes, para: vendedorId, motivo,
  });
  await recalcular();
}

/**
 * Os pedidos que ainda não têm vendedor, do que mais pesa para o que menos
 * pesa. É esta a lista que o app cobra de você: definir aqui resolve todas as
 * notas do pedido de uma vez, em vez de marcar nota por nota.
 *
 * Pedido sem nota e que não virou venda fica de fora — não é pendência, é só um
 * pedido que ainda não aconteceu.
 */
export async function pedidosSemVendedor() {
  const [pedidos, nfs] = await Promise.all([store.pedidos.listar(), store.nfs.listar()]);
  const porPedido = new Map();
  for (const nf of nfs) {
    if (nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    const chave = nf.pedidoId || (nf.pedidoNumero ? `n:${nf.pedidoNumero}` : null);
    if (chave) empilharChave(porPedido, chave, nf);
  }

  const saida = [];
  for (const pedido of pedidos) {
    if (pedido.vendedorId) continue;
    const notas = [
      ...(porPedido.get(pedido.id) || []),
      ...(pedido.numero ? (porPedido.get(`n:${pedido.numero}`) || []) : []),
    ];
    const unicas = [...new Map(notas.map((n) => [n.id, n])).values()];
    if (!unicas.length && pedido.concretizado !== true) continue;
    saida.push({
      pedido,
      notas: unicas.sort((a, b) => String(a.dataEmissao).localeCompare(String(b.dataEmissao))),
      faturado: cents(sum(unicas, (n) => n.valorTotal || 0)),
      valor: unicas.length ? cents(sum(unicas, (n) => n.valorTotal || 0)) : (pedido.valorTotal || 0),
    });
  }
  return saida.sort((a, b) => b.valor - a.valor);
}

/**
 * As NOTAS que ficaram sem dono. Antes esta lista não existia porque a regra era
 * "quem responde pela nota é o pedido dela" — só que quando NENHUMA das duas
 * pontes fecha não existe pedido para responder, e o faturamento ficava órfão
 * sem ninguém para cobrar. Agora a nota aparece aqui e pode receber vendedor
 * direto, que é o único caminho: o sistema de origem não deixa acrescentar
 * vendedor a uma nota já emitida.
 */
export async function notasSemVendedor() {
  const [nfs, pedidos] = await Promise.all([store.nfs.listar(), store.pedidos.listar()]);
  const pedidoPorNumero = new Map();
  const pedidoPorClienteValor = new Map();
  for (const pedido of pedidos) {
    if (pedido.numero) pedidoPorNumero.set(String(pedido.numero), pedido);
    const k = chaveClienteValor(pedido.clienteNome, pedido.valorTotal);
    if (!k) continue;
    if (!pedidoPorClienteValor.has(k)) pedidoPorClienteValor.set(k, []);
    pedidoPorClienteValor.get(k).push(pedido);
  }
  const saida = [];
  for (const nf of nfs) {
    if (nf.vendedorId || nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    // nota cujo pedido está na base e tem vendedor não cai aqui: ela já tem dono
    const pedido = nf.pedidoNumero ? pedidoPorNumero.get(String(nf.pedidoNumero)) : null;
    if (pedido?.vendedorId) continue;
    if (nf.devolucao) {
      saida.push({
        nf, pedido: null, valor: nf.valorTotal || 0, motivo: 'devolucao_sem_original',
        explicacao: 'devolução: nenhuma nota original com este cliente e este mesmo valor nos '
          + 'últimos seis meses — diga de quem era a venda, para abater dele',
      });
      continue;
    }
    const { motivo, explicacao } = porQueSemVendedor(nf, pedidoPorNumero, pedidoPorClienteValor);
    saida.push({ nf, pedido: pedido || null, valor: nf.valorTotal || 0, motivo, explicacao });
  }
  return saida.sort((a, b) => b.valor - a.valor);
}

/**
 * Tudo que está sem dono, numa lista só, do que mais pesa para o que menos
 * pesa: pedido sem vendedor (resolve todas as notas dele de uma vez) e nota que
 * não chegou a pedido nenhum (resolve só ela). É esta a lista que o app cobra
 * depois de cada importação.
 */
export async function vendasSemVendedor() {
  const [pedidos, notas] = await Promise.all([pedidosSemVendedor(), notasSemVendedor()]);
  const itens = [
    ...pedidos.map((x) => ({
      tipo: 'pedido',
      chave: `ped:${x.pedido.id}`,
      titulo: `Pedido ${x.pedido.numero || '(sem número)'}`,
      cliente: x.pedido.clienteNome || 'cliente não identificado',
      data: x.pedido.data || null,
      valor: x.valor,
      nota: x.notas.length
        ? `${x.notas.length} NF: ${x.notas.map((n) => n.numero).filter(Boolean).slice(0, 3).join(', ')}`
        : 'ainda sem NF',
      explicacao: 'o relatório não trouxe o vendedor deste pedido',
      pedido: x.pedido,
    })),
    ...notas.map((x) => ({
      tipo: 'nota',
      chave: `nf:${x.nf.id}`,
      titulo: `${x.nf.devolucao ? 'Devolução ' : ''}NF ${x.nf.numero || '(sem número)'}`,
      cliente: x.nf.clienteNome || 'cliente não identificado',
      data: x.nf.dataEmissao || null,
      valor: x.valor,
      // devolução marcar vendedor é ABATER dele, não somar: o rótulo diz isso
      nota: x.nf.devolucao ? 'abate do vendedor' : 'nota emitida',
      devolucao: !!x.nf.devolucao,
      explicacao: x.explicacao,
      nf: x.nf,
    })),
  ];
  return itens.sort((a, b) => b.valor - a.valor);
}

/* -------------------------------------------------------------------- título */

/**
 * A baixa é dada no sistema dela, não aqui. Então o que o RELATÓRIO diz sobre o
 * título manda: se veio "Recebido", está recebido — mesmo sem data de
 * recebimento na planilha, que é o normal em vários exports.
 */
export function statusTitulo(titulo) {
  if (titulo.status === 'cancelado') return 'cancelado';
  if (titulo.status === 'pago') return 'pago';
  if (titulo.dataRecebimento || (titulo.saldo != null && titulo.saldo <= 0)) return 'pago';
  return 'aberto';
}

export function emAtraso(titulo, referencia = today()) {
  return statusTitulo(titulo) === 'aberto' && titulo.vencimento < referencia;
}

export function diasAtraso(titulo, referencia = today()) {
  if (!emAtraso(titulo, referencia)) return 0;
  return Math.round((new Date(`${referencia}T12:00`) - new Date(`${titulo.vencimento}T12:00`)) / 86400000);
}

/* --------------------------------------------------------------- conciliação */

/**
 * Casa extrato com títulos. Regra dura: só concilia sozinho quando existe
 * exatamente UM candidato com mesmo valor e mesma data. Qualquer dúvida
 * (dois títulos iguais, valor agrupado, data diferente) fica pendente.
 */
function conciliar(movimentos, titulos, pagamentos) {
  const recebidosPorChave = new Map();
  for (const t of titulos) {
    if (statusTitulo(t) !== 'pago' || !t.dataRecebimento) continue;
    const valor = t.valorRecebido != null ? t.valorRecebido : t.valor;
    empilharChave(recebidosPorChave, `${t.dataRecebimento}|${cents(valor)}`, t);
  }
  const pagosPorChave = new Map();
  for (const p of pagamentos) {
    if (p.status !== 'pago' || !p.dataPagamento) continue;
    const valor = p.valorPago != null ? p.valorPago : p.valor;
    empilharChave(pagosPorChave, `${p.dataPagamento}|${cents(valor)}`, p);
  }

  const atualizados = [];
  for (const mov of movimentos) {
    if (mov.conciliacaoStatus === 'conciliado' || mov.conciliacaoStatus === 'ignorado') continue;
    const chave = `${mov.data}|${cents(Math.abs(mov.valor))}`;
    const candidatos = mov.valor >= 0 ? recebidosPorChave.get(chave) : pagosPorChave.get(chave);
    if (candidatos && candidatos.length === 1) {
      const alvo = candidatos[0];
      atualizados.push({
        ...mov,
        conciliacaoStatus: 'conciliado',
        conciliadoCom: { tipo: mov.valor >= 0 ? 'receber' : 'pagar', id: alvo.id, descricao: alvo.clienteNome || alvo.fornecedorNome },
        conciliadoEm: Date.now(),
        conciliadoPor: 'automatico',
      });
    }
  }
  return { movimentos: atualizados };
}

function empilharChave(mapa, chave, valor) {
  if (!mapa.has(chave)) mapa.set(chave, []);
  mapa.get(chave).push(valor);
}

/* --------------------------------------------------------------- pendências */

async function gerarPendencias({ nfs, itens, titulos, pagamentos, movimentos, produtos, pedidoPorNumero, pedidoPorClienteValor, pedidos }) {
  const anteriores = await store.pendencias.listar();
  const ignoradas = new Map(anteriores.filter((p) => p.status === 'ignorada').map((p) => [p.id, p]));
  const encontradas = [];

  const nova = (tipo, ref, dados) => {
    const id = `pend_${tipo}_${ref}`;
    const antiga = ignoradas.get(id);
    encontradas.push({
      id,
      tipo,
      ref,
      status: antiga ? 'ignorada' : 'aberta',
      motivoIgnorada: antiga?.motivoIgnorada || null,
      criadaEm: anteriores.find((p) => p.id === id)?.criadaEm || Date.now(),
      ...dados,
    });
  };

  /**
   * UMA VENDA, UMA PENDÊNCIA.
   *
   * Toda nota fiscal vem de um pedido. Antes o app tratava a nota e o pedido
   * dela como dois problemas: 336 notas e 334 pedidos viravam quase 700 itens
   * para resolver, e o "valor envolvido" contava o mesmo dinheiro duas vezes.
   *
   * Agora a conta é por venda. A nota que já chegou ao pedido não aparece: quem
   * responde por ela é o pedido. A nota que NÃO chegou a nenhum pedido aparece
   * uma vez, e o que ela pede não é vendedor — é o vínculo, que vem do contas a
   * receber. Cobrar vendedor de uma nota cujo pedido nem se sabe qual é seria
   * pedir para resolver à mão o que um relatório resolve sozinho.
   */
  const pedidoDaNota = (nf) => {
    if (nf.pedidoId) return true;
    if (nf.pedidoNumero && pedidoPorNumero.has(String(nf.pedidoNumero))) return true;
    return false;
  };

  for (const nf of nfs) {
    if (nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    if (nf.vendedorId) continue;

    // devolução é outro problema, com outra pergunta: não "de qual pedido veio",
    // e sim "de quem era a venda que voltou, para abater dele"
    if (nf.devolucao) {
      nova('devolucao_sem_origem', nf.id, {
        titulo: `Devolução NF ${nf.numero}`,
        detalhe: `${nf.clienteNome || 'cliente não identificado'} · emissão ${formatDate(nf.dataEmissao)}`
          + ' · nenhuma nota original com este cliente e este mesmo valor',
        valor: nf.valorTotal,
        mes: nf.mes,
        motivo: 'devolucao_sem_original',
        alvo: { store: 'nfs', id: nf.id },
      });
      continue;
    }

    if (pedidoDaNota(nf)) continue;    // o pedido dela responde

    const { motivo, explicacao } = porQueSemVendedor(nf, pedidoPorNumero, pedidoPorClienteValor);
    nova('nf_sem_pedido', nf.id, {
      titulo: `NF ${nf.numero}`,
      detalhe: `${nf.clienteNome || 'cliente não identificado'} · emissão ${formatDate(nf.dataEmissao)} · ${explicacao}`,
      valor: nf.valorTotal,
      mes: nf.mes,
      motivo,
      pedidoNumero: nf.pedidoNumero || null,
      alvo: { store: 'nfs', id: nf.id },
    });
  }

  /* venda sem vendedor: é aqui que o relatório de comissão entra */
  for (const pedido of pedidos || []) {
    if (pedido.vendedorId) continue;
    const notas = nfs.filter((n) => (pedido.id && n.pedidoId === pedido.id)
      || (pedido.numero && n.pedidoNumero && String(n.pedidoNumero) === String(pedido.numero)));
    // só cobra vendedor de pedido que virou venda ou já tem nota
    if (!notas.length && pedido.concretizado !== true) continue;
    nova('pedido_sem_vendedor', pedido.id, {
      titulo: `Pedido ${pedido.numero || '(sem número)'}`,
      detalhe: [
        pedido.clienteNome || 'cliente não identificado',
        notas.length ? `${notas.length} NF(s): ${notas.map((n) => n.numero).filter(Boolean).slice(0, 4).join(', ')}` : 'ainda sem NF',
      ].join(' · '),
      valor: notas.length ? cents(sum(notas, (n) => n.valorTotal || 0)) : pedido.valorTotal,
      alvo: { store: 'pedidos', id: pedido.id },
    });
  }

  const nfIds = new Set(nfs.map((n) => n.id));
  const itensOrfaos = itens.filter((i) => !nfIds.has(i.nfId));
  if (itensOrfaos.length) {
    nova('item_sem_nf', 'geral', {
      titulo: `${itensOrfaos.length} item(ns) sem a NF correspondente`,
      detalhe: 'Importe o XML ou o relatório de notas do mesmo período.',
      valor: sum(itensOrfaos, (i) => i.valorTotal),
      quantidade: itensOrfaos.length,
    });
  }

  /**
   * Título que cita uma nota que não está na base só é divergência quando a
   * nota DEVERIA estar. O contas a receber vai até o fim do ano e cita notas de
   * meses que o relatório fiscal importado nem cobre — 324 avisos que não pedem
   * nada de ninguém. Só entra o que cai dentro da faixa de notas já importadas:
   * aí sim existe um buraco de verdade.
   */
  const numerosDeNota = nfs.map((n) => Number(docNumber(n.numero))).filter(Number.isFinite);
  const menorNota = numerosDeNota.length ? Math.min(...numerosDeNota) : null;
  const maiorNota = numerosDeNota.length ? Math.max(...numerosDeNota) : null;

  for (const t of titulos) {
    if (!t.nfNumero || t.nfId) continue;
    const n = Number(docNumber(t.nfNumero));
    const dentroDaFaixa = Number.isFinite(n) && menorNota != null && n >= menorNota && n <= maiorNota;
    if (!dentroDaFaixa) continue;
    nova('receber_sem_nf', t.id, {
      titulo: `Título ${t.documento} cita a NF ${t.nfNumero}`,
      detalhe: `${t.clienteNome} · vence ${formatDate(t.vencimento)}`,
      valor: t.valor,
      alvo: { store: 'receber', id: t.id },
    });
  }

  const semVinculo = movimentos.filter((m) => m.conciliacaoStatus === 'pendente');
  for (const mov of semVinculo) {
    nova('extrato_sem_vinculo', mov.id, {
      titulo: `${mov.valor >= 0 ? 'Entrada' : 'Saída'} de ${money(Math.abs(mov.valor))}`,
      detalhe: `${mov.descricao || 'sem descrição'} · ${formatDate(mov.data)}`,
      valor: Math.abs(mov.valor),
      alvo: { store: 'extrato', id: mov.id },
    });
  }

  const conciliadosIds = new Set(movimentos.filter((m) => m.conciliadoCom).map((m) => `${m.conciliadoCom.tipo}:${m.conciliadoCom.id}`));
  for (const t of titulos) {
    if (statusTitulo(t) === 'pago' && t.dataRecebimento && !conciliadosIds.has(`receber:${t.id}`)) {
      nova('pago_sem_banco', t.id, {
        titulo: `${t.clienteNome} — título ${t.documento}`,
        detalhe: `baixado em ${formatDate(t.dataRecebimento)}, sem lançamento igual no extrato`,
        valor: t.valorRecebido ?? t.valor,
        alvo: { store: 'receber', id: t.id },
      });
    }
  }

  const semCategoria = pagamentos.filter((p) => p.status !== 'pago' && !p.categoria);
  if (semCategoria.length) {
    nova('pagar_sem_categoria', 'geral', {
      titulo: `${semCategoria.length} pagamento(s) em aberto sem categoria`,
      detalhe: 'Atrapalha a visão de para onde o dinheiro está indo.',
      valor: sum(semCategoria, (p) => p.valor),
      quantidade: semCategoria.length,
    });
  }

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const vendidosSemCusto = new Set();
  for (const item of itens) {
    if (item.custoTotal != null) continue;
    const prod = produtoPorId.get(item.produtoId);
    if (prod && prod.custo != null) continue;
    vendidosSemCusto.add(item.produtoId);
  }
  if (vendidosSemCusto.size) {
    nova('produto_sem_custo', 'geral', {
      titulo: `${vendidosSemCusto.size} produto(s) vendidos sem custo cadastrado`,
      detalhe: 'A margem fica em branco para eles — o app não estima custo.',
      quantidade: vendidosSemCusto.size,
    });
  }

  // divergência faturamento fiscal x atribuído, mês a mês
  const meses = new Map();
  for (const nf of nfs) {
    if (!nf.mes || nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    if (!meses.has(nf.mes)) meses.set(nf.mes, { fiscal: 0, atribuido: 0, semVendedor: 0 });
    const valor = nf.devolucao ? -nf.valorTotal : nf.valorTotal;
    meses.get(nf.mes).fiscal += valor;
    if (nf.vendedorId) meses.get(nf.mes).atribuido += valor;
    else meses.get(nf.mes).semVendedor += valor;
  }
  for (const [mes, v] of meses) {
    if (sameMoney(v.fiscal, v.atribuido, 1)) continue;
    const diferenca = cents(v.fiscal - v.atribuido);
    // A diferença que as notas sem vendedor já explicam não é uma pendência
    // nova: é o mesmo dinheiro, dito de outro jeito. Só vira pendência o que
    // sobra DEPOIS de descontá-las — aí sim é algo que ninguém está vendo.
    const inexplicada = cents(diferenca - (v.semVendedor || 0));
    if (sameMoney(inexplicada, 0, 1)) continue;
    nova('divergencia_faturamento', mes, {
      titulo: `${mes}: diferença de ${money(inexplicada)} sem explicação`,
      detalhe: `fiscal ${money(v.fiscal)} × vendedores ${money(v.atribuido)}`
        + (v.semVendedor ? ` · ${money(v.semVendedor)} são notas sem vendedor` : ''),
      valor: inexplicada,
      mes,
    });
  }

  // grava: pendências que sumiram são apagadas (resolvidas de fato)
  const idsAtuais = new Set(encontradas.map((p) => p.id));
  const remover = anteriores.filter((p) => !idsAtuais.has(p.id)).map((p) => p.id);
  await store.pendencias.removerMuitos(remover);
  await store.pendencias.salvarMuitos(encontradas);

  return {
    total: encontradas.length,
    abertas: encontradas.filter((p) => p.status === 'aberta').length,
    resolvidas: remover.length,
  };
}

/**
 * Por que esta NF ficou sem vendedor? A resposta muda o que você precisa fazer:
 * importar o relatório do período certo, ou escolher o pedido na mão.
 */
export function porQueSemVendedor(nf, pedidoPorNumero, pedidoPorClienteValor) {
  const numero = nf.pedidoNumero ? String(nf.pedidoNumero) : null;
  if (!numero) {
    // a segunda ponte achou candidatos e se recusou a escolher: diga isso, e
    // diga quais são. Duas linhas de relatório resolvem melhor do que um palpite.
    const candidatos = candidatosPorClienteValor(nf, pedidoPorClienteValor);
    if (candidatos.length > 1) {
      const numeros = candidatos.map((c) => c.numero).filter(Boolean);
      const quais = numeros.slice(0, 4).join(', ') + (numeros.length > 4 ? '…' : '');
      return {
        motivo: 'pedidos_iguais',
        explicacao: `${candidatos.length} pedidos deste cliente com este mesmo valor (${quais}) — `
          + 'de vendedores diferentes, então o app não escolhe',
      };
    }
    return {
      motivo: 'sem_pedido',
      explicacao: 'a NF não informa o pedido, e nenhum pedido tem este cliente com este mesmo valor',
    };
  }
  const pedido = pedidoPorNumero?.get(numero);
  if (!pedido) {
    return { motivo: 'pedido_ausente', explicacao: `pedido ${numero} ainda não foi importado` };
  }
  if (!pedido.vendedorId) {
    return { motivo: 'pedido_sem_vendedor', explicacao: `pedido ${numero} está na base, mas sem vendedor` };
  }
  return { motivo: 'indefinido', explicacao: `pedido ${numero}` };
}

/** Define o vendedor de uma NF à mão — com registro de quem, quando e por quê. */
export async function definirVendedorDaNf(nfId, vendedorId, motivo) {
  const nf = await store.nfs.obter(nfId);
  if (!nf) throw new Error('NF não encontrada.');
  const antes = nf.vendedorId;
  await store.nfs.salvar({ ...nf, vendedorId, vendedorOrigem: 'manual', vendedorDefinidoEm: Date.now() });
  await store.registrar('vendedor_da_nf', {
    alvoId: nfId, alvo: `NF ${nf.numero}`, de: antes, para: vendedorId, motivo,
  });
  await recalcular();
}
