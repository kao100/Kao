/**
 * A VERSÃO DO APP, À VISTA.
 *
 * "Na parte do caixa não aparecia essa parte que você falava, de reler as
 *  situações do arquivo."
 *
 * Não aparecia porque ainda não tinha sido publicada — ela testou nos minutos
 * entre o conserto e o deploy. E não havia como ela saber disso: o app não dizia
 * em lugar nenhum qual versão estava rodando.
 *
 * Sem esse número, "não apareceu" tem duas causas possíveis — o conserto não
 * funcionou, ou o conserto ainda não chegou — e as duas levam a conversas
 * completamente diferentes. Custou várias rodadas não saber qual era.
 *
 * Fica junto do CACHE do service worker, e o teste cobra que os dois andem
 * juntos: versão que não acompanha o cache é pior que nenhuma, porque mente.
 */
export const VERSAO = 'v55';
