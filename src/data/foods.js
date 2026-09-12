/**
 * Tabela de alimentos.
 *
 * Valores por 100 g (ou 100 ml, quando líquido), arredondados. São valores de
 * referência de tabelas de composição de alimentos, não a marca exata que você
 * comprou: servem para acompanhar tendência de proteína e calorias, não para
 * cálculo clínico. Rótulo do produto sempre ganha da tabela — e dá para
 * cadastrar o alimento com os números do rótulo em "Novo alimento".
 *
 * `portions` são as medidas caseiras: o app soma pela medida, para você não
 * precisar de balança. A primeira é a padrão.
 */

const f = (id, name, group, kcal, protein, carbs, fat, portions, opts = {}) => ({
  id: `fd-${id}`,
  name,
  group,
  per: opts.liquid ? '100 ml' : '100 g',
  kcal,
  protein,
  carbs,
  fat,
  portions,
  aliases: opts.aliases || [],
  builtin: true,
});

/** [rótulo, gramas] — medida caseira e o peso que ela representa. */
export const FOOD_GROUPS = [
  ['proteina', '🥩 Proteínas'],
  ['carbo', '🍚 Carboidratos'],
  ['leguminosa', '🫘 Feijões e leguminosas'],
  ['laticinio', '🥛 Leite e derivados'],
  ['fruta', '🍌 Frutas'],
  ['vegetal', '🥦 Verduras e legumes'],
  ['gordura', '🥑 Gorduras e castanhas'],
  ['bebida', '🥤 Bebidas'],
  ['suplemento', '💊 Suplementos'],
  ['pronto', '🍽️ Pratos e lanches prontos'],
];

export const BUILTIN_FOODS = [
  /* ---------------- proteínas ---------------- */
  f('frango-peito', 'Frango, peito grelhado', 'proteina', 165, 31, 0, 3.6,
    [['1 filé médio', 120], ['1 filé grande', 180], ['100 g', 100]], { aliases: ['peito de frango'] }),
  f('frango-coxa', 'Frango, coxa/sobrecoxa assada', 'proteina', 215, 26, 0, 12,
    [['1 coxa', 90], ['1 sobrecoxa', 110], ['100 g', 100]]),
  f('patinho', 'Carne bovina magra (patinho, coxão mole)', 'proteina', 190, 32, 0, 6,
    [['1 bife médio', 120], ['1 porção', 150], ['100 g', 100]], { aliases: ['bife', 'carne vermelha'] }),
  f('acem', 'Carne bovina (acém, músculo, cozida)', 'proteina', 240, 27, 0, 14,
    [['1 concha de cozido', 120], ['100 g', 100]]),
  f('carne-moida', 'Carne moída refogada', 'proteina', 212, 26, 0, 12,
    [['1 colher de servir', 60], ['1 porção', 120], ['100 g', 100]]),
  f('tilapia', 'Tilápia / peixe branco grelhado', 'proteina', 128, 26, 0, 2.7,
    [['1 filé', 130], ['100 g', 100]], { aliases: ['peixe'] }),
  f('sardinha', 'Sardinha em lata (em óleo, escorrida)', 'proteina', 208, 25, 0, 11,
    [['1 lata', 84], ['100 g', 100]]),
  f('atum-lata', 'Atum em lata (em água, escorrido)', 'proteina', 116, 26, 0, 1,
    [['1 lata', 120], ['100 g', 100]]),
  f('ovo', 'Ovo de galinha inteiro', 'proteina', 143, 13, 1, 9.5,
    [['1 ovo', 50], ['2 ovos', 100], ['3 ovos', 150]], { aliases: ['ovos'] }),
  f('clara', 'Clara de ovo', 'proteina', 52, 11, 0.7, 0.2,
    [['1 clara', 33], ['3 claras', 100]]),
  f('porco-lombo', 'Lombo de porco assado', 'proteina', 210, 29, 0, 10,
    [['1 fatia', 80], ['100 g', 100]]),
  f('linguica', 'Linguiça / salsicha', 'proteina', 296, 15, 2, 25,
    [['1 gomo', 60], ['1 salsicha', 50], ['100 g', 100]]),
  f('presunto', 'Presunto magro', 'proteina', 120, 18, 2, 4,
    [['1 fatia', 15], ['3 fatias', 45], ['100 g', 100]]),

  /* ---------------- carboidratos ---------------- */
  f('arroz-branco', 'Arroz branco cozido', 'carbo', 128, 2.5, 28, 0.2,
    [['1 escumadeira', 100], ['1 colher de servir', 45], ['2 escumadeiras', 200]], { aliases: ['arroz'] }),
  f('arroz-integral', 'Arroz integral cozido', 'carbo', 124, 2.6, 26, 1,
    [['1 escumadeira', 100], ['1 colher de servir', 45]]),
  f('macarrao', 'Macarrão cozido', 'carbo', 158, 5.8, 30, 0.9,
    [['1 pegador', 110], ['1 prato raso', 220]], { aliases: ['massa', 'espaguete'] }),
  f('pao-frances', 'Pão francês', 'carbo', 300, 8, 58, 3.1,
    [['1 unidade', 50], ['1 metade', 25]], { aliases: ['pãozinho', 'pão'] }),
  f('pao-forma', 'Pão de forma integral', 'carbo', 253, 9.4, 44, 3.7,
    [['1 fatia', 25], ['2 fatias', 50]]),
  f('tapioca', 'Tapioca (goma hidratada)', 'carbo', 240, 0.3, 60, 0.1,
    [['1 disco médio', 60], ['1 disco grande', 90]]),
  f('cuscuz', 'Cuscuz de milho cozido', 'carbo', 113, 2.4, 25, 0.6,
    [['1 fatia', 100], ['1 prato', 180]]),
  f('batata', 'Batata inglesa cozida', 'carbo', 86, 1.8, 19, 0.1,
    [['1 unidade média', 130], ['1 escumadeira', 100]]),
  f('batata-doce', 'Batata-doce cozida', 'carbo', 90, 1.6, 21, 0.1,
    [['1 pedaço médio', 120], ['100 g', 100]]),
  f('mandioca', 'Mandioca/aipim cozida', 'carbo', 125, 0.6, 30, 0.3,
    [['1 pedaço', 100], ['1 porção', 150]], { aliases: ['macaxeira', 'aipim'] }),
  f('aveia', 'Aveia em flocos', 'carbo', 394, 14, 66, 8,
    [['1 colher de sopa', 15], ['2 colheres', 30], ['1 xícara', 80]]),
  f('granola', 'Granola', 'carbo', 428, 9, 66, 13,
    [['1 colher de sopa', 15], ['1 porção', 40]]),
  f('farofa', 'Farofa pronta', 'carbo', 405, 3, 65, 15,
    [['1 colher de sopa', 20], ['1 porção', 40]]),

  /* ---------------- leguminosas ---------------- */
  f('feijao', 'Feijão cozido (carioca ou preto)', 'leguminosa', 76, 4.8, 14, 0.5,
    [['1 concha média', 140], ['1 concha cheia', 180], ['1 colher de servir', 60]], { aliases: ['feijoada caseira'] }),
  f('lentilha', 'Lentilha cozida', 'leguminosa', 93, 6.3, 16, 0.5,
    [['1 concha', 140], ['100 g', 100]]),
  f('grao-de-bico', 'Grão-de-bico cozido', 'leguminosa', 164, 8.9, 27, 2.6,
    [['1 concha', 120], ['100 g', 100]]),
  f('soja-texturizada', 'Proteína de soja texturizada (hidratada)', 'leguminosa', 105, 15, 7, 1,
    [['1 porção', 100], ['1 concha', 130]], { aliases: ['carne de soja'] }),

  /* ---------------- laticínios ---------------- */
  f('leite-integral', 'Leite integral', 'laticinio', 61, 3.2, 4.7, 3.3,
    [['1 copo (200 ml)', 200], ['1 xícara (240 ml)', 240], ['1 copo pequeno', 150]], { liquid: true, aliases: ['leite'] }),
  f('leite-desnatado', 'Leite desnatado', 'laticinio', 35, 3.4, 5, 0.2,
    [['1 copo (200 ml)', 200], ['1 xícara (240 ml)', 240]], { liquid: true }),
  f('iogurte-natural', 'Iogurte natural integral', 'laticinio', 61, 3.5, 4.7, 3.3,
    [['1 pote (170 g)', 170], ['1 copo', 200]]),
  f('iogurte-grego', 'Iogurte grego / proteico', 'laticinio', 97, 9, 4, 5,
    [['1 pote (130 g)', 130], ['1 pote (100 g)', 100]], { aliases: ['iogurte proteico'] }),
  f('queijo-minas', 'Queijo minas frescal', 'laticinio', 264, 17, 3, 20,
    [['1 fatia', 30], ['1 pedaço', 60]]),
  f('queijo-mussarela', 'Queijo mussarela', 'laticinio', 330, 22, 3, 25,
    [['1 fatia', 20], ['2 fatias', 40]]),
  f('requeijao', 'Requeijão cremoso', 'laticinio', 257, 9, 3, 23,
    [['1 colher de sopa', 20], ['2 colheres', 40]]),
  f('cottage', 'Queijo cottage', 'laticinio', 98, 11, 3.4, 4.3,
    [['1 colher de sopa', 30], ['1 pote', 200]]),

  /* ---------------- frutas ---------------- */
  f('banana', 'Banana', 'fruta', 92, 1.3, 24, 0.1,
    [['1 unidade média', 100], ['1 unidade grande', 140], ['1 banana-prata', 70]]),
  f('maca', 'Maçã', 'fruta', 56, 0.3, 15, 0.2,
    [['1 unidade média', 130], ['1 unidade grande', 180]]),
  f('mamao', 'Mamão', 'fruta', 40, 0.5, 10, 0.1,
    [['1 fatia', 150], ['1/2 mamão papaia', 150]]),
  f('laranja', 'Laranja', 'fruta', 45, 1, 11, 0.1,
    [['1 unidade média', 150]]),
  f('melancia', 'Melancia', 'fruta', 33, 0.9, 8, 0,
    [['1 fatia', 200]]),
  f('abacate', 'Abacate', 'fruta', 96, 1.2, 6, 8.4,
    [['1/2 unidade', 100], ['1 colher de sopa', 30]]),
  f('morango', 'Morango', 'fruta', 30, 0.9, 6.8, 0.3,
    [['1 xícara', 150], ['5 unidades', 60]]),

  /* ---------------- verduras e legumes ---------------- */
  f('alface', 'Alface / folhas verdes', 'vegetal', 15, 1.3, 2.4, 0.2,
    [['1 prato de sobremesa', 60], ['1 folha', 10]], { aliases: ['salada'] }),
  f('tomate', 'Tomate', 'vegetal', 15, 1.1, 3.1, 0.2,
    [['1 unidade média', 110], ['3 rodelas', 45]]),
  f('brocolis', 'Brócolis cozido', 'vegetal', 25, 2.1, 4.4, 0.5,
    [['1 pires', 80], ['1 colher de servir', 60]]),
  f('cenoura', 'Cenoura', 'vegetal', 34, 1.3, 7.7, 0.2,
    [['1 unidade média', 90], ['1 colher de servir', 50]]),
  f('abobrinha', 'Abobrinha refogada', 'vegetal', 26, 1.1, 4.3, 0.7,
    [['1 colher de servir', 70]]),
  f('couve', 'Couve refogada', 'vegetal', 90, 3, 7, 6,
    [['1 colher de servir', 50]]),

  /* ---------------- gorduras e castanhas ---------------- */
  f('azeite', 'Azeite de oliva', 'gordura', 884, 0, 0, 100,
    [['1 fio', 5], ['1 colher de sopa', 13]], { liquid: true }),
  f('oleo', 'Óleo de soja/girassol', 'gordura', 884, 0, 0, 100,
    [['1 colher de sopa', 13]], { liquid: true }),
  f('manteiga', 'Manteiga', 'gordura', 717, 0.9, 0.1, 81,
    [['1 ponta de faca', 5], ['1 colher de chá', 8]]),
  f('pasta-amendoim', 'Pasta de amendoim', 'gordura', 588, 25, 20, 50,
    [['1 colher de sopa', 20], ['2 colheres', 40]]),
  f('castanha', 'Castanhas e nozes (mix)', 'gordura', 620, 15, 18, 55,
    [['1 punhado', 30], ['5 unidades', 15]]),

  /* ---------------- bebidas ---------------- */
  f('agua', 'Água', 'bebida', 0, 0, 0, 0,
    [['1 copo (250 ml)', 250], ['1 garrafa (500 ml)', 500], ['1 garrafa (1 L)', 1000]], { liquid: true }),
  f('cafe', 'Café sem açúcar', 'bebida', 2, 0.2, 0.3, 0,
    [['1 xícara (50 ml)', 50], ['1 caneca (200 ml)', 200]], { liquid: true }),
  f('suco-laranja', 'Suco de laranja natural', 'bebida', 45, 0.7, 10, 0.2,
    [['1 copo (250 ml)', 250]], { liquid: true }),
  f('refrigerante', 'Refrigerante comum', 'bebida', 42, 0, 11, 0,
    [['1 lata (350 ml)', 350], ['1 copo (250 ml)', 250]], { liquid: true }),
  f('cerveja', 'Cerveja', 'bebida', 43, 0.5, 3.6, 0,
    [['1 lata (350 ml)', 350], ['1 long neck', 355]], { liquid: true }),

  /* ---------------- suplementos ---------------- */
  f('whey', 'Whey protein (concentrado)', 'suplemento', 390, 78, 8, 5,
    [['1 scoop (30 g)', 30], ['2 scoops', 60], ['1 scoop (25 g)', 25]], { aliases: ['proteína em pó'] }),
  f('albumina', 'Albumina em pó', 'suplemento', 375, 80, 6, 1,
    [['1 colher de sopa', 15], ['1 dose (30 g)', 30]]),
  f('creatina', 'Creatina monoidratada', 'suplemento', 0, 0, 0, 0,
    [['1 dose (5 g)', 5]]),
  f('hipercalorico', 'Hipercalórico (massa)', 'suplemento', 380, 15, 72, 3,
    [['1 dose (100 g)', 100], ['1/2 dose', 50]]),

  /* ---------------- pratos e lanches prontos ---------------- */
  f('marmita-frango', 'Marmita: arroz, feijão, frango e salada', 'pronto', 130, 9, 17, 3,
    [['1 marmita média', 450], ['1 marmita grande', 600]],
    { aliases: ['pf', 'prato feito', 'almoço'] }),
  f('sanduiche-frango', 'Sanduíche de frango simples', 'pronto', 210, 14, 24, 6,
    [['1 unidade', 200]]),
  f('pizza', 'Pizza (média, mussarela)', 'pronto', 266, 11, 33, 10,
    [['1 fatia', 100], ['2 fatias', 200]]),
  f('xsalada', 'X-salada / hambúrguer', 'pronto', 265, 13, 24, 13,
    [['1 unidade', 220]]),
  f('coxinha', 'Salgado frito (coxinha, risole)', 'pronto', 290, 8, 32, 14,
    [['1 unidade', 90]]),
  f('acai', 'Açaí com granola e banana', 'pronto', 150, 2, 25, 5,
    [['1 copo (300 ml)', 300], ['1 copo (500 ml)', 500]]),
  f('ovo-mexido', 'Ovos mexidos (2 ovos, com óleo)', 'pronto', 190, 13, 1, 15,
    [['1 porção', 110]]),
  f('strogonoff', 'Strogonoff de frango', 'pronto', 165, 12, 6, 10,
    [['1 concha', 150], ['1 porção', 250]]),
  f('lasanha', 'Lasanha', 'pronto', 165, 9, 15, 8,
    [['1 pedaço', 250]]),
  f('salgado-assado', 'Pão de queijo', 'pronto', 300, 6, 33, 16,
    [['1 unidade pequena', 25], ['1 unidade grande', 60]]),
];

export const FOODS_VERSION = 1;

/** Calcula os macros de uma quantidade em gramas de um alimento. */
export function macrosFor(food, grams) {
  const k = grams / 100;
  return {
    kcal: Math.round((food.kcal || 0) * k),
    protein: Math.round((food.protein || 0) * k * 10) / 10,
    carbs: Math.round((food.carbs || 0) * k * 10) / 10,
    fat: Math.round((food.fat || 0) * k * 10) / 10,
  };
}
