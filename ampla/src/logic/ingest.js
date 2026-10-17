/**
 * IMPORTAÇÃO
 *
 * Uma informação entra uma vez (item 19 do projeto). Aqui o arquivo bruto vira
 * registro canônico, com quatro garantias:
 *
 *  1. NADA É OBRIGATÓRIO. O app importa o arquivo como ele é e depois avisa o
 *     que ficou faltando — nunca recusa a linha nem bloqueia o envio;
 *  2. o que não dá para ler vira AVISO com o número da linha, e o campo fica
 *     vazio em vez de ser preenchido por suposição;
 *  3. registro já existente é reconhecido pela chave natural e ATUALIZADO,
 *     nunca duplicado (item 16). Sem chave, a identidade é o conteúdo da linha;
 *  4. o que foi ajustado à mão no app é preservado numa reimportação.
 */

import { parseNumber, parseAnyDate, monthKey, today, money } from '../core/format.js';
import { normalize, key as chaveTexto, digits, docNumber, uid, hashString, cents } from '../core/util.js';
import { FONTES } from '../data/sources.js';
import { rowsToObjects } from '../core/files/read.js';
import * as store from '../core/store.js';
import { FONTES_FOTOGRAFIA, aplicarFotografia } from './fotografia.js';
import * as db from '../core/db.js';

/** Campos que o app calcula ou o usuário edita — uma reimportação não pode apagar. */
const PRESERVAR = {
  nfs: ['vendedorId', 'vendedorOrigem', 'vendedorDefinidoEm', 'pedidoId', 'pedidoOrigem', 'observacao'],
  receber: ['vendedorId', 'nfId', 'observacao', 'contatoPreferido'],
  pagar: ['prorrogadoPara', 'prorrogacaoMotivo', 'observacaoInterna'],
  extrato: ['conciliacaoStatus', 'conciliadoCom', 'conciliadoEm', 'conciliadoPor'],
  /**
   * O custo que ela digitou no pedido sobrevive à reimportação do relatório de
   * vendas — senão o acerto de outubro se perderia no primeiro arquivo novo de
   * novembro, que é exatamente quando ela não estaria olhando.
   */
  pedidos: ['custoManual', 'custoManualEm', 'custoManualPor'],
  produtos: ['comissaoRegraId', 'categoriaManual'],
  clientes: ['contato', 'telefone', 'email', 'observacao'],
  vendedores: ['apelidos', 'meta', 'ativo'],
  comissoesRelatorio: ['observacao'],
};

/* ------------------------------------------------------------- mapeamento */

/**
 * Sugere coluna → campo comparando o cabeçalho com os sinônimos da fonte.
 * É só sugestão: quem confirma é o usuário, na tela de importação.
 */
export function sugerirMapeamento(fonteId, cabecalho) {
  const fonte = FONTES[fonteId];
  if (!fonte) return {};
  const colunas = cabecalho.map((c) => ({ nome: c, norma: normalize(c), chave: chaveTexto(c) }));
  const usadas = new Set();
  const mapa = {};

  for (const campo of fonte.campos) {
    const alvos = [campo.label, campo.chave, ...(campo.sinonimos || [])];
    const normas = alvos.map(normalize);
    const chaves = alvos.map(chaveTexto);

    let achada = colunas.find((c) => !usadas.has(c.nome) && normas.includes(c.norma))
      || colunas.find((c) => !usadas.has(c.nome) && chaves.includes(c.chave));

    if (!achada) {
      // tolera "Vl. Total R$" x "valor total": compara por começo/contido
      achada = colunas.find((c) => !usadas.has(c.nome) && c.chave.length >= 4
        && chaves.some((k) => k.length >= 4 && (c.chave.startsWith(k) || k.startsWith(c.chave))));
    }
    if (achada) { mapa[campo.chave] = achada.nome; usadas.add(achada.nome); }
  }
  return mapa;
}

/**
 * Campos-chave que não foram ligados. É só informação para a tela: não impede
 * nada. Sem chave, o app identifica o registro pelo conteúdo da linha.
 */
export function camposSemLigacao(fonteId, mapeamento) {
  const fonte = FONTES[fonteId];
  if (!fonte) return [];
  return fonte.campos.filter((c) => c.chaveNatural && !mapeamento[c.chave]);
}

/* ------------------------------------------------------- leitura de valores */

/**
 * Lê um campo. NUNCA falha: valor que não dá para interpretar vira null + aviso,
 * e a linha entra assim mesmo.
 */
function ler(registro, mapeamento, campo) {
  const ligacao = mapeamento[campo.chave];
  if (!ligacao) return { valor: null, ausente: true };

  // Um campo pode vir de mais de uma coluna: o Gestão Click separa CPF e CNPJ
  // em duas, e cada linha preenche só a sua. Vale a primeira que tiver valor.
  const colunas = Array.isArray(ligacao) ? ligacao : [ligacao];
  const coluna = colunas.find((c) => temConteudo(registro[c]));
  if (!coluna) return { valor: null, ausente: true };
  const bruto = registro[coluna];

  if (campo.tipo === 'data') {
    const iso = parseAnyDate(bruto);
    return iso ? { valor: iso } : { valor: null, aviso: `${campo.label}: não entendi a data "${bruto}"` };
  }
  if (campo.tipo === 'dinheiro' || campo.tipo === 'numero' || campo.tipo === 'inteiro') {
    const n = parseNumber(bruto);
    if (n == null) return { valor: null, aviso: `${campo.label}: não entendi o número "${bruto}"` };
    return { valor: campo.tipo === 'inteiro' ? Math.round(n) : n };
  }
  return { valor: String(bruto).trim() };
}

/**
 * Célula com conteúdo de verdade. O Gestão Click escreve "-----" no lugar de
 * vazio, e sem isto o app criaria um grupo de produto chamado "-----" e um
 * fornecedor com o mesmo nome — dado que não existe, com cara de que existe.
 */
function temConteudo(valor) {
  if (valor == null) return false;
  const t = String(valor).trim();
  return t !== '' && !/^[-–—_.]+$/.test(t);
}

/**
 * COLUNA NOVA NUM RELATÓRIO CONHECIDO.
 *
 * Quando um perfil de fábrica casa, o app usava SÓ o mapa do perfil — então uma
 * coluna que ela passasse a exportar (a natureza da operação, o valor de varejo)
 * era ignorada em silêncio, e ela teria que esperar o perfil ser atualizado.
 *
 * Agora o perfil manda no que ele conhece, e o reconhecimento por sinônimo
 * preenche o resto. Coluna já usada pelo perfil não é reaproveitada, para duas
 * coisas nunca saírem da mesma coluna.
 */
export function completarMapeamento(fonteId, cabecalho, mapa) {
  const base = sugerirMapeamento(fonteId, cabecalho);
  const limpo = semColunaRepetida(fonteId, mapa);
  const ocupadas = new Set();
  for (const valor of Object.values(limpo)) {
    for (const col of Array.isArray(valor) ? valor : [valor]) if (col) ocupadas.add(col);
  }
  const completo = { ...limpo };
  for (const [campo, coluna] of Object.entries(base)) {
    if (completo[campo] != null) continue;
    if (ocupadas.has(coluna)) continue;
    completo[campo] = coluna;
    ocupadas.add(coluna);
  }
  return completo;
}

/**
 * DOIS CAMPOS NA MESMA COLUNA É SEMPRE ERRO — E ERA O ERRO DELA.
 *
 * "Tô mandando também a forma que as colunas estão se ligando."
 *
 * No print, lá embaixo: "Data do recebimento → Vencimento". Os dois campos
 * apontando para a MESMA coluna do arquivo. Todo título ganhava uma data de
 * recebimento igual ao próprio vencimento — sempre preenchida — e era essa data
 * que o recálculo lia como prova de que o título fora pago.
 *
 * A ligação vinha de um PERFIL SALVO, e `completarMapeamento` reaplicava o
 * perfil sem nunca conferir se ele próprio era coerente. Por isso sobreviveu a
 * apagar a base, a recomeçar do zero e a todas as reimportações: o estrago não
 * estava nos dados, estava na memória de como lê-los.
 *
 * Quem fica com a coluna é o campo declarado PRIMEIRO na fonte — `vencimento`
 * vem antes de `dataRecebimento`, e é o que o nome da coluna diz. O outro perde
 * a ligação e fica em branco, que é o certo: campo que o arquivo não tem fica
 * vazio, nunca preenchido por suposição.
 */
export function semColunaRepetida(fonteId, mapa) {
  const campos = (FONTES[fonteId]?.campos || []).map((c) => c.chave);
  const ordem = (chave) => {
    const i = campos.indexOf(chave);
    return i < 0 ? campos.length : i;
  };
  const dono = new Map();
  for (const [campo, coluna] of Object.entries(mapa || {})) {
    if (Array.isArray(coluna) || !coluna) continue;
    const atual = dono.get(coluna);
    if (atual == null || ordem(campo) < ordem(atual)) dono.set(coluna, campo);
  }
  const saida = {};
  for (const [campo, coluna] of Object.entries(mapa || {})) {
    if (Array.isArray(coluna) || !coluna) { saida[campo] = coluna; continue; }
    if (dono.get(coluna) === campo) saida[campo] = coluna;
  }
  return saida;
}

/** Os campos que ficaram apontando para a mesma coluna, para a tela avisar. */
export function colunasRepetidas(mapa) {
  const porColuna = new Map();
  for (const [campo, coluna] of Object.entries(mapa || {})) {
    if (Array.isArray(coluna) || !coluna) continue;
    if (!porColuna.has(coluna)) porColuna.set(coluna, []);
    porColuna.get(coluna).push(campo);
  }
  return [...porColuna.entries()]
    .filter(([, campos]) => campos.length > 1)
    .map(([coluna, campos]) => ({ coluna, campos }));
}

/**
 * CPF E CNPJ VÊM EM DUAS COLUNAS SEPARADAS, cada linha preenchendo só a sua.
 * O app guarda um documento só por registro, então aqui a coluna que veio
 * preenchida vira o documento. Nunca sobrescreve o que já existe: se as duas
 * vierem na mesma linha, o CNPJ manda (é o documento da empresa).
 */
function juntarDocumentos(dados) {
  const pares = [['clienteDoc', 'clienteCpf'], ['fornecedorDoc', 'fornecedorCpf']];
  for (const [principal, reserva] of pares) {
    if (!temConteudo(dados[principal]) && temConteudo(dados[reserva])) dados[principal] = dados[reserva];
    delete dados[reserva];
  }
  return dados;
}

/** Converte uma linha inteira. Devolve o que deu para ler e os avisos do caminho. */
function lerLinha(fonte, registro, mapeamento) {
  const dados = {};
  const avisos = [];
  for (const campo of fonte.campos) {
    const r = ler(registro, mapeamento, campo);
    if (r.aviso) avisos.push(r.aviso);
    if (!r.ausente && r.valor != null) dados[campo.chave] = r.valor;
  }
  return { dados, avisos, vazia: Object.keys(dados).length === 0 };
}

/** Só para o teste: lê uma linha solta sem montar registro nem gravar nada. */
export function lerParaTeste(fonteId, registro, mapeamento) {
  return lerLinha(FONTES[fonteId], registro, mapeamento);
}

/* ------------------------------------------------------------- preparação */

/**
 * Dry-run: monta os registros e diz o que vai acontecer, sem gravar nada.
 * A gravação só acontece em confirmar().
 */
export async function prepararTabular({ fonteId, leitura, planilhaIndex = 0, headerRow = 0, mapeamento, contaId = null, mesReferencia = null, fotografiaCompleta = true }) {
  const fonte = FONTES[fonteId];
  if (!fonte) throw new Error(`Fonte desconhecida: ${fonteId}`);

  const planilha = leitura.planilhas[planilhaIndex];
  if (!planilha) throw new Error('Planilha não encontrada no arquivo.');
  const { registros } = rowsToObjects(planilha.linhas, headerRow);

  const contexto = await montarContexto();
  const saida = novoPreparo(fonteId, leitura);
  // o relatório financeiro é fotografia; ela pode dizer que este é parcial
  saida.fotografiaCompleta = fotografiaCompleta;

  /**
   * RELATÓRIO DE TOTAIS SEM MÊS NÃO PODE EXISTIR.
   *
   * O de produtos vendidos e o de comissão por produto são totais de um período:
   * nenhuma linha tem data. O mês vem da tela, e é ele que separa um arquivo do
   * outro — a chave de cada linha é mês + vendedor + produto.
   *
   * Sem mês, toda linha virava o MESMO registro, e três relatórios de três meses
   * colapsavam num só, com os números do último. Então o app nunca deixa o mês
   * vazio: na falta dele assume o mês corrente e DIZ que assumiu.
   */
  const mes = mesReferencia || (fonte.mesObrigatorio ? `${monthKey(today())}-01` : null);
  if (fonte.mesObrigatorio && !mesReferencia) {
    saida.avisos.push(
      'Este relatório não traz data em nenhuma linha e nenhum mês foi escolhido — o app assumiu '
      + `${monthKey(mes)}. Se for de outro mês, volte e escolha, senão os números entram no mês errado.`,
    );
  }

  const usados = new Map();

  for (const registro of registros) {
    const { dados, avisos, vazia } = lerLinha(fonte, registro, mapeamento);
    juntarDocumentos(dados);
    // linha totalmente vazia é separador/rodapé do relatório: passa batido
    if (vazia) continue;
    if (avisos.length) {
      saida.atencao.push({ linha: registro.__linha, motivo: avisos.join(' · '), dados: resumoLinha(registro) });
    }
    try {
      const construidos = await construir(fonteId, dados, {
        contexto, contaId, mesReferencia: mes, usados, linha: registro.__linha, bruto: registro,
      });
      for (const item of construidos) empilhar(saida, item);
    } catch (err) {
      // só chega aqui o que impede montar o registro (ex.: extrato sem conta escolhida)
      saida.erros.push({ linha: registro.__linha, motivo: err.message, dados: resumoLinha(registro) });
    }
  }

  /**
   * O MÊS ESCOLHIDO JÁ TEM NÚMEROS DE OUTRO ARQUIVO?
   *
   * Dois relatórios de totais no mesmo mês não somam: o segundo substitui o
   * primeiro, porque a chave é mês + vendedor + produto. Isso está certo quando
   * é o MESMO relatório reenviado, e é um estrago silencioso quando é um mês
   * diferente que foi marcado errado. O app não escolhe por ela — ele mostra.
   */
  await conferirMesOcupado(saida, fonte);
  conferirAproveitamento(saida, fonte, registros.length);
  conferirSituacoes(saida, fonte, mapeamento);
  await classificar(saida, contexto);
  conferirCoberturaDoReceber(saida);
  return saida;
}

/**
 * O QUE ESTE ARQUIVO VAI FAZER COM OS TÍTULOS — dito ANTES de ela confirmar.
 *
 * "Eu coloquei aqui os relatórios de contas a receber e a pagar. E só foi de
 *  pagamento, não tá indo de recebimento. Tá dando sempre a mesma coisa."
 *
 * A importação nunca mostrou quantos títulos entrariam em aberto e quantos como
 * recebidos. Ela confirmava, ia para o Caixa e só lá descobria que tudo tinha
 * entrado baixado — e então já era tarde, e a única pista era um aviso genérico
 * numa outra tela.
 *
 * Duas coisas aqui NUNCA podem passar caladas:
 *
 *  - a coluna Situação não ter sido ligada. Sem ela o app decide o estado de
 *    cada título por data ou por saldo, que é adivinhação com cara de leitura;
 *  - um relatório de títulos chegar sem NENHUM em aberto. É possível, mas é tão
 *    improvável num contas a receber que merece ser dito antes do "confirmar",
 *    e não depois.
 */
function conferirSituacoes(preparo, fonte, mapeamento) {
  if (!FONTES_FOTOGRAFIA[fonte.id]) return;
  const titulos = [...(preparo.porStore[fonte.store]?.values() || [])];
  if (!titulos.length) return;

  if (!mapeamento?.status) {
    preparo.avisos.push(
      'A coluna SITUAÇÃO não foi ligada a nenhuma coluna do arquivo. Sem ela o app não sabe o que '
      + 'está em aberto e o que já foi pago: ele passa a decidir por data ou por saldo, que é '
      + 'adivinhação. Volte um passo e ligue a coluna Situação — é a mais importante deste '
      + 'relatório.',
    );
  }

  const abertos = titulos.filter((t) => t.status === 'aberto');
  const porTexto = new Map();
  for (const t of titulos) {
    const k = t.statusArquivo || '(em branco)';
    if (!porTexto.has(k)) porTexto.set(k, { texto: k, total: 0, abertos: 0 });
    const g = porTexto.get(k);
    g.total += 1;
    if (t.status === 'aberto') g.abertos += 1;
  }
  /* o resumo fica guardado para a tela de conferência mostrar, não só avisar */
  preparo.situacoes = {
    total: titulos.length,
    abertos: abertos.length,
    baixados: titulos.length - abertos.length,
    porTexto: [...porTexto.values()].sort((a, b) => b.total - a.total),
  };

  if (!abertos.length) {
    const lista = preparo.situacoes.porTexto
      .map((g) => `${g.total}× "${g.texto}"`)
      .slice(0, 5)
      .join(', ');
    preparo.avisos.push(
      `ATENÇÃO: nenhum dos ${titulos.length} títulos deste arquivo vai entrar EM ABERTO — todos `
      + `seriam dados como pagos. As situações lidas foram: ${lista}. Se alguma dessas quer dizer `
      + '"ainda não recebi", NÃO confirme: o fluxo de caixa vai ficar zerado. Me diga qual é a '
      + 'palavra e eu conserto a leitura.',
    );
  }
}

/**
 * O ARQUIVO TINHA 1.232 LINHAS E SAIU 1 REGISTRO?
 *
 * O relatório de contas a receber dela começa com um painel de totais — "A
 * receber / Confirmado / Total" — logo acima da tabela de verdade. Se a linha de
 * cabeçalho escolhida cair nesse painel, o app casa a coluna "Total" com o campo
 * Valor, ignora todo o resto e monta UM registro, sem reclamar de nada.
 *
 * Um arquivo cheio que vira quase nada nunca é o que ela quis. O app não
 * conserta sozinho (quem escolhe o cabeçalho é ela, e pode haver motivo), mas
 * não pode deixar passar calado: um financeiro vazio por causa disso parece
 * "não tem movimento", que é a mentira mais cara que esta tela pode contar.
 */
function conferirAproveitamento(preparo, fonte, linhasDoArquivo) {
  if (linhasDoArquivo < 10) return;
  const montados = preparo.porStore[fonte.store]?.size || 0;
  if (montados >= linhasDoArquivo * 0.5) return;

  preparo.avisos.push(
    `O arquivo tem ${linhasDoArquivo} linha(s) de dados, mas só ${montados} registro(s) foram `
    + 'montados. Quase sempre isto quer dizer que a LINHA DE CABEÇALHO está errada — muitos '
    + 'relatórios trazem um painel de totais antes da tabela, e o app pode ter lido esse painel '
    + 'como se fossem os nomes das colunas. Volte um passo e escolha a linha que tem "Vencimento", '
    + '"Situação" e "Valor total".',
  );
}

/**
 * Tira do mês as linhas que sobraram do arquivo anterior.
 *
 * O que veio agora já está gravado com o id desta importação; o que ficou no
 * mesmo mês, do mesmo relatório, com id de outra importação, é sobra.
 */
async function substituirMesDoRelatorio(preparo, lote) {
  const fonte = FONTES[preparo.fonteId];
  const novas = lote.vendasProduto || [];
  if (!fonte?.mesObrigatorio || !novas.length) return null;

  const meses = new Set(novas.map((l) => l.mes).filter(Boolean));
  if (!meses.size) return null;

  const existentes = await db.getAll('vendasProduto');
  const sobras = existentes.filter((l) => meses.has(l.mes)
    && l.origemRelatorio === preparo.fonteId
    && l.importacaoId !== preparo.id);
  if (!sobras.length) return null;

  await store.vendasProduto.removerMuitos(sobras.map((l) => l.id));
  return {
    linhas: sobras.length,
    valor: cents(sobras.reduce((a, l) => a + (l.valorTotal || 0), 0)),
  };
}

async function conferirMesOcupado(preparo, fonte) {
  if (!fonte.mesObrigatorio || !preparo.porStore.vendasProduto) return;
  const novas = [...preparo.porStore.vendasProduto.values()];
  const alvo = novas[0]?.mes;
  if (!alvo) return;

  const existentes = await db.getAll('vendasProduto');
  const deOutroArquivo = existentes.filter((l) => l.mes === alvo
    && l.origemRelatorio === preparo.fonteId
    && l.importacaoId && l.importacaoId !== preparo.id);
  if (!deOutroArquivo.length) return;

  const total = cents(deOutroArquivo.reduce((a, l) => a + (l.valorTotal || 0), 0));
  preparo.avisos.push(
    `${alvo} já tem ${deOutroArquivo.length} linha(s) deste mesmo relatório, vindas de um arquivo `
    + `anterior e somando ${money(total)}. Elas serão SUBSTITUÍDAS pelas deste arquivo: o mês fica `
    + 'valendo só o que vier aqui. Se este relatório for de outro mês, volte e escolha o mês certo '
    + '— senão um mês some. E se você manda o mês em mais de um arquivo, junte-os em um só antes '
    + 'de importar.',
  );
}

/**
 * O CONTAS A RECEBER SÓ COM OS "EM ABERTO".
 *
 * É a ponte mais forte entre a nota e o pedido — e a que mais silenciosamente
 * falha. No relatório de verdade que chegou aqui, os 398 títulos vieram TODOS
 * com situação "Em aberto": nenhum recebido. Só que o título de uma venda já
 * recebida é justamente o que ligaria a nota daquele mês ao pedido dela. Sem
 * eles, das 336 notas do mês apenas 74 tinham por onde atravessar.
 *
 * O app não pode consertar o filtro do export, mas pode dizer, na hora, o que
 * mudar — em vez de deixar a pessoa achar que mandou o relatório certo.
 */
function conferirCoberturaDoReceber(preparo) {
  if (preparo.fonteId !== 'receber') return;
  const titulos = [...(preparo.porStore.receber?.values() || [])];
  if (titulos.length < 20) return;   // arquivo pequeno não diz nada sobre filtro
  const recebidos = titulos.filter((t) => t.status === 'pago' || t.dataRecebimento).length;
  if (recebidos > 0) return;
  preparo.avisos.push(
    `Todos os ${titulos.length} títulos deste arquivo estão EM ABERTO — nenhum recebido. `
    + 'É o título da venda já recebida que liga a nota fiscal ao pedido; sem ele, as notas do '
    + 'mês que já foram pagas ficam sem vendedor. Exporte o contas a receber do mês SEM o filtro '
    + 'de situação (ou com "Recebido" junto) uma vez, e essa ponte fecha de vez.',
  );
}

/** NF-e em XML (ou ZIP de XMLs): não precisa de mapeamento, o layout é fixo. */
export async function prepararNfe({ leitura }) {
  const contexto = await montarContexto();
  const saida = novoPreparo('nfs', leitura);
  const notas = leitura.nfe?.notas || [];
  const eventos = leitura.nfe?.eventos || [];

  for (const nota of notas) {
    if (!nota.numero || !nota.dataEmissao || nota.valorTotal == null) {
      saida.erros.push({ linha: nota.chave || nota.numero || '?', motivo: 'XML sem número, data de emissão ou valor total.' });
      continue;
    }
    const nfId = idDaNota(
      { chave: nota.chave, numero: nota.numero, serie: nota.serie },
      { contexto },
    );
    const cliente = montarCliente(
      { cidade: nota.clienteMunicipio },
      { nome: nota.clienteNome, documento: nota.clienteDoc },
    );

    empilhar(saida, {
      store: 'nfs',
      registro: {
        id: nfId,
        chave: nota.chave || null,
        numero: String(nota.numero),
        serie: nota.serie || null,
        /**
         * O MODELO DO DOCUMENTO, que estava sendo lido e jogado fora.
         *
         *   55 = NF-e      venda com nota
         *   65 = NFC-e     cupom fiscal eletrônico, a venda no balcão
         *
         * A AMPLA não emite modelo 65 — "a gente só trabalha com a NF-e; tem uma
         * loja que vai abrir, mas agora não tem". O campo fica guardado porque a
         * loja vai abrir, e no dia em que abrir o app já sabe separar as duas
         * coisas sem ninguém mexer em nada.
         *
         * E fica aqui o registro do erro: eu atribuí a diferença entre o
         * relatório de produtos vendidos e as notas a uma venda de balcão que não
         * existe, em vez de olhar o relatório linha por linha. A diferença era
         * outra base (vendas do mês × notas do mês) mais 14 linhas com a unidade
         * trocada. Modelo de documento não explica buraco de valor.
         */
        modelo: nota.modelo || null,
        dataEmissao: nota.dataEmissao,
        mes: monthKey(nota.dataEmissao),
        clienteId: cliente?.id || null,
        clienteNome: nota.clienteNome || null,
        clienteDoc: digits(nota.clienteDoc) || null,
        valorTotal: cents(nota.valorTotal),
        valorProdutos: nota.valorProdutos == null ? null : cents(nota.valorProdutos),
        valorFrete: nota.valorFrete == null ? null : cents(nota.valorFrete),
        valorDesconto: nota.valorDesconto == null ? null : cents(nota.valorDesconto),
        operacao: nota.operacao,
        /**
         * No XML a devolução tem DUAS provas, e as duas valem:
         *  • finNFe = 4 é o campo oficial da finalidade;
         *  • a natureza da operação separa devolução de VENDA (o cliente
         *    devolveu) de devolução de COMPRA (a AMPLA devolveu ao fornecedor),
         *    que o campo finNFe sozinho não distingue.
         */
        ...classificarNatureza(nota.naturezaOperacao),
        devolucao: nota.finalidade === '4'
          ? !classificarNatureza(nota.naturezaOperacao).devolucaoDeCompra
          : classificarNatureza(nota.naturezaOperacao).devolucao,
        pedidoNumero: docNumber(nota.itens.find((i) => i.pedidoXml)?.pedidoXml || '') || null,
        pedidoOrigem: nota.itens.some((i) => i.pedidoXml) ? 'xml' : null,
        vendedorNome: null,
        status: 'autorizada',
        infoComplementar: nota.infoComplementar,
        origem: 'xml',
      },
    });

    if (cliente) empilhar(saida, { store: 'clientes', registro: cliente });

    for (const item of nota.itens) {
      if (item.valorTotal == null || item.quantidade == null) {
        saida.erros.push({ linha: `NF ${nota.numero} item ${item.seq}`, motivo: 'Item sem quantidade ou valor.' });
        continue;
      }
      const produtoId = idDoProduto({ codigo: item.produtoCodigo, descricao: item.descricao }, { contexto });
      empilhar(saida, {
        store: 'nfItens',
        registro: {
          id: `${nfId}#${item.seq || chaveTexto(item.produtoCodigo || item.descricao)}`,
          nfId,
          nfNumero: String(nota.numero),
          seq: item.seq,
          mes: monthKey(nota.dataEmissao),
          data: nota.dataEmissao,
          produtoId,
          produtoCodigo: item.produtoCodigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: cents(item.valorTotal),
          desconto: item.desconto || 0,
          custoUnitario: null,
          custoTotal: null,
          origem: 'xml',
        },
      });
      empilhar(saida, {
        store: 'produtos',
        registro: {
          id: produtoId,
          codigo: item.produtoCodigo || null,
          descricao: item.descricao || null,
          unidade: item.unidade || null,
          ncm: item.ncm || null,
          categoria: null,
          custo: null,
          origem: 'xml',
        },
      });
    }
  }

  for (const evento of eventos) {
    if (!evento.cancelamento || !evento.chave) continue;
    saida.cancelamentos.push(evento);
  }

  /**
   * O XML DA NOTA NÃO DIZ QUE ELA FOI CANCELADA.
   *
   * O cancelamento é outro documento — um evento (tpEvento 110111), em arquivo
   * separado. O XML da própria nota continua dizendo "Autorizado o uso da NF-e"
   * para sempre, mesmo depois de cancelada.
   *
   * Num lote de 550 notas sem nenhum evento, ou ninguém cancelou nada no mês, ou
   * (o caso comum) o export não trouxe os eventos — e aí a nota cancelada conta
   * como faturamento e gera comissão. O app não tem como saber qual dos dois é,
   * então ele AVISA, em vez de escolher.
   */
  if (notas.length >= 20 && !saida.cancelamentos.length) {
    saida.avisos.push(
      `${notas.length} notas e nenhum evento de cancelamento no lote. O XML da nota não diz que ela `
      + 'foi cancelada — isso vem em arquivo separado. Se houve cancelamento no período, mande o '
      + 'relatório de notas fiscais com a coluna SITUAÇÃO: é ele que marca "Cancelada", e a nota '
      + 'cancelada sai do faturamento e da comissão.',
    );
  }

  await classificar(saida, contexto);
  return saida;
}

/** Extrato em OFX: o FITID do banco é a garantia contra duplicidade. */
export async function prepararOfx({ leitura, contaId }) {
  if (!contaId) throw new Error('Escolha a conta bancária deste extrato.');
  const contexto = await montarContexto();
  const saida = novoPreparo('extrato', leitura);
  const ofx = leitura.ofx;
  const usados = new Map();

  for (const mov of ofx.movimentos) {
    const id = idExtrato({ contaId, fitid: mov.fitid, data: mov.data, valor: mov.valor, descricao: mov.descricao }, usados);
    empilhar(saida, {
      store: 'extrato',
      registro: {
        id,
        contaId,
        fitid: mov.fitid || null,
        data: mov.data,
        mes: monthKey(mov.data),
        descricao: mov.descricao || mov.tipo || 'Lançamento',
        documento: mov.documento || null,
        valor: cents(mov.valor),
        tipo: mov.valor >= 0 ? 'entrada' : 'saida',
        conciliacaoStatus: 'pendente',
        conciliadoCom: null,
        origem: 'ofx',
      },
    });
  }

  if (ofx.saldo?.valor != null && ofx.saldo.data) {
    empilhar(saida, {
      store: 'saldos',
      registro: {
        id: `sal_${contaId}_${ofx.saldo.data}`,
        contaId,
        data: ofx.saldo.data,
        saldo: cents(ofx.saldo.valor),
        origem: 'ofx',
      },
    });
  }
  saida.periodo = { de: ofx.periodo?.de || null, ate: ofx.periodo?.ate || null };
  await classificar(saida, contexto);
  return saida;
}

/* ------------------------------------------------ construção por tipo de fonte */

async function construir(fonteId, d, ctx) {
  if (fonteId === 'nfs') return construirNf(d, ctx);
  if (fonteId === 'nfItens') return construirItem(d, ctx);
  if (fonteId === 'comissaoProduto' || fonteId === 'produtosVendidos') return construirVendaProduto(d, ctx, fonteId);
  if (fonteId === 'fretes') return construirFrete(d, ctx);
  if (fonteId === 'pedidos') return construirPedido(d, ctx);
  if (fonteId === 'orcamentos') return construirOrcamento(d, ctx);
  if (fonteId === 'comissoes') return construirComissao(d, ctx);
  if (fonteId === 'receber') return construirReceber(d, ctx);
  if (fonteId === 'pagar') return construirPagar(d, ctx);
  if (fonteId === 'extrato') return construirExtrato(d, ctx);
  if (fonteId === 'saldos') return construirSaldo(d, ctx);
  if (fonteId === 'produtos') return construirProduto(d, ctx);
  if (fonteId === 'clientes') return [{ store: 'clientes', registro: montarCliente(d, { nome: d.nome, documento: d.documento }) }];
  if (fonteId === 'vendedores') return construirVendedor(d);
  throw new Error(`Fonte sem construtor: ${fonteId}`);
}

/** Identidade de emergência: o conteúdo da própria linha do arquivo. */
function daLinha(ctx) {
  return hashString(JSON.stringify(ctx?.bruto || {}));
}

function construirNf(d, ctx) {
  const id = d.numero
    ? idDaNota(d, ctx)
    : unico(`nf_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'nfs',
    registro: {
      id,
      chave: d.chave || null,
      numero: d.numero ? String(d.numero) : null,
      serie: d.serie || null,
      dataEmissao: d.dataEmissao || null,
      mes: d.dataEmissao ? monthKey(d.dataEmissao) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      valorProdutos: d.valorProdutos == null ? null : cents(d.valorProdutos),
      valorFrete: d.valorFrete == null ? null : cents(d.valorFrete),
      operacao: interpretarOperacao(d.operacao),
      ...classificarNatureza(d.naturezaOperacao),
      pedidoNumero: d.pedidoNumero ? docNumber(d.pedidoNumero) : null,
      pedidoOrigem: d.pedidoNumero ? 'relatorio' : null,
      vendedorNome: d.vendedorNome || null,
      status: interpretarStatusNf(d.status),
      statusArquivo: d.status || null,
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

/**
 * Linha de um relatório de produto AGREGADO (comissão por produto, produtos
 * vendidos). Não é item de nota: é o total de um produto num período.
 *
 * A chave natural é produto + vendedor + mês. Reimportar o mesmo relatório
 * ATUALIZA a linha em vez de somar de novo — é a mesma regra de todo o resto do
 * app, e é o que faz o reenvio diário não inflar número nenhum.
 *
 * Sem mês não há chave: o registro entra com a data que vier e, se não vier
 * nenhuma, usa o mês escolhido na importação. O app não escolhe um por ela.
 */
/**
 * Uma linha de custo de frete, da planilha dela.
 *
 * FROTA PRÓPRIA ou TERCEIRO sai do texto da coluna de tipo — e quando a coluna
 * não vier, o app não adivinha: fica "não classificado", aparece assim na tela e
 * continua somando no total, porque o dinheiro saiu de qualquer jeito.
 *
 * A chave natural é data + quem + descrição + valor. Reenviar a planilha do mês
 * atualiza as linhas em vez de somar de novo — a mesma regra de todo o resto.
 */
function construirFrete(d, ctx) {
  const data = d.data || ctx.mesReferencia || null;
  const valor = d.valor == null ? null : cents(d.valor);
  const tipo = classificarFrete(d.tipo);
  const quem = d.responsavel ? String(d.responsavel).trim() : null;
  const referencia = [data || 'sem', chaveTexto(quem || ''), chaveTexto(d.descricao || '').slice(0, 20), valor ?? 'sv']
    .join('_');

  return [{
    store: 'fretes',
    registro: {
      id: unico(`fre_${referencia}`, ctx.usados),
      data,
      mes: data ? monthKey(data) : null,
      tipo,
      tipoArquivo: d.tipo || null,
      responsavel: quem,
      descricao: d.descricao || null,
      veiculo: d.veiculo || null,
      nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
      vendedorNome: d.vendedorNome || null,
      valor,
      origem: 'planilha',
    },
  }];
}

/**
 * Frota própria ou terceiro? Sai do texto que ela escreve na planilha. O que não
 * encaixar fica como 'indefinido' — o custo continua contando, só não é separado.
 */
function classificarFrete(texto) {
  const t = normalize(texto || '');
  if (!t) return 'indefinido';
  if (/(propri|frota|interno|motorista|funcionari|salari)/.test(t)) return 'propria';
  if (/(terceir|transportadora|externo|contratad|autonom|freteiro)/.test(t)) return 'terceiro';
  return 'indefinido';
}

function construirVendaProduto(d, ctx, fonteId) {
  /**
   * LINHA DE TOTAL POR VENDEDOR não é produto.
   *
   * O relatório de comissão por produto fecha cada vendedor com uma linha sem
   * produto, repetindo a soma das linhas de cima. Importá-la DOBRARIA tudo: no
   * arquivo real, R$ 1.773.473,69 viravam R$ 3.546.947,33. Sem produto não há
   * registro — e isso é verificação exata, não palpite sobre o conteúdo.
   */
  if (!temConteudo(d.descricao) && !temConteudo(d.produtoCodigo)) return [];

  const produtoId = idDoProduto({ codigo: d.produtoCodigo, descricao: d.descricao }, ctx);
  const data = d.data || ctx.mesReferencia || null;
  const mes = data ? monthKey(data) : null;
  const vendedor = d.vendedorNome ? chaveTexto(d.vendedorNome) : 'todos';
  const custoTotal = d.custoTotal != null ? cents(d.custoTotal)
    : (d.custoUnitario != null && d.quantidade != null ? cents(d.custoUnitario * d.quantidade) : null);
  const valorTotal = d.valorTotal == null ? null : cents(d.valorTotal);
  // lucro vem do relatório quando existe; na falta dele, valor − custo, que é
  // subtração do que o arquivo trouxe, não estimativa
  const lucro = d.lucro != null ? cents(d.lucro)
    : (valorTotal != null && custoTotal != null ? cents(valorTotal - custoTotal) : null);

  return [
    {
      store: 'vendasProduto',
      registro: {
        id: `vp_${mes || 'sem'}_${vendedor}_${produtoId}`,
        // relatório de total: linha repetida do mesmo produto SOMA, não substitui
        __somar: ['quantidade', 'valorTotal', 'custoTotal', 'lucro', 'comissaoRelatorio'],
        origemRelatorio: fonteId,
        produtoId,
        produtoCodigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        vendedorNome: d.vendedorNome || null,
        quantidade: d.quantidade ?? null,
        valorTotal,
        custoUnitario: d.custoUnitario ?? null,
        custoTotal,
        lucro,
        comissaoRelatorio: d.comissao == null ? null : cents(d.comissao),
        data,
        mes,
        origem: 'relatorio',
      },
    },
    /**
     * O produto do cadastro NÃO recebe este custo como `custo`.
     *
     * O "custo médio" de um relatório de totais é a média de um período, numa
     * unidade que pode não ser a da venda — no arquivo real, parafuso com custo
     * médio de R$ 44,40 vendido a R$ 0,35, porque o relatório conta por caixa.
     * Gravar isso como o custo do produto contaminava o cadastro e saía como
     * margem de −66% num vendedor.
     *
     * Ele entra num campo próprio, que a margem usa só como plano B e com
     * verificação de unidade. O custo de verdade é o do RELATÓRIO DE PRODUTOS,
     * que traz código interno e custo por unidade de venda.
     */
    d.descricao || d.produtoCodigo ? {
      store: 'produtos',
      registro: {
        id: produtoId,
        codigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        custoMedioRelatorio: d.custoUnitario ?? null,
        origem: 'relatorio-vendas',
      },
    } : null,
  ].filter(Boolean);
}

function construirItem(d, ctx) {
  const nfId = idNf({ numero: d.nfNumero, serie: d.nfSerie });
  const nfExistente = ctx.contexto.nfs.get(nfId);
  const produtoId = idDoProduto({ codigo: d.produtoCodigo, descricao: d.descricao }, ctx);
  const data = nfExistente?.dataEmissao || null;
  const seq = d.seq || chaveTexto(d.produtoCodigo || d.descricao || '') || daLinha(ctx);
  const custoTotal = d.custoTotal != null ? d.custoTotal
    : (d.custoUnitario != null && d.quantidade != null ? cents(d.custoUnitario * d.quantidade) : null);

  return [
    {
      store: 'nfItens',
      registro: {
        id: `${nfId}#${seq}`,
        nfId,
        nfNumero: d.nfNumero ? String(d.nfNumero) : null,
        seq: d.seq || null,
        data,
        mes: data ? monthKey(data) : null,
        produtoId,
        produtoCodigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        unidade: d.unidade || null,
        quantidade: d.quantidade ?? null,
        valorUnitario: d.valorUnitario ?? null,
        valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
        custoUnitario: d.custoUnitario ?? null,
        custoTotal,
        origem: 'relatorio',
      },
    },
    {
      store: 'produtos',
      registro: {
        id: produtoId,
        codigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        custo: d.custoUnitario ?? null,
        origem: 'itens',
      },
    },
  ];
}

function construirPedido(d, ctx) {
  const numero = d.numero ? (docNumber(d.numero) || String(d.numero)) : null;
  const id = numero ? `ped_${numero}` : unico(`ped_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'pedidos',
    registro: {
      id,
      numero,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      valorCusto: d.valorCusto == null ? null : cents(d.valorCusto),
      statusArquivo: d.status || null,
      concretizado: concretizado(d.status),
      // o relatório de vendas não traz vendedor: fica para você definir no app
      vendedorNome: d.vendedorNome || null,
      vendedorId: null,
      nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirOrcamento(d, ctx) {
  const numero = d.numero ? (docNumber(d.numero) || String(d.numero)) : null;
  const id = numero ? `orc_${numero}` : unico(`orc_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'orcamentos',
    registro: {
      id,
      numero,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      statusArquivo: d.status || null,
      situacao: situacaoOrcamento(d.status),
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

/**
 * Uma linha do relatório de comissão. Guardada crua de propósito: é a única
 * fonte que liga venda a vendedor, e guardar a linha faz o vínculo sobreviver
 * quando o relatório chega antes dos pedidos ou das notas.
 */
function construirComissao(d, ctx) {
  const numero = d.numero ? (docNumber(d.numero) || String(d.numero)) : null;
  const cliente = montarCliente(d, { nome: d.clienteNome });
  const id = numero ? `com_${numero}` : unico(`com_x${daLinha(ctx)}`, ctx.usados);

  const saida = [{
    store: 'comissoesRelatorio',
    registro: {
      id,
      numero,
      clienteNome: d.clienteNome || null,
      clienteId: cliente?.id || null,
      vendedorNome: d.vendedorNome || null,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      valor: d.valor == null ? null : cents(d.valor),
      // o que o SISTEMA calculou, por pedido. O app recalcula sobre a nota.
      comissaoRelatorio: d.comissao == null ? null : cents(d.comissao),
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirReceber(d, ctx) {
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  // a descrição do relatório financeiro é o número do pedido
  const pedidoNumero = d.descricao ? docNumber(d.descricao) : null;
  const nfNumero = d.nfNumero ? docNumber(d.nfNumero) : null;
  const referencia = nfNumero || pedidoNumero || daLinha(ctx);
  const valor = d.valor == null ? null : cents(d.valor);
  // O VENCIMENTO NÃO ENTRA NA CHAVE. Boleto prorrogado é o mesmo boleto com
  // outra data: se a data identificasse o título, o relatório do dia seguinte
  // criaria um segundo e o valor apareceria em dobro no caixa e na
  // inadimplência. Parcelas do mesmo documento se separam pelo valor e, quando
  // até o valor é igual, pela ordem no arquivo — e aí elas são intercambiáveis,
  // porque não há mais nada que as diferencie.
  const id = unico(`rec_${cliente?.id || 'sem'}_${referencia}_${valor ?? 'sv'}`, ctx.usados);
  // a situação do arquivo é a verdade: a baixa aconteceu no sistema dela
  const situacao = interpretarStatusTitulo(d.status, null, d.dataRecebimento);
  const quitado = situacao === 'pago';

  return [
    {
      store: 'receber',
      registro: {
        id,
        documento: d.descricao || null,
        descricao: d.descricao || null,
        pedidoNumero,
        nfNumero,
        nfId: null,
        clienteId: cliente?.id || null,
        clienteNome: d.clienteNome || null,
        emissao: d.emissao || null,
        vencimento: d.vencimento || null,
        valor,
        valorRecebido: quitado ? valor : null,
        saldo: quitado ? 0 : valor,
        dataRecebimento: d.dataRecebimento || null,
        formaPagamento: d.formaPagamento || null,
        banco: d.banco || null,
        statusArquivo: d.status || null,
        status: situacao,
        /**
         * POR QUE O APP DEU ISSO COMO BAIXADO.
         *
         * Guardar o motivo é o que permite a tela responder "e os recebimentos,
         * por que estão zerados?" sem ninguém abrir o arquivo de novo. Sem ele,
         * um título pago é indistinguível de um título mal lido.
         */
        baixaMotivo: quitado ? motivoDaBaixa(d.status, d.dataRecebimento) : null,
        /* reimportado em aberto: a baixa por ausência de antes não vale mais */
        baixadoPorAusencia: quitado ? undefined : false,
        vendedorId: null,
        origem: 'relatorio',
      },
    },
    cliente && { store: 'clientes', registro: cliente },
  ].filter(Boolean);
}

function construirPagar(d, ctx) {
  const fornecedor = d.fornecedorNome || d.fornecedorDoc ? {
    id: store.idFornecedor({ nome: d.fornecedorNome, documento: d.fornecedorDoc }),
    nome: d.fornecedorNome ? String(d.fornecedorNome).trim() : null,
    documento: digits(d.fornecedorDoc) || null,
    origem: 'relatorio',
  } : null;
  const referencia = d.descricao ? chaveTexto(d.descricao).slice(0, 24)
    : (d.nfNumero ? docNumber(d.nfNumero) : daLinha(ctx));
  const valorPag = d.valor == null ? null : cents(d.valor);
  // mesmo motivo do contas a receber: conta prorrogada é a mesma conta
  const id = unico(`pag_${fornecedor?.id || 'sem'}_${referencia}_${valorPag ?? 'sv'}`, ctx.usados);
  /**
   * A MESMA LEITURA DO CONTAS A RECEBER, E NÃO UMA SEGUNDA REGRA.
   *
   * Aqui havia uma regex própria, com exatamente o mesmo defeito que foi
   * consertado do outro lado: /pago/ casava com "NÃO PAGO". Duas leituras para a
   * mesma pergunta é como um conserto arruma metade do app — os pagamentos dela
   * voltaram pelo reparo da base e teriam quebrado de novo na importação
   * seguinte, porque esta linha nunca soube da correção.
   */
  const situacaoPag = interpretarStatusTitulo(d.status, null, d.dataPagamento);
  const pago = situacaoPag === 'pago';

  return [
    {
      store: 'pagar',
      registro: {
        id,
        fornecedorId: fornecedor?.id || null,
        fornecedorNome: d.fornecedorNome || null,
        fornecedorDoc: digits(d.fornecedorDoc) || null,
        documento: d.nfNumero ? docNumber(d.nfNumero) : null,
        descricao: d.descricao || null,
        nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
        vencimento: d.vencimento || null,
        valor: valorPag,
        categoria: d.categoria || null,
        formaPagamento: d.formaPagamento || null,
        banco: d.banco || null,
        statusArquivo: d.status || null,
        status: situacaoPag,
        dataPagamento: d.dataPagamento || null,
        valorPago: null,
        saldo: pago ? 0 : valorPag,
        baixaMotivo: pago ? motivoDaBaixa(d.status, d.dataPagamento) : null,
        /* reimportado em aberto: a baixa por ausência de antes não vale mais */
        baixadoPorAusencia: pago ? undefined : false,
        origem: 'relatorio',
      },
    },
    fornecedor && { store: 'fornecedores', registro: fornecedor },
  ].filter(Boolean);
}

function construirExtrato(d, ctx) {
  if (!ctx.contaId) throw new Error('Escolha a conta bancária deste extrato.');
  let valor = d.valor;
  if (valor == null) {
    const entrada = d.entrada || 0;
    const saidaValor = d.saida || 0;
    if (!entrada && !saidaValor) return [];   // linha sem valor: ignora em silêncio
    valor = entrada ? Math.abs(entrada) : -Math.abs(saidaValor);
  }
  const data = d.data || null;
  const id = idExtrato({ contaId: ctx.contaId, fitid: null, data: data || daLinha(ctx), valor, descricao: d.descricao }, ctx.usados);
  return [{
    store: 'extrato',
    registro: {
      id,
      contaId: ctx.contaId,
      fitid: null,
      data,
      mes: data ? monthKey(data) : null,
      descricao: d.descricao || 'Lançamento',
      documento: d.documento || null,
      valor: cents(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      conciliacaoStatus: 'pendente',
      conciliadoCom: null,
      origem: 'planilha',
    },
  }];
}

function construirSaldo(d, ctx) {
  const conta = acharConta(ctx.contexto.contas, d.banco);
  if (!conta) throw new Error(`Banco "${d.banco || '—'}" não está cadastrado em Bancos.`);
  const data = d.data || today();
  return [{
    store: 'saldos',
    registro: { id: `sal_${conta.id}_${data}`, contaId: conta.id, data, saldo: cents(d.saldo || 0), origem: 'planilha' },
  }];
}

function construirProduto(d, ctx) {
  const id = d.codigo || d.descricao
    ? idDoProduto({ codigo: d.codigo, descricao: d.descricao }, ctx)
    : unico(`prod_x${daLinha(ctx)}`, ctx.usados);
  return [{
    store: 'produtos',
    registro: {
      id,
      codigo: d.codigo || null,
      descricao: d.descricao || null,
      custo: d.custo ?? null,
      ncm: d.ncm || null,
      /**
       * O GRUPO vinha sendo lido do arquivo e jogado fora na montagem: a Curva
       * ABC por categoria agrupava 3.600 produtos em "Sem categoria". Agora
       * entra, junto com o preço de varejo e o estoque.
       */
      categoria: d.categoria || null,
      precoVenda: d.precoVenda ?? null,
      estoque: d.estoque ?? null,
      custoAtualizadoEm: d.custo != null ? today() : null,
      origem: 'cadastro',
    },
  }];
}

function construirVendedor(d) {
  const apelidos = d.apelidos ? String(d.apelidos).split(/[;,/|]/).map((x) => x.trim()).filter(Boolean) : [];
  return [{
    store: 'vendedores',
    registro: {
      id: `vend_${chaveTexto(d.codigo || d.nome || '').slice(0, 24) || uid()}`,
      nome: d.nome ? String(d.nome).trim() : 'Sem nome',
      codigo: d.codigo || null,
      apelidos,
      meta: d.meta ?? null,
      ativo: true,
      origem: 'cadastro',
    },
  }];
}

/** "Concretizada" é a única situação que conta como venda. */
function concretizado(status) {
  const t = normalize(status);
  if (!t) return null;                       // sem informação: não decide
  if (/concretizad|faturad|conclu|finalizad/.test(t)) return true;
  return false;
}

function situacaoOrcamento(status) {
  const t = normalize(status);
  if (!t) return null;
  if (/aprovad|convertid|concretizad|ganho/.test(t)) return 'convertido';
  if (/perdid|recusad|cancelad|reprovad/.test(t)) return 'perdido';
  return 'aberto';
}

/* ------------------------------------------------------------ chaves naturais */

/** "serie-numero", que é como a nota se identifica fora do XML. */
function chaveDeSerieNumero({ numero, serie }) {
  const n = docNumber(numero) || String(numero || '').trim();
  if (!n) return null;
  return `${String(serie ?? '').trim() || '1'}-${n}`;
}

/**
 * O id da nota, reaproveitando o de uma nota que já está na base com o mesmo
 * número e série — venha ela do XML ou do relatório. É o que faz os dois
 * arquivos descreverem a MESMA nota em vez de duas.
 */
function idDaNota(dados, ctx) {
  const chave = chaveDeSerieNumero(dados);
  const existente = chave ? ctx?.contexto?.nfPorSerieNumero?.get(chave) : null;
  return existente || idNf(dados);
}

export function idNf({ chave, numero, serie }) {
  if (chave && digits(chave).length === 44) return `nf_${digits(chave)}`;
  const n = docNumber(numero) || String(numero || '').trim();
  if (!n) return `nf_sem_numero`;
  const s = String(serie ?? '').trim() || '1';
  return `nf_${s}-${n}`;
}

function idTitulo(prefixo, { documento, parcela, clienteId, vencimento, valor }, usados) {
  const base = documento
    ? `${prefixo}_${clienteId}_${documento}_${parcela || '1'}`
    : `${prefixo}_${clienteId}_${vencimento}_${hashString(`${valor ?? ''}|${parcela ?? ''}`)}`;
  return unico(base, usados);
}

function idExtrato({ contaId, fitid, data, valor, descricao }, usados) {
  if (fitid) return `ext_${contaId}_${chaveTexto(fitid)}`;
  const base = `ext_${contaId}_${data}_${hashString(`${cents(valor)}|${normalize(descricao)}`)}`;
  return unico(base, usados);
}

/**
 * Duas linhas idênticas no mesmo arquivo são dois compromissos diferentes —
 * o sufixo mantém as duas, e reimportar o mesmo arquivo gera as mesmas chaves.
 */
function unico(base, usados) {
  if (!usados) return base;
  const n = (usados.get(base) || 0) + 1;
  usados.set(base, n);
  return n === 1 ? base : `${base}~${n}`;
}

/* ---------------------------------------------------------------- utilitários */

/**
 * Monta o cliente a partir de qualquer relatório. `identidade` diz onde estão o
 * nome e o documento naquele arquivo; o resto (telefone, e-mail…) é aproveitado
 * quando existir. Sem nome e sem documento, não cria cliente nenhum.
 */
function montarCliente(d, identidade = {}) {
  const nome = identidade.nome ?? d.nome ?? null;
  const documento = identidade.documento ?? d.documento ?? null;
  if (!nome && !digits(documento)) return null;
  return {
    id: store.idCliente({ documento, nome, codigo: d.codigo }),
    nome: nome ? String(nome).trim() : null,
    documento: digits(documento) || null,
    codigo: d.codigo || null,
    tipo: d.tipo || null,
    ie: d.ie || null,
    telefone: d.telefone || null,
    celular: d.celular || null,
    email: d.email || null,
    endereco: d.endereco || null,
    contato: d.contato || null,
    cidade: d.cidade || null,
    origem: 'importacao',
  };
}

function acharConta(contas, texto) {
  const alvo = chaveTexto(texto);
  if (!alvo) return null;
  return contas.find((c) => chaveTexto(c.nome) === alvo)
    || contas.find((c) => chaveTexto(c.banco) === alvo)
    || contas.find((c) => alvo.includes(chaveTexto(c.banco)) && chaveTexto(c.banco))
    || null;
}

/**
 * O QUE A NATUREZA DA OPERAÇÃO DIZ.
 *
 * "Devolução de VENDA" é o cliente devolvendo para a AMPLA: tira do faturamento
 * e abate a comissão. "Devolução de COMPRA" é a AMPLA devolvendo para o
 * fornecedor — nota emitida, mas não é venda nem anti-venda, e somar isso com
 * sinal negativo no faturamento seria inventar um estorno que não existe.
 *
 * Quando a natureza não vem no arquivo, nada é devolução: é o que o app sabe, e
 * a tela avisa que sem essa coluna a devolução passa como venda.
 */
/**
 * ARQUIVO QUE NÃO TEM A COLUNA NÃO PODE DESMARCAR O QUE O OUTRO MARCOU.
 *
 * O XML traz a natureza da operação e por ela o app sabe o que é DEVOLUÇÃO. O
 * relatório fiscal dela sai SEM essa coluna — e, importado depois do XML,
 * devolvia devolucao:false por cima do true que o XML tinha posto. Três notas de
 * setembro (3991, 4126 e 4229) voltavam a contar como venda, e como devolução
 * entra negativa, o faturamento mexia o dobro: R$ 7.965,32 a mais.
 *
 * Então, sem texto nenhum, esta função não devolve campo nenhum. "Não sei" não
 * pode virar "não é" — é a mesma regra que vale para zero e vazio no resto do
 * app.
 */
function classificarNatureza(texto) {
  if (!temConteudo(texto)) return {};
  const t = normalize(texto);
  const ehDevolucao = /devolu/.test(t);
  const deCompra = ehDevolucao && /(compra|fornecedor)/.test(t);
  return {
    naturezaOperacao: texto,
    devolucao: ehDevolucao && !deCompra,
    devolucaoDeCompra: deCompra,
  };
}

function interpretarOperacao(texto) {
  if (!texto) return 'saida';
  const t = normalize(texto);
  if (t === '0' || /entrada/.test(t)) return 'entrada';
  return 'saida';
}

function interpretarStatusNf(texto) {
  const t = normalize(texto);
  if (!t) return 'autorizada';
  if (/cancel/.test(t)) return 'cancelada';
  if (/denegad|inutiliz|rejeit/.test(t)) return 'invalida';
  return 'autorizada';
}

/**
 * A SITUAÇÃO DO TÍTULO, LIDA DO ARQUIVO.
 *
 * "Eu acabei de mandar o contas a pagar só a partir do dia 17 e o que tá em
 *  aberto, ou seja, não tinha nenhum pago. E não tá calhando, tá aparecendo
 *  zero. E eu sei que não é zero. Tem alguma coisa errada e não é o relatório."
 *
 * Ela estava certa. "NÃO PAGO" CONTÉM "PAGO". "NÃO RECEBIDO" CONTÉM "RECEBID".
 * A regra procurava esses pedaços no texto sem olhar a negação na frente, então
 * todo título em aberto do relatório dela entrava no app como baixado, com saldo
 * zero — e o fluxo de caixa ficava zerado com a base cheia de títulos.
 *
 * É o pior tipo de erro que este app pode ter: ele não dava erro, não deixava
 * aviso, e o número errado era um número redondo e tranquilo.
 *
 * Por isso a NEGAÇÃO É LIDA PRIMEIRO, e qualquer palavra que signifique "ainda
 * não aconteceu" vence as que significam "aconteceu". Entre errar para aberto e
 * errar para pago, errar para aberto é melhor: um título que aparece no caixa e
 * não devia é uma pergunta; um título que desaparece é um buraco silencioso.
 *
 * E "CONFIRMADO" QUER DIZER RECEBIDO — provado pelo relatório dela, ao centavo.
 *
 * O contas a receber de 01/08 a 31/12 traz no topo três números: "A receber
 * 1.329.116,53 (total a receber no período)", "Confirmado 1.275.435,33 (valores
 * já confirmados)" e "Total 2.604.551,86 (1232 cobranças)". Somando as 1232
 * linhas por situação:
 *
 *     548 Em aberto    1.305.654,69
 *      15 Atrasado        23.461,84   → juntos, 1.329.116,53 = "A receber"
 *     669 Confirmado   1.275.435,33   → igual ao "Confirmado" do topo
 *
 * Os dois baldes são disjuntos e somam o total. Então "Confirmado" não é um
 * título a receber que foi conferido: é dinheiro que já entrou. Ler isso como
 * aberto inflaria o caixa dela em R$ 1,27 milhão — o mesmo tipo de erro dos
 * R$ 600 mil, pelo caminho oposto.
 */
/**
 * QUAL FOI A EVIDÊNCIA que fez o app dar o título como baixado.
 *
 * "E os recebimentos? Que tá tudo zerado ainda nos recebimentos."
 *
 * Sem guardar isto, um título pago é indistinguível de um título mal lido, e a
 * única forma de descobrir qual é qual é abrir o arquivo de novo — trabalho que
 * este app existe para não existir. Com o motivo gravado, a tela responde.
 */
function motivoDaBaixa(statusArquivo, data) {
  if (statusArquivo && interpretarStatusTitulo(statusArquivo, null, null) === 'pago') return 'situacao';
  if (data) return 'data';
  return 'saldo';
}

/**
 * FAZER OS TÍTULOS GUARDADOS CONCORDAREM COM O QUE O ARQUIVO DIZIA.
 *
 * "Eu reenviei (...) e não foi. Tá dando sempre a mesma coisa."
 *
 * Cada conserto na leitura só alcança o que entra DEPOIS dele. Um título
 * gravado por uma versão antiga fica com o estado velho para sempre, e reenviar
 * o arquivo só resolve se o aparelho já estiver com o código novo — coisa que
 * ela não tem como saber, e que já a fez repetir o mesmo passo cinco vezes.
 *
 * Como cada título guarda `statusArquivo` (o texto cru da coluna Situação),
 * basta reler esse texto com a regra de hoje. Isto roda ao FIM DE CADA
 * IMPORTAÇÃO de título, sem ela pedir: a base inteira passa a concordar com os
 * arquivos, não só as linhas que vieram agora.
 *
 * NOS DOIS SENTIDOS: o que o arquivo diz em aberto abre, o que ele diz recebido
 * fecha. Um conserto que só abre trocaria um erro por outro e inflaria o caixa.
 *
 * NÃO TOCA no que ela baixou à mão nem no que foi baixado por ausência no
 * relatório seguinte: as duas são informação que o arquivo não tem.
 */
export async function relerSituacoesGravadas() {
  let reabertos = 0;
  let baixados = 0;
  let valorReaberto = 0;
  let valorBaixado = 0;

  for (const loja of ['receber', 'pagar']) {
    const titulos = await db.getAll(loja);
    const mudar = [];
    for (const t of titulos) {
      if (t.baixaManual || t.baixadoPorAusencia) continue;
      if (!t.statusArquivo) continue;

      const deveria = interpretarStatusDoArquivo(t.statusArquivo);
      if (deveria === 'cancelado') continue;
      const agora = t.status === 'pago' || t.status === 'cancelado' ? t.status : 'aberto';
      if (deveria === agora) continue;

      if (deveria === 'aberto') {
        mudar.push({
          ...t, status: 'aberto', saldo: t.valor ?? null, valorRecebido: null, valorPago: null, baixaMotivo: null,
        });
        reabertos += 1;
        valorReaberto += t.valor || 0;
      } else {
        mudar.push({ ...t, status: 'pago', saldo: 0, baixaMotivo: 'situacao' });
        baixados += 1;
        valorBaixado += t.valor || 0;
      }
    }
    if (mudar.length) await db.putMany(loja, mudar);
  }

  return {
    reabertos,
    baixados,
    mudados: reabertos + baixados,
    valorReaberto: cents(valorReaberto),
    valorBaixado: cents(valorBaixado),
  };
}

export function interpretarStatusDoArquivo(statusArquivo) {
  return interpretarStatusTitulo(statusArquivo, null, null);
}

function interpretarStatusTitulo(statusArquivo, saldo, dataRecebimento) {
  const t = normalize(statusArquivo);
  /* "baixad por perda" nunca casava com "baixado por perda" — faltava a letra */
  if (/cancel|baixad\w* por perda/.test(t)) return 'cancelado';
  if (emAbertoNoTexto(t)) return 'aberto';
  if (dataRecebimento || /pago|quitad|liquidad|recebid|baixad|confirmad/.test(t)) return 'pago';
  if (saldo != null && saldo <= 0) return 'pago';
  return 'aberto';
}

/**
 * O texto diz, em alguma das formas que os sistemas usam, que ainda está aberto?
 *
 * - negação: "não pago", "nao recebido", "sem baixa";
 * - futuro:  "a receber", "a pagar", "a vencer", "aguardando";
 * - estado:  "em aberto", "pendente", "vencido", "em atraso", "previsto";
 * - parcial: pagamento parcial não é baixa — o que falta continua em aberto.
 */
function emAbertoNoTexto(t) {
  if (!t) return false;
  if (/\b(nao|sem)\b/.test(t)) return true;
  if (/\ba (receber|pagar|vencer)\b/.test(t)) return true;
  if (/aberto|pendente|pendencia|vencid|atrasad|atraso|previst|programad|aguardand|parcial/.test(t)) return true;
  return false;
}

function resumoLinha(registro) {
  return Object.entries(registro)
    .filter(([k]) => k !== '__linha')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/* -------------------------------------------------- montagem e classificação */

function novoPreparo(fonteId, leitura) {
  return {
    id: uid('imp'),
    fonteId,
    arquivo: leitura.arquivo,
    formato: leitura.formato,
    hash: leitura.hash,
    porStore: {},
    erros: [],
    atencao: [],
    cancelamentos: [],
    avisos: leitura.aviso ? [leitura.aviso] : [],
    periodo: { de: null, ate: null },
    resumo: { total: 0, principal: 0, novos: 0, atualizados: 0, repetidos: 0 },
  };
}

function empilhar(preparo, { store: nome, registro }) {
  if (!preparo.porStore[nome]) preparo.porStore[nome] = new Map();
  const anterior = preparo.porStore[nome].get(registro.id);
  // dentro do mesmo arquivo, o último preenchimento ganha, sem perder o que veio antes
  preparo.porStore[nome].set(registro.id, anterior ? mesclarRegistro(anterior, registro) : registro);
}

/**
 * Duas linhas do mesmo arquivo com a mesma chave.
 *
 * Para um documento (uma NF, um título) isso é repetição e o último vence. Mas
 * num relatório de TOTAIS o mesmo produto pode aparecer duas vezes — o sistema
 * dela quebra a linha por algo que o app não importa, e as duas linhas são
 * vendas de verdade. Sobrescrever perdia dinheiro calado: no relatório real,
 * R$ 338 em duas linhas.
 *
 * Por isso o registro diz quais campos SOMAM quando repete. Só eles somam; o
 * resto continua sendo "o último preenchimento vence".
 */
function mesclarRegistro(base, novo) {
  const out = { ...base };
  const somar = new Set(novo.__somar || base.__somar || []);
  for (const [k, v] of Object.entries(novo)) {
    if (v == null) continue;
    if (somar.has(k) && typeof v === 'number' && typeof base[k] === 'number') out[k] = cents(base[k] + v);
    else out[k] = v;
  }
  return out;
}

async function montarContexto() {
  const [nfs, contas, produtos] = await Promise.all([
    store.nfs.listar(), store.contas.listar(), store.produtos.listar(),
  ]);
  const porDescricao = new Map();
  for (const p of produtos) {
    const chave = chaveTexto(p.descricao || '');
    if (chave && !porDescricao.has(chave)) porDescricao.set(chave, p.id);
  }
  /**
   * A MESMA NOTA VISTA POR DOIS ARQUIVOS.
   *
   * O XML identifica a nota pela CHAVE de 44 dígitos; o relatório fiscal só tem
   * número e série. Sem reconciliar, a NF 4061 entrava duas vezes — uma como
   * nf_<chave> e outra como nf_1-4061 — e aí o título que cita a 4061 achava
   * DUAS candidatas e o app se recusava a ligar, que é a regra certa aplicada a
   * um problema inventado por ele mesmo.
   *
   * Número e série identificam a nota sem ambiguidade dentro de um CNPJ: duas
   * notas com o mesmo par não existem. Então o par é a identidade, e a chave
   * entra como um dado a mais.
   */
  const porSerieNumero = new Map();
  for (const n of nfs) {
    const chave = chaveDeSerieNumero(n);
    if (chave && !porSerieNumero.has(chave)) porSerieNumero.set(chave, n.id);
  }
  return {
    nfs: new Map(nfs.map((n) => [n.id, n])),
    contas,
    produtos: new Map(produtos.map((p) => [p.id, p])),
    produtoPorDescricao: porDescricao,
    nfPorSerieNumero: porSerieNumero,
  };
}

/**
 * O MESMO PRODUTO VISTO POR DOIS ARQUIVOS DIFERENTES.
 *
 * O XML da NF-e identifica o produto pelo CÓDIGO interno; o relatório de
 * produtos vendidos só traz a DESCRIÇÃO. Sem reconciliar, "AREIA MEDIA ENSACADA
 * 20KG - PEDRASIL" virava dois produtos — e o custo que veio pelo relatório
 * nunca encontrava a venda que veio pelo XML. Na prática: margem de 100% e 2.430
 * itens "sem custo".
 *
 * A reconciliação é por DESCRIÇÃO IDÊNTICA, não parecida: mesmo texto, mesmo
 * produto. E só vale quando não há conflito de código — se os dois já têm código
 * e são códigos diferentes, são produtos diferentes mesmo com o nome igual, e o
 * app não junta.
 */
function idDoProduto({ codigo, descricao }, ctx) {
  const contexto = ctx?.contexto;
  if (codigo) {
    const porCodigo = store.idProduto({ codigo });
    if (contexto?.produtos?.has(porCodigo)) return porCodigo;
  }
  const chave = chaveTexto(descricao || '');
  const existente = chave ? contexto?.produtoPorDescricao?.get(chave) : null;
  if (existente) {
    const antigo = contexto.produtos.get(existente);
    const mesmoCodigo = !antigo?.codigo || !codigo
      || chaveTexto(antigo.codigo) === chaveTexto(codigo);
    if (mesmoCodigo) return existente;
  }
  return store.idProduto({ codigo, descricao });
}

/** Compara com o que já existe no banco: novo, atualizado ou repetido. */
async function classificar(preparo, contexto) {
  const datas = [];
  for (const [nome, mapa] of Object.entries(preparo.porStore)) {
    const existentes = new Map((await db.getAll(nome)).map((r) => [r.id, r]));
    const detalhe = { novos: 0, atualizados: 0, repetidos: 0 };

    for (const [id, registro] of mapa) {
      const antigo = existentes.get(id);
      if (!antigo) { detalhe.novos += 1; registro.__acao = 'novo'; } else {
        const mesclado = preservar(nome, antigo, registro);
        if (iguais(antigo, mesclado)) { detalhe.repetidos += 1; registro.__acao = 'repetido'; } else { detalhe.atualizados += 1; registro.__acao = 'atualizado'; }
        mapa.set(id, mesclado);
      }
      for (const campo of ['dataEmissao', 'data', 'vencimento']) {
        if (registro[campo]) datas.push(registro[campo]);
      }
    }
    preparo.resumo.total += mapa.size;
    // o que ela mandou são notas, ou títulos — os clientes criados de tabela
    // são consequência. Contar tudo junto faria "4 notas" virar "8 registros".
    if (nome === FONTES[preparo.fonteId]?.store) preparo.resumo.principal = mapa.size;
    preparo.resumo.novos += detalhe.novos;
    preparo.resumo.atualizados += detalhe.atualizados;
    preparo.resumo.repetidos += detalhe.repetidos;
    preparo[`detalhe_${nome}`] = detalhe;
  }
  if (datas.length && !preparo.periodo.de) {
    datas.sort();
    preparo.periodo = { de: datas[0], ate: datas[datas.length - 1] };
  }
  if (contexto) preparo.__contexto = null;
  return preparo;
}

/** Mantém o que foi decidido dentro do app (vendedor definido à mão, conciliação…). */
function preservar(nome, antigo, novo) {
  const out = { ...antigo, ...novo };
  for (const campo of PRESERVAR[nome] || []) {
    if (antigo[campo] != null && (novo[campo] == null || novo[campo] === '')) out[campo] = antigo[campo];
  }
  // vendedor que você definiu (à mão ou confirmando um pedido) não volta atrás
  if (nome === 'nfs' && ['manual', 'pedido-confirmado'].includes(antigo.vendedorOrigem)) {
    out.vendedorId = antigo.vendedorId;
    out.vendedorOrigem = antigo.vendedorOrigem;
    out.pedidoId = antigo.pedidoId || null;
  }
  if (nome === 'extrato' && antigo.conciliacaoStatus === 'conciliado') {
    out.conciliacaoStatus = 'conciliado';
    out.conciliadoCom = antigo.conciliadoCom;
  }
  // campos que o cadastro completa aos poucos não voltam para null
  for (const [k, v] of Object.entries(antigo)) {
    if (v != null && (out[k] == null || out[k] === '') && !k.startsWith('__')) out[k] = v;
  }
  out.__acao = novo.__acao;
  return out;
}

function iguais(a, b) {
  const limpar = (o) => JSON.stringify(Object.fromEntries(
    Object.entries(o).filter(([k]) => !k.startsWith('__') && k !== 'importadoEm').sort(),
  ));
  return limpar(a) === limpar(b);
}

/* ------------------------------------------------------------------ gravação */

/** Grava de verdade e registra a importação no histórico (item 16). */
export async function confirmar(preparo, { observacao = null } = {}) {
  const lote = {};
  const momento = Date.now();

  for (const [nome, mapa] of Object.entries(preparo.porStore)) {
    lote[nome] = [...mapa.values()].map((r) => {
      const { __acao, __somar, ...limpo } = r;
      return { ...limpo, importadoEm: momento, importacaoId: preparo.id };
    });
  }

  // cancelamentos vindos de eventos de NF-e: marcam a nota, não criam registro novo
  const canceladas = [];
  for (const evento of preparo.cancelamentos) {
    const id = idNf({ chave: evento.chave });
    const nf = await db.get('nfs', id);
    if (!nf) { preparo.avisos.push(`Cancelamento da chave ${evento.chave.slice(-8)} chegou antes da NF.`); continue; }
    canceladas.push({ ...nf, status: 'cancelada', canceladaEm: evento.dataEvento, justificativaCancelamento: evento.justificativa });
  }
  if (canceladas.length) lote.nfs = [...(lote.nfs || []), ...canceladas];

  await store.salvarLote(lote);

  /**
   * O MÊS DO RELATÓRIO MENSAL É SUBSTITUÍDO DE VERDADE.
   *
   * "Eu reenviei o relatório que você pediu, no período que você pediu, só que
   *  agora aparece isso."
   *
   * Aparecia R$ 1.096.656,33 onde o arquivo dela soma R$ 653.592,84. O app
   * AVISAVA, na hora de importar, que as linhas do arquivo anterior "serão
   * SUBSTITUÍDAS" — e não substituía nada. Cada linha nova sobrescrevia a do
   * mesmo produto, e todo produto que existia no arquivo velho e não existia no
   * novo ficava lá, de outro mês, somando no total daquele.
   *
   * Prometer na tela e não fazer é pior do que não prometer: ela reenviou o
   * arquivo certo, no período certo, e o número continuou errado — e não tinha
   * como saber por quê.
   *
   * Vem DEPOIS de gravar, e é por isso que funciona sem comparar lista nenhuma:
   * o que veio neste arquivo acabou de receber o id DESTA importação. O que
   * ficou no mês com id de outra importação é sobra do arquivo anterior.
   */
  const substituicao = await substituirMesDoRelatorio(preparo, lote);
  if (substituicao) {
    preparo.avisos.push(
      `${substituicao.linhas} linha(s) deste mesmo relatório, vindas de um arquivo anterior e `
      + `somando ${money(substituicao.valor)}, foram REMOVIDAS do mês: o arquivo de agora passa a `
      + 'ser a única verdade do período. Se você manda o relatório do mês em mais de um arquivo, '
      + 'junte-os em um só antes de importar.',
    );
  }

  /**
   * A FOTOGRAFIA: o que sumiu do relatório foi baixado.
   *
   * Vem DEPOIS de gravar, porque precisa saber exatamente o que o arquivo
   * trouxe. Só vale para contas a receber e a pagar, e só quando ela confirma
   * que o export é a lista completa de títulos em aberto — um relatório
   * filtrado não pode dar baixa em nada.
   */
  /**
   * O ORÇAMENTO FILTRADO É O MESMO ERRO POR OUTRO CAMINHO.
   *
   * Ele não some quando é resolvido — ele muda de situação. Um export só de "em
   * aberto" congela todo orçamento que virou venda como aberto para sempre: o
   * orçado incha e a taxa de conversão vira ficção. Se o arquivo inteiro veio
   * com uma situação só, é quase certo que está filtrado, e o app diz.
   */
  if (preparo.fonteId === 'orcamentos') {
    const linhas = lote.orcamentos || [];
    const situacoes = new Set(linhas.map((o) => o.situacao).filter(Boolean));
    if (linhas.length >= 10 && situacoes.size === 1) {
      preparo.avisos.push(
        `Todos os ${linhas.length} orçamentos vieram com a mesma situação ("${[...situacoes][0]}"). `
        + 'Se o export estiver filtrado, o orçamento que virou venda nunca chega aqui e fica aberto '
        + 'para sempre — exporte sem filtrar a situação para a taxa de conversão valer.',
      );
    }
  }

  let fotografia = null;
  if (FONTES_FOTOGRAFIA[preparo.fonteId] && preparo.fotografiaCompleta !== false) {
    const registros = lote[FONTES_FOTOGRAFIA[preparo.fonteId]] || [];
    fotografia = await aplicarFotografia(
      preparo.fonteId,
      registros.map((r) => r.id),
      registros,
      { arquivo: preparo.arquivo },
    );
    if (fotografia.fechados) {
      preparo.avisos.push(
        `${fotografia.fechados} título(s) sumiram deste relatório e foram dados como baixados — `
        + `${money(fotografia.valor)} que saíram do "em aberto". `
        + 'É assim que o app acompanha as baixas que você faz no seu sistema.',
      );
    }
  }

  /**
   * E A BASE INTEIRA PASSA A CONCORDAR COM OS ARQUIVOS.
   *
   * Não só as linhas que vieram agora: é isto que faz o conserto alcançar o que
   * já estava gravado por uma versão antiga, sem ela precisar saber que existe
   * um botão para isso. Vale com ou sem fotografia completa — reler o texto que
   * o arquivo trouxe não dá baixa por silêncio, só põe no lugar o que já estava
   * escrito.
   */
  if (FONTES_FOTOGRAFIA[preparo.fonteId]) {
    preparo.releitura = await relerSituacoesGravadas();
  }
  if (preparo.releitura?.mudados) {
    const partes = [];
    if (preparo.releitura.reabertos) {
      partes.push(`${preparo.releitura.reabertos} voltaram para "em aberto" `
        + `(${money(preparo.releitura.valorReaberto)})`);
    }
    if (preparo.releitura.baixados) {
      partes.push(`${preparo.releitura.baixados} foram dados como recebidos `
        + `(${money(preparo.releitura.valorBaixado)})`);
    }
    preparo.avisos.push(
      `O app releu a situação de todos os títulos guardados: ${partes.join(' e ')}. `
      + 'Isso acerta o que tinha entrado por uma versão antiga do app.',
    );
  }

  const registro = {
    id: preparo.id,
    fonte: preparo.fonteId,
    arquivo: preparo.arquivo,
    formato: preparo.formato,
    hash: preparo.hash,
    data: today(),
    momento,
    periodo: preparo.periodo,
    resumo: { ...preparo.resumo, canceladas: canceladas.length, fotografia },
    erros: preparo.erros.slice(0, 200),
    totalErros: preparo.erros.length,
    avisos: preparo.avisos,
    observacao,
  };
  await store.importacoes.salvar(registro);
  await store.marcarAtualizacao(preparo.fonteId, {
    arquivo: preparo.arquivo,
    ate: preparo.periodo.ate,
    registros: preparo.resumo.principal || preparo.resumo.total,
    erros: preparo.erros.length,
  });
  return registro;
}

/** Este arquivo já foi importado antes? (não bloqueia — apenas avisa) */
export async function importacaoAnterior(hash) {
  const lista = await store.importacoes.listar();
  return lista.find((i) => i.hash === hash) || null;
}
