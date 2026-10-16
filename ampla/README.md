# AMPLA — Gestão administrativa

Central de comando da empresa: pega o que já existe nos sistemas, bancos e BPO,
cruza, e responde **como a empresa está** em um olhar.

**Não é um ERP e não substitui o sistema atual.** Vendas, emissão de NF, cadastro
e financeiro operacional continuam onde estão. Este app lê o que eles produzem.

PWA instalável, funciona offline, **dados 100% locais no aparelho** — nenhum
número financeiro da empresa sai do dispositivo.

---

## Como rodar

Não há build, bundler ou dependências: são módulos ES nativos.

```bash
# na raiz do repositório
python3 -m http.server 8080
# abra http://localhost:8080/ampla/
# publicado em: https://kao100.github.io/Kao/ampla/
```

Qualquer servidor estático serve. Requisitos: HTTPS (ou `localhost`) para o
service worker, e um navegador recente (Safari 16.4+, Chrome 80+) — o app usa
`DecompressionStream` para ler .xlsx sem biblioteca.

### Instalar no iPhone

Abra no **Safari** → **Compartilhar (⬆️) → Adicionar à Tela de Início**.

> Os dados moram no navegador, presos ao endereço onde o app foi aberto.
> Escolha a URL definitiva antes de começar a usar de verdade; para migrar,
> use Ajustes → Exportar backup.

### Sincronização (Google Drive)

**Ajustes → Sincronizar com o Google Drive.** A base inteira vira um arquivo
comprimido que mora na conta Google **dela** — sem serviço intermediário, sem
fatura, e para parar basta apagar o arquivo do próprio Drive.

- **Escopo `drive.file`**, o mais estreito que existe: o app enxerga só o arquivo
  que ele mesmo criou. É também um escopo *não sensível*, então não precisa de
  revisão do Google. A tela de consentimento precisa ser **publicada**: em
  "Testing" o Google expira o acesso a cada 7 dias.
- **O Client ID não entra no repositório.** Ele é público por natureza, mas este
  repositório também é — então ela cola o dela em Ajustes e fica no aparelho.
- **Busca sozinho ao abrir, nunca envia sozinho.** Abrir o app no celular jamais
  pode sobrescrever o que foi feito no computador.
- **Retrato inteiro, não mescla registro a registro.** Com um escritor só ("só eu
  importo, os outros olham"), mesclar não resolveria nada que o retrato não
  resolva, e abriria a porta para o pior erro possível: uma nota sumindo ou
  duplicando sem ninguém saber qual lado está certo.
- **Os dois lados mudaram → o app para e pergunta.** Jogar fora o trabalho de
  alguém sem avisar é o erro que só aparece quando o número não fecha.
- **O carimbo só vem depois de refazer os vínculos.** Senão o aparelho terminaria
  a busca achando que tem novidade para devolver, e dois aparelhos ficariam se
  empurrando para sempre.

O transporte é trocável: `logic/nuvem.js` não sabe o que é Google Drive, só pede
"guarde este arquivo". É o que permite testar toda a decisão de sincronia sem
rede — e trocar de serviço um dia sem mexer na lógica.

### Levar num arquivo, sem sincronização

Não há servidor, então cada aparelho tem a sua base: o celular não enxerga o
que foi importado no computador. A ponte é o backup, em **Ajustes → Levar para
outro aparelho**: exporta no computador, manda o arquivo para você mesma
(WhatsApp, e-mail, Drive), importa no celular.

O backup sai **comprimido em gzip** justamente por isso: a base real de um mês
dá 7,2 MB em JSON puro, que trava anexo de e-mail e de WhatsApp — comprimida dá
**270 KB**. Na importação o app decide pelos dois primeiros bytes se o arquivo é
`.gz` ou JSON puro, porque arquivo que passeia por aplicativo de mensagem troca
de nome no caminho. Conferido ponta a ponta: 550 notas, 2.430 itens, 698
entregas e R$ 1.178.100,90 de faturamento saem iguais do outro lado.

### Conferir se está tudo certo

```bash
node ampla/tools/teste.mjs     # 671 verificações da lógica, sem navegador
```

O teste roda o caminho inteiro (arquivo → importação → vínculos → faturamento →
comissão → caixa → cobrança) e confere os números que o projeto exige.

---

## Por onde começar

1. **Enviar** — a primeira aba. O app conduz a rotina e diz o que falta mandar.
2. **Caixa** — informe o saldo de cada conta. É o único número que o app não tira
   de relatório nenhum.
3. **Hoje** — defina a meta do mês, ali na própria tela. Sem ela, metade do
   impulso comercial fica dormindo.

Depois disso, qualquer aba responde na hora.

---

## As cinco abas

Eram oito abas na barra e mais oito num menu do topo, e o resultado, nas palavras
dela, foi: *"ficou muito complexo, onde eu não conseguia mais entender e fazer
nada. Vamos simplificar esse aplicativo."*

Nada do que ela pediu depois disso era novo — o faturamento diário, a meta, a
pasta do mês, tudo já existia e estava enterrado. Então o conserto não foi
construir: foi tirar. A barra passou a ser o aplicativo inteiro.

| Aba | Responde |
|---|---|
| 📤 Enviar | o checklist do dia, a importação e o histórico |
| 💧 Caixa | quanto teremos em cada dia, de onde o caixa parte (saldo por conta), o que já venceu e em que dia quebra |
| 📈 Hoje | faturamento do dia e do mês, meta, quanto falta, quanto precisa por dia e quem precisa vender mais |
| 🎯 Comissão | cálculo por regra, o percentual efetivo de cada nota, ajuste com motivo e fechamento travado por conferência |
| 📁 Fechamento | o relatório do mês inteiro, pronto para mandar — DRE, faturamento por vendedor, margem, frete cobrado × frete pago, caixa e saldos, orçamentos não fechados, comissão, a receber, a pagar, clientes e divergências |

Cada documento sai sozinho em PDF ou Excel, e a pasta inteira sai de uma vez
(um Excel com uma aba por documento).

### E o que não está na barra

Existe, mas se entra por dentro de onde a pergunta nasce — não por um menu que
ela precise decorar:

| Tela | De onde se chega |
|---|---|
| 📊 Comercial (ranking, evolução, detalhe de cada vendedor) | do Hoje |
| 📝 Orçamentos · 📐 Margem e frete · 📦 Produtos e curva ABC · 👥 Clientes | do Comercial |
| 🤝 RT (indicação) | da Comissão |
| ⚠️ O que o app precisa saber | do aviso que o próprio app levanta |
| ⚙️ Ajustes | do ☰, no topo |

### O que saiu de vez

*"Não preciso mais do inadimplência, de cobrança, nada disso. Eu estou
conseguindo fazer aqui pelo sistema mesmo já existente."*

- **Inadimplência e cobrança** — ela faz no sistema dela. O que venceu continua
  aparecendo no Caixa, à parte da projeção, como informação.
- **Extrato bancário** — trocado pelo saldo digitado: *"sobre o extrato, eu não
  vou colocar, porque acho que vai ficar muito complexo. O que eu vou colocar é o
  saldo, para ele conseguir fazer a estimativa que a gente precisa."* Conciliar
  extrato com título era o trabalho administrativo mais caro do app, e era
  justamente o que ela não quer fazer. O app ainda sabe ler um extrato que já
  entrou; ele só não pede mais.
- **Visão da empresa** — virou o Fechamento.
- **Contas a receber e a pagar como telas de gestão** — *"eu não vou ajustar os
  contas a pagar e receber ali. Ele vai ser a minha visibilidade."* Os títulos
  aparecem no dia deles, dentro do Caixa, abrindo o dia.
- **A projeção antiga de caixa e a simulação de cenários** — havia duas
  projeções concorrentes. Ficou a que parte do saldo informado.

---

## A rotina diária

Seis arquivos, nessa ordem ou em qualquer outra, e um número por conta:

1. **XML das notas fiscais** — a fonte oficial do faturamento
2. **Comissão por venda** — é dela que sai o vendedor de cada nota
3. **Comissão por produto** — alimenta os indicadores de produto
4. **Orçamentos** — a única fonte de orçamento; exportar **sem filtrar a situação**
5. **Contas a receber** — fotografia dos títulos em aberto
6. **Contas a pagar** — idem
7. **Saldo de cada conta**, digitado no Caixa

Depois disso, a única conciliação manual é escolher o vendedor das notas que o
app não conseguiu identificar sozinho.

## Regras que o app aplica

- **O relatório financeiro é uma FOTOGRAFIA, não um lançamento.** O arquivo de
  hoje é a verdade sobre o que está em aberto hoje: título que estava aberto,
  cabia na janela do arquivo e não veio nele, foi baixado. A regra antiga
  empilhava títulos a cada importação e nunca fechava os que sumiam — foi assim
  que a base chegou a mostrar ~R$ 600 mil em aberto que não existiam.
  A janela que pode fechar vai **do começo da fotografia anterior até o último
  vencimento do arquivo novo**: o teto protege um export de horizonte curto, e o
  piso existe porque o caso mais comum é justamente o título mais antigo ser pago
  e sumir. Na importação ela confirma, numa caixa, se aquele export tem todos os
  títulos em aberto; desmarcada, nada é fechado.
- **Orçamento muda de situação, não some.** Diferente do contas a receber, o
  orçamento resolvido não desaparece do sistema: ele vira aprovado ou perdido. É
  a coluna Situação que diz qual foi — então o export não pode ser filtrado por
  "em aberto", ou todo orçamento convertido fica aberto para sempre, inflando o
  orçado e destruindo a taxa de conversão. É o mesmo erro que inchou o contas a
  receber, por outro caminho; quando o arquivo inteiro chega com uma situação só,
  o app avisa.
- **Relatório sem data pertence ao mês que ela escolher.** Produtos vendidos,
  comissão por produto e a planilha de entregas vêm totalizados, sem nenhuma
  coluna de data: o mês só existe se for informado na importação. Antes, o
  caminho de mapeamento manual não levava esse mês adiante, e o estrago era
  diferente em cada um — na margem, três relatórios de três meses gravavam na
  mesma chave e o terceiro apagava os dois primeiros; no frete, o custo ficava
  sem data e o relatório, que filtra por data, não o mostrava em período nenhum.
  Agora o mês nunca fica vazio (na falta de escolha, o app assume o mês atual e
  diz qual assumiu), e reimportar sobre um mês que já tem linhas daquele mesmo
  relatório avisa, antes, que elas serão substituídas — substituídas, nunca
  somadas. Os dois caminhos de importação da tela se conferem no teste, porque o
  erro não estava na lógica: estava na chamada.
- **O vendedor vem do relatório de comissão, direto para a nota.** O relatório é
  indexado pelo número do PEDIDO, e o XML traz esse número dentro dela (`xPed`):
  dois arquivos do mesmo sistema citando o mesmo identificador. Nos arquivos
  reais, 336 das 341 notas com dono fecharam por aí. Quando o pedido não vem,
  vale cliente + valor exato, e só com par único.
- **Uma pendência só: de quem foi esta venda.** Saíram "nota sem pedido",
  "título sem NF", "movimento sem vínculo", "pago sem banco", "item sem NF",
  "divergência de faturamento". O que ficou são as perguntas de vendedor, todas
  de um toque.
- **O extrato bancário saiu da rotina.** A projeção parte de um saldo que ela
  digita uma vez por dia e soma o que os relatórios de títulos dizem. Um número
  informado por quem olha a conta vale mais que um saldo montado de lançamentos
  que ninguém conseguiu conciliar. O saldo é **por conta**, somado, e a data que
  vale é a **mais antiga** delas: uma conta esquecida envelhece a projeção
  inteira, e usar a data mais nova esconderia justamente isso.
- **"Confirmado" quer dizer recebido — e quem provou foi o próprio relatório.**
  O contas a receber de 01/08 a 31/12 traz três números no topo e 1232 linhas
  embaixo. Somando as linhas por situação: 548 "Em aberto" (R$ 1.305.654,69) +
  15 "Atrasado" (R$ 23.461,84) = R$ 1.329.116,53, que é exatamente o "A receber
  — total a receber no período" do cabeçalho; e 669 "Confirmado" =
  R$ 1.275.435,33, exatamente o "Confirmado — valores já confirmados". Os dois
  baldes são disjuntos e somam o total, ao centavo. Então "Confirmado" não é um
  título a receber que foi conferido: é dinheiro que já entrou. O app lia como
  aberto e teria inflado o caixa em R$ 1,27 milhão — o mesmo erro dos R$ 600
  mil, pelo caminho oposto. "Atrasado" continua aberto: atraso não é baixa.
- **Arquivo cheio que vira quase nada tem de gritar.** O relatório começa com um
  painel de totais ("A receber / Confirmado / Total") logo acima da tabela. Se a
  linha de cabeçalho cair nesse painel, o app casa a coluna "Total" com o campo
  Valor, ignora o resto e monta UM registro — de 1232 — sem reclamar de nada. O
  financeiro fica vazio e parece "não tem movimento", a mentira mais cara que
  aquela tela pode contar. Agora um aproveitamento abaixo da metade vira aviso,
  dizendo onde procurar a linha certa.
- **A negação é lida antes da palavra.** "NÃO PAGO" contém "PAGO". "NÃO
  RECEBIDO" contém "RECEBID". A leitura da coluna Situação procurava esses
  pedaços no texto sem olhar a negação na frente, e todo título em aberto do
  relatório dela entrava no app como **baixado, com saldo zero** — o fluxo de
  caixa dava zero com a base cheia de títulos. Não dava erro, não deixava aviso,
  e o número errado era redondo e tranquilo: o pior erro que este app pode ter.
  Agora qualquer palavra que signifique "ainda não aconteceu" (não, sem, a
  receber, a vencer, em aberto, pendente, vencido, em atraso, aguardando,
  previsto, parcial) vence as que significam "aconteceu". Entre errar para
  aberto e errar para pago, erra-se para aberto: um título que aparece no caixa
  e não devia é uma pergunta; um título que desaparece é um buraco silencioso.
- **Uma leitura só para a mesma pergunta.** O contas a pagar tinha uma segunda
  regra, própria, com exatamente o mesmo defeito da negação que havia sido
  consertado no contas a receber. O conserto da base fez os pagamentos dela
  voltarem, e a importação seguinte os teria quebrado de novo, porque aquela
  linha nunca soube da correção. Duas leituras para a mesma pergunta é como um
  conserto arrumar metade do app.
- **Cada lado do caixa se explica sozinho.** A explicação do zero só aparecia
  quando as duas pontas estavam zeradas. Com as saídas funcionando e as entradas
  em zero — o caso mais assustador, porque o caixa fica negativo para sempre — a
  tela não dizia nada. Agora o lado com movimento fica calado e o lado zerado
  fala.
- **Gráfico sem número não finge desenho.** O cartão de evolução do saldo
  passava `{ x, y }` para um componente que lê `{ rotulo, valor }`: todo ponto
  virava NaN, o navegador recusava o SVG e o cartão ficava em branco — numa tela
  de dinheiro, sem uma palavra, exatamente onde se procura o que está faltando.
  Um gráfico vazio parece "não tem nada". Agora o componente descarta ponto sem
  número e, se não sobrar nenhum, assume o silêncio; e o teste confere as séries
  de quem o chama, porque esse erro não aparece em número nenhum.
- **Quem apaga os títulos precisa ver quantos estão baixados.** O aviso do
  "Recomeçar o financeiro" mostrava só o total em aberto — e quem aperta esse
  botão é justamente quem desconfia que os títulos foram baixados errado. Na
  situação em que apagar é o que resolve, o aviso dizia "R$ 0,00", como se não
  houvesse nada para apagar.
- **O app diz POR QUE deu o título como baixado, com o texto que leu.** "Estão
  todos baixados" não serve: ela sabe que não estão. O título guarda a evidência
  da baixa — a coluna Situação, uma data preenchida, saldo zero, ausência no
  relatório seguinte, baixa feita à mão — e a tela mostra o texto do arquivo
  entre aspas. Se o arquivo dizia "Não recebido", o erro é de leitura do app e
  aparece na hora; se dizia "Recebido", o erro está no filtro do export. São
  conversas diferentes, e sem o texto nenhuma das duas começa. Ausência e baixa
  manual não entram na lista de suspeitas: as duas são o app funcionando, e
  misturá-las esconderia o erro no meio do normal.
- **A importação diz o que vai fazer antes do "confirmar".** Ela confirmava, ia
  para o Caixa e só lá descobria que tudo tinha entrado baixado — tarde demais,
  e com um aviso genérico numa outra tela. Agora a tela de conferência mostra
  quantos títulos entram EM ABERTO e quantos entram COMO PAGOS, com a palavra do
  arquivo ao lado de cada grupo. Se "Em aberto" aparecer na coluna dos pagos, o
  erro salta aos olhos no único momento em que ainda dá para não confirmar. Dois
  casos viram aviso forte: nenhum título entrando em aberto (quase sempre
  leitura errada de uma palavra — e o aviso mostra a palavra), e a coluna
  Situação não ligada, que faz o app decidir por data ou saldo, adivinhação com
  cara de leitura.
- **O mapeamento salvo é visível e descartável.** Ele existe para ela não ligar
  coluna toda vez. Mas se um dia foi salvo errado, reaplica-se calado em toda
  importação seguinte, e apagar a base não o alcança: o relatório entra torto de
  novo, igual, para sempre — que é exatamente o que "está dando sempre a mesma
  coisa" produz.
- **A versão fica à vista, e não pode mentir.** "Não apareceu o botão" tem duas
  causas possíveis — o conserto não funcionou, ou o conserto ainda não chegou no
  aparelho — e elas levam a conversas opostas. Sem o número da versão, não há
  como saber qual é, e custou rodadas descobrir. Agora ele aparece em Ajustes e
  no menu ☰, com um botão que força a busca da versão nova (manda o service
  worker reconferir, apaga o que está guardado e recarrega da rede). O teste
  exige que o número e o cache do service worker andem juntos: versão que não
  acompanha o cache é pior que nenhuma, porque mente com cara de verdade.
- **O conserto não pode depender de quando o registro entrou.** Cada correção
  da leitura só alcança o que entra DEPOIS dela, e reimportar só resolve se o
  aparelho já estiver com o código novo — coisa que ela não tem como saber. Daí
  o botão **"Reler as situações do arquivo"**: cada título guardou o texto cru
  da coluna Situação, e relê-lo com a regra de hoje faz o estado guardado voltar
  a concordar com o arquivo, sem apagar nada e sem reimportar, quantas vezes for
  preciso. Nos **dois sentidos**: o que o arquivo diz em aberto volta a abrir, o
  que ele diz recebido é baixado — um conserto que só abre trocaria um erro por
  outro e inflaria o caixa. Baixa manual e baixa por ausência no relatório
  seguem intocadas.
- **Palpite não se apresenta como leitura.** Quando o motivo da baixa não estava
  gravado, o app dizia "a coluna Situação dizia isso" — e escreveu isso sobre
  1232 títulos cujo arquivo diz, em letras, "Em aberto". A frase acusava o
  relatório de algo que o relatório não diz e mandou a investigação para o lado
  errado. Agora a falta de motivo é dita como falta de motivo.
- **Conserto que não aparece é igual a conserto que não funcionou.** A releitura
  escreve direto no banco, e o app guarda os títulos em memória: sem limpar esse
  cache, 65 títulos voltavam a abrir de verdade e a tela seguia mostrando
  R$ 0,00. Quem pagaria essa diferença é quem está olhando a tela.
- **Erro gravado na base se conserta sem reimportação.** Cada título guarda
  `statusArquivo`, o texto cru da coluna Situação — então o conserto relê esse
  texto com a regra certa, uma vez por aparelho, e não toca no que foi baixado
  por ausência no relatório, no que ela baixou à mão, nem no que não tem texto
  de origem para reler. Fazê-la reimportar tudo seria cobrar dela o preço de um
  erro do app, no aplicativo que existe para eliminar trabalho administrativo. O
  conserto é anunciado e fica no histórico: um app que corrige em silêncio é um
  app em que não se pode confiar.
- **Um zero tem de dizer de onde veio.** Projeção zerada pode querer dizer seis
  coisas: não chegou título, chegou tudo baixado, chegou tudo vencido (e aí sai
  da projeção de propósito), vence depois do recorte, veio sem data de
  vencimento, ou veio com valor zero. São seis problemas diferentes, com
  soluções diferentes, e um deles nem é problema — e o app mostrava o mesmo zero
  para todos. Agora o Caixa conta onde os títulos foram parar e diz o próximo
  passo, nomeando a coluna que falta no export. Um aviso que não dá o próximo
  passo devolve a pergunta para quem perguntou.
- **"Em aberto" é a mesma coisa em toda tela.** O Caixa olhava só a coluna de
  situação, enquanto o resto do app também considerava pago o título com data de
  recebimento ou com saldo zerado — então o mesmo título podia ser entrada
  futura numa tela e pago na outra. A regra agora é uma só, e a tela em que a
  divergência não aparece é sempre a que mente.
- **O que está vencido não é projetado.** Entrada vencida não é entrada certa, e
  obrigação vencida é necessidade de caixa hoje, não no vencimento. Os dois ficam
  fora da linha do tempo e à vista, em lista própria.
- **Saldo real e saldo operacional, lado a lado.** O recurso extraordinário
  (empréstimo, aporte) não vira título nenhum: é um ajuste gerencial que mostra
  como estaria o caixa da operação sem ele, e em que dia ela volta a se sustentar
  sozinha.
- **A base de tudo é a NOTA FISCAL.** É a regra da casa, nas palavras dela:
  *"Dentro do meu sistema, o que vale de faturamento é a nota fiscal. O relatório
  de nota fiscal vai ser a base do faturamento mensal e do faturamento total de
  cada vendedor. Comissão, tudo, tudo é a nota fiscal, porque ali a gente sabe
  que o cliente foi uma venda efetiva."* Faturamento é da NF emitida, pela data
  de emissão. Pedido de agosto faturado em setembro conta em setembro.
  Canceladas saem; devoluções entram negativas no mês da emissão.
- **O pedido de venda não é faturamento — é dado complementar.** Ele entra por
  duas coisas que a nota não tem: o **vendedor** e o **valor do custo** daquela
  venda. E a contagem dos dois nunca fecha, de propósito: *"nem toda nota fiscal
  que eu uso para emitir usa o pedido de venda do mês passado (...) então é
  normal aparecer mais pedidos de venda do que notas fiscais"*. O app mede essa
  diferença e a mostra como informação; chamá-la de divergência mandaria caçar um
  erro que não existe. Corolário prático: **mande o relatório de vendas com um
  mês de folga para trás** — a nota de setembro costuma sair de pedido de agosto.
- **O custo tem uma ordem de preferência, e ela é declarada na tela.**
  1. o **"Valor custo" do pedido** que gerou a nota — o CMV do próprio sistema
     dela, na unidade da venda, sem média de período. Rateado por valor quando um
     pedido rendeu mais de uma nota, e só quando o pedido informa o valor total;
  2. o **custo do cadastro de produtos**, quando a razão custo/varejo da mesma
     linha prova que os dois estão na mesma unidade (razão acima de 1,5 reprova);
  3. a **proporção custo/venda do relatório de produtos vendidos**, que é imune a
     unidade porque é uma razão.

  O que decide se a margem aparece como número bom não é a margem que o relatório
  declara — é a **cobertura de custo**: quanto da venda faturada tem custo de
  origem verificada. Abaixo de 98% a tela diz, em vermelho, quantos reais estão
  fora da conta.
- **Arquivo que não tem a coluna não desmarca o que o outro marcou.** O XML diz
  que a nota é devolução, pela natureza da operação; o relatório fiscal sai sem
  essa coluna. Importado depois, ele devolvia `devolucao: false` por cima do
  `true` do XML — e três notas de setembro voltavam a contar como venda. Como
  devolução entra negativa, o faturamento mexia o dobro delas: R$ 7.965,32 a
  mais no mês. **"Não sei" não pode virar "não é":** sem a coluna, o campo não é
  escrito. Com a coluna, ela vale e corrige.
- **O XML não diz que a nota foi cancelada.** O cancelamento é outro documento
  — um evento (`tpEvento` 110111), em arquivo separado. O XML da própria nota
  continua dizendo *"Autorizado o uso da NF-e"* para sempre. O app lê os eventos
  quando eles vêm no ZIP; quando um lote grande chega sem nenhum, ele **avisa**,
  porque nota cancelada que o app não conhece conta como faturamento e gera
  comissão. Quem corrige isso em definitivo é o **relatório de notas fiscais com
  a coluna Situação**.
- **O percentual de comissão de uma nota é a comissão dividida pela base.** A
  conta por item sempre esteve certa — cimento 0,5%, resto 2% —, mas o relatório
  mostrava ao lado da nota o percentual de UMA regra, e numa nota misturada não
  existe "a regra". Agora cada nota traz o percentual que de fato saiu: 0,5% se
  só tem cimento, 2% se não tem nenhum, e o que der no meio quando tem os dois.
  Medido em setembro com essas duas regras: 85 das 341 notas são misturadas, com
  percentuais de 1,25% a 1,38%.
- **O frete não entra na base da comissão, e agora aparece em coluna própria.**
  *"A gente não paga o valor do frete"* — então ele vem ao lado, por nota e por
  vendedor, para ser conferido e abatido, nunca somado.
- **Relatório de RT é de uma pessoa só.** *"Não é legal mandar um relatório para
  o cliente com as comissões de outras pessoas."* Cada pessoa tem o seu PDF e o
  seu Excel, com as notas fiscais do período uma a uma e o RT de cada nota ao
  lado — o controle que o cliente refaz sozinho.
- **O título do financeiro chega à nota por dois caminhos.** Pelo número da NF
  que ele cita, e — quando esse falha ou nem veio — pelo **número do pedido**,
  que os dois lados carregam: o título se chama *"Venda de nº 871"* e o XML traz
  `<xPed>871</xPed>` dentro da nota. Não é semelhança, é o mesmo número escrito
  pelo mesmo sistema nos dois documentos. Vale a regra de sempre: só liga quando
  há uma única nota com aquele pedido.
- **A mesma nota vista por dois arquivos é UMA nota.** O XML identifica a nota
  pela chave de 44 dígitos; o relatório fiscal só tem número e série. Sem
  reconciliar, a NF 4061 entrava duas vezes — e o título que a citava achava
  duas candidatas, então o app se recusava a ligar: a regra certa (*"só liga
  quando não há dúvida"*) aplicada a uma dúvida que ele mesmo criou. Número e
  série identificam a nota sem ambiguidade dentro de um CNPJ, então é esse par
  que manda, e a chave entra como dado a mais.
- **Quem emite a nota não é, por isso, quem vendeu.** O app não adivinha isso —
  ele **pergunta**, uma vez por nome, na conciliação: *"Fulano é vendedor(a)?"*,
  com dois botões. Respondido "não vende", **toda nota no nome dessa pessoa vira
  pendência** com o botão de dizer de quem era a venda. A decisão mora onde ela
  já trabalha, e não numa tela de configuração: *"ir em ajustes, vendedores,
  editar o papel — isso é diferente para mim"*. O app nunca move a nota sozinho:
  trocar o dono de um faturamento e de uma comissão é decisão dela.
- **Quem entrega é cadastro, não dedução.** Cada nome da planilha de entregas é
  classificado uma vez como **carro nosso** ou **freteiro**, e vale para sempre.
  O app não infere isso do valor: R$ 0,00 numa entrega quer dizer que não houve
  custo de terceiro *naquela entrega*, não que o motorista seja da casa. O que
  ainda não foi classificado aparece à parte, em reais, em vez de cair no lado
  errado.
- **Em branco não é zero, mas virar zero é um toque.** Entrega com o custo em
  branco na planilha vira pendência com dois botões: *"não teve custo"* e
  *"informar valor"*. O valor que ela põe aqui fica marcado como decidido por
  ela, e reimportar a planilha não o apaga.
- **RT é a comissão de quem traz a obra, e não é comissão de vendedor.** Quem
  recebe RT é cliente, nunca aparece na nota, e é reconhecido pelos **CNPJs**
  que trouxe — porque *"um cliente pode ter vários faturamentos diferentes,
  vários CNPJ"*. Três diferenças impedem de misturar com vendedor: o RT não
  aparece na venda, incide sobre o **total com frete** (e não só sobre o
  produto), e pô-lo no ranking faria a soma dos vendedores passar do
  faturamento. O mesmo CNPJ em dois cadastros é acusado como conflito, porque
  pagaria a mesma venda duas vezes.
- **O frete tem duas metades, e a planilha de entregas dá a segunda.** A nota
  diz quanto foi *cobrado*; a planilha de solicitação de entrega diz quanto cada
  entrega *custou* e de quem era a venda. Com as duas, "o Guilherme cobrou
  R$ 8 mil de frete" vira resultado de verdade. O app lê dessa planilha só o que
  importa — **valor, vendedor e quem entregou** — e **não** tenta amarrar a
  entrega à nota ou ao pedido que ela cita: *"às vezes a nota fiscal é entregue
  com um pedido; não se apegue a isso, se apegue ao custo"*. Como a planilha não
  tem data, o mês é o que se escolhe na importação — por isso ela vai exportada
  um mês por vez. Entrega com R$ 0,00 conta como entrega sem custo de terceiro;
  valor em branco não conta, e o app diz quantas foram.
- **Custo maior que a venda no mês inteiro não é prejuízo: é unidade trocada.**
  `TIJOLO COMUM 9X19X5 (PACOTE C/10)` saía do relatório com quantidade em peça e
  custo médio do pacote: 3.959 × R$ 87,38 = R$ 345.933,00 de custo sobre
  R$ 29.767,75 de venda. Catorze linhas assim derrubavam a margem declarada do
  relatório inteiro de 42,3% para 22,5%. Essas linhas saem da referência e
  aparecem com nome e valor, para serem corrigidas na origem.
- **PDF serve.** Um dos sistemas não exporta planilha: o app abre o PDF, remonta
  a tabela pela posição do texto na página e segue o mesmo caminho de um XLSX.
  PDF escaneado não — sem OCR e sem chute, o app avisa em vez de inventar.
- **O relatório que você manda atualiza o que já está aqui**, não vira um
  relatório novo. Boleto prorrogado continua o mesmo boleto com a data nova, e o
  que o seu sistema já baixou entra como pago.
- **O vendedor que faltar se resolve na hora de importar.** O sistema de origem
  não deixa acrescentar vendedor a um pedido já feito, então o app pergunta logo
  depois de gravar, com o relatório ainda na mão — e dá para criar um vendedor
  novo ali mesmo.
- **Não se marca nada no app.** Dar baixa aqui e no sistema seria o mesmo
  trabalho duas vezes. A baixa acontece no sistema; a próxima importação traz o
  resultado. A única exceção é o pedido que vier sem vendedor no relatório.
- **Meta do mês vira meta por dia** pelos dias em que a empresa vende (padrão
  segunda a sábado). Dividir por 30 quando não se abre domingo dá um alvo menor
  do que o real. Sem meta definida, o app pede em vez de inventar.
- **Nada é obrigatório.** Nenhuma coluna de nenhum relatório. Você exporta como o
  sistema deixa; o app importa o que veio e **avisa** o que faltou, em vez de
  bloquear. Data ilegível vira aviso, não erro — a linha entra assim mesmo.
- **Vendedor nunca é adivinhado, mas agora quase sempre é encontrado.** O
  relatório fiscal não traz o pedido, e o vendedor vem do relatório de comissão.
  Duas pontes levam da nota ao pedido, nesta ordem:
  1. **contas a receber** — traz a nota e o número do pedido na mesma linha. É a
     prova mais forte, e é sempre a primeira tentada. O limite dela não é a
     venda, é o **export**: o relatório costuma sair só com os títulos **em
     aberto**, e é o título da venda **já recebida** que ligaria a nota do mês ao
     pedido. Num arquivo real, 398 títulos e nenhum recebido — de 336 notas,
     apenas 74 tinham por onde atravessar. Mandar uma vez o contas a receber sem
     o filtro de situação fecha essa ponte para o mês inteiro, e o app avisa na
     importação quando percebe o filtro.
  2. **mesmo cliente + mesmo valor até o centavo + pedido antes da nota**, e só
     quando o par é **único**. Não é semelhança: é comparação exata de dois
     campos. Dois pedidos iguais do mesmo cliente? O app não escolhe — se os dois
     forem do mesmo vendedor o vendedor é certo de qualquer jeito; se não,
     vira pendência. A prova de que a ponte está certa está nas datas: dos 292
     pares únicos, 237 são do mesmo dia, e nenhum pedido é posterior à nota.

  Com as duas, o mesmo mês foi de R$ 82 mil atribuídos para R$ 555 mil, e das 268
  pendências sobraram 40. O que sobra é cobrado com o motivo escrito, e a origem
  do vendedor aparece em cada nota — você sempre sabe se veio de um relatório, de
  qual ponte, ou de uma decisão sua.
- **Comissão de fábrica:** 2% padrão e 0,5% no cimento (pela palavra na
  descrição, já que categoria pode não vir no arquivo). Tudo editável.
- **Devolução abate a comissão de quem vendeu**, no mês em que ela acontece —
  mesmo que a venda tenha sido em outro mês e a comissão já tenha sido paga. Quem
  diz o que é devolução é a coluna NATUREZA DA OPERAÇÃO do relatório fiscal: sem
  ela, a devolução entra como faturamento e ainda gera comissão. "Devolução de
  venda" e "devolução de compra" não são a mesma coisa, e o app separa as duas.
- **Busca avançada em toda tela de consulta:** a data é DIGITADA (de e até), mais
  vendedor, cliente ou fornecedor, situação e busca livre por nome, número ou
  documento. O recorte corta a base antes dos números do topo, então KPI, chips e
  tabela falam todos do mesmo recorte. Tudo mora na URL — dá para mandar o link.
- **XML da NF-e entra pelo mesmo lugar do relatório fiscal** (um arquivo ou um
  .zip com o mês). É a melhor fonte que o app tem: traz o frete cobrado, a
  natureza da operação (devolução) e os itens de cada nota — frete por vendedor,
  devolução e curva ABC deixam de depender de qualquer relatório.
- **Dois cadastros para a mesma pessoa** ("EDUARDO" e "CARLOS EDUARDO APARECIDO
  DO NASCIMENTO") o app detecta e PERGUNTA — nunca junta por semelhança. Quando
  há vários pares, um botão junta todos de uma vez, mantendo o nome curto, que é
  o que já carrega o faturamento.
- **Carteira de clientes:** quanto cada um comprou, quanto orçou, quem PAROU de
  comprar, quem orça e não fecha, e com qual vendedor comprou — inclusive quando
  comprou de mais de um, que é a carteira dividida aparecendo.
- **Conferência que nunca some:** faturamento fiscal = soma dos vendedores. A
  diferença aparece; o fechamento de comissão fica travado enquanto existir.
- **Conversão de orçamento é a do seu sistema:** vem da coluna SITUAÇÃO do
  relatório. O app não casa orçamento com pedido por cliente e valor parecido —
  sem o número do pedido no export, isso seria adivinhar. Orçamento em aberto
  fica fora da taxa: ainda pode virar venda.
- **DRE sem estimativa:** o CMV vem do "valor do custo" do pedido que gerou cada
  nota. Nota sem custo conhecido não recebe um custo médio — ela fica de fora, a
  cobertura aparece na tela e o lucro bruto só sai quando o custo cobre 100% do
  faturamento.
- **Nada é contado duas vezes:** as contas do plano que você marcar como compra
  de mercadoria saem das despesas (o custo já entrou pelo CMV) e aparecem à
  parte. O app sugere quais parecem ser, mas quem marca é você.
- **Caixa:** vencido sem promessa não entra na projeção (não há data confiável);
  pagamento vencido entra no primeiro dia (a obrigação continua).
- **Simulação não toca no real** até você mandar aplicar — e aí fica registrado.
- **Conciliação automática só sem ambiguidade:** um único candidato com mesmo
  valor e mesma data. Qualquer dúvida vira pendência.
- **Reimportar não duplica:** cada registro tem chave natural e é atualizado.
- **Linha ilegível não entra pela metade:** vira erro com número da linha e motivo.
- **Todo ajuste manual exige motivo** e guarda valor antes, depois, quem e quando.

---

## Arquitetura

```
index.html            shell do app + metatags PWA/iOS
manifest.webmanifest  manifest do PWA
sw.js                 service worker (app shell offline)
assets/               marca.svg (divisa vetorizada) e logotipo original
icons/                ícones gerados por tools/make-icons.py
docs/                 fontes de dados, modelo de dados e decisões
src/
  main.js             bootstrap: banco, rotas, service worker
  core/               infraestrutura, sem regra de negócio
    dom.js            h() — criação de elementos (sem framework)
    router.js         rotas por hash
    db.js             IndexedDB puro (stores, índices, persistência)
    store.js          repositórios de domínio + cache
    format.js         datas, dinheiro e leitura de número/data de arquivo
    util.js           ids, hash, normalização, download
    files/            zip · xlsx (ler) · xlsxw (escrever) · csv · nfe · ofx · read
  data/
    sources.js        catálogo de fontes e campos canônicos (o mapa de importação)
    seed.js           primeira execução (contas e regras de comissão)
  logic/              regras de negócio, sem DOM
    ingest.js         arquivo → registro canônico, validação e deduplicação
    link.js           NF ↔ pedido ↔ vendedor, conciliação e pendências
    revenue.js        faturamento e conferência fiscal
    commission.js     regras, ajustes e fechamento
    collection.js     cobrança: status, fila do dia e baixas
    suggest.js        candidatos de pedido para cada NF sem vendedor
    cashflow.js       projeção acumulada e simulação
    abc.js            curva ABC e ficha do produto
    routine.js        rotina diária e selo de integridade
    reports.js        PDF (impressão) e Excel (.xlsx de verdade)
  ui/
    shell.js          layout, topo, navegação e selo de dados
    components/       marca, kpi, sheet, toast, gráficos SVG, tabela
    views/            uma tela por arquivo
  styles/             tokens, base, componentes, telas, impressão
tools/
  make-icons.py       gera os PNGs dos ícones (sem dependências)
  teste.mjs           teste de ponta a ponta da lógica
  fake-idb.mjs        IndexedDB de mentira, só para o teste
```

Regra de dependência: `views → components/logic → core`. `core` não conhece
nenhuma tela; `logic` não toca no DOM. Trocar a persistência (por exemplo, para
sincronizar com um servidor) mexe só em `core/db.js` + `core/store.js`.

---

## Identidade

A divisa do logotipo foi vetorizada a partir do arquivo original
(`assets/logotipo-original.png`) e vive em `assets/marca.svg` — mesmos vértices,
sem arredondamento, para continuar nítida em 24px. O azul da marca, amostrado do
arquivo, é **#0044B9**.

O fundo é **claro** — não branco: um cinza-azulado (`#EEF2F8`) com os cartões em
branco e os detalhes no azul da marca. Fundo escuro foi descartado a pedido da
empresa, porque dava cara de aplicativo de investimento. Os ícones do PWA e o
cabeçalho dos relatórios saem da mesma forma: `python3 tools/make-icons.py`
regenera tudo.

---

## Sem dependências

Nada é instalado. O que normalmente pediria biblioteca foi resolvido com o que o
navegador já tem:

| Precisava | Como foi feito |
|---|---|
| Ler .xlsx | `DecompressionStream` + leitura do XML da planilha |
| Escrever .xlsx | ZIP sem compressão (método "stored") + CRC32 próprio |
| Ler XML de NF-e | `DOMParser` |
| Ler OFX | leitor tolerante (o formato costuma ser SGML) |
| **Ler PDF** | `DecompressionStream` nos streams + interpretação dos operadores de texto; a tabela sai da posição de cada pedaço na página |
| Gerar PDF | folha de impressão + `window.print()` |
| Gráficos | SVG escrito à mão |

---

## Documentação

- [`docs/FONTES-DE-DADOS.md`](docs/FONTES-DE-DADOS.md) — o que pedir a cada
  sistema, campo por campo, com o checklist de perguntas.
- [`docs/MODELO-DE-DADOS.md`](docs/MODELO-DE-DADOS.md) — stores, chaves naturais
  e como as pontas se ligam.
- [`docs/DECISOES.md`](docs/DECISOES.md) — o que foi decidido, o que depende de
  resposta sua e o que ficou fora desta versão.
