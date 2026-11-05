/**
 * Fotos das máquinas da academia, já associadas aos exercícios.
 *
 * Entram na store `equipment` (a mesma de "Minha academia") na primeira
 * atualização depois que foram adicionadas. A partir daí são registros comuns:
 * dá para editar a associação, trocar a foto, marcar outra como principal ou
 * apagar — e nada volta sozinho depois disso.
 *
 * `confirm: true` marca as que foram identificadas pela foto sem etiqueta
 * visível: vale conferir se o exercício associado é mesmo o certo.
 */

const eq = (id, exerciseId, file, model, opts = {}) => ({
  id: `eq-${id}`,
  exerciseId,
  photo: `./assets/gym/${file}.jpg`,
  brand: opts.brand || '',
  model,
  note: opts.note || '',
  useAsPrimary: opts.primary !== false,
  builtin: true,
  confirm: Boolean(opts.confirm),
});

export const BUILTIN_GYM_EQUIPMENT = [
  /* ---------- pernas ---------- */
  eq('leg-press-45', 'leg-press', 'leg-press-45', 'Leg press 45°',
    { note: 'O leg press vermelho, na área de inferiores.' }),
  eq('agachamento-sentado', 'leg-press', 'agachamento-sentado', 'Agachamento/hack sentado',
    { primary: false, confirm: true, note: 'Máquina de agachamento com apoio nos ombros e plataforma.' }),
  eq('maquina-extender', 'leg-press', 'maquina-extender', 'Máquina de placas "exTender" (vista de trás)',
    { primary: false, confirm: true, note: 'Foto tirada por trás, do lado da piscina: dá para ver a estrutura e as placas, mas não o assento. Vale conferir a etiqueta na frente antes de usar. Um pé de outra pessoa no canto foi desfocado.' }),

  eq('leg-extension', 'leg-extension', 'leg-extension', 'Cadeira extensora',
    { note: 'Etiqueta "Leg Extension" na própria máquina.' }),
  eq('extensora-placas', 'leg-extension', 'extensora-placas', 'Extensora de placas (braços independentes)',
    { primary: false, confirm: true }),
  eq('extensora-21', 'leg-extension', 'extensora-flexora-21', 'Máquina nº 21',
    { primary: false, confirm: true, note: 'Pode ser extensora ou flexora sentada — confira.' }),
  eq('area-quadra', 'leg-extension', 'area-quadra', 'A fileira de máquinas ao lado da quadra',
    { primary: false, confirm: true, note: 'Foto de área, não de uma máquina só: serve para achar o lugar. A fileira Matrix (extensora, flexora) fica à esquerda, e a máquina vermelha Righetto no meio. Uma pessoa ao fundo, do outro lado do vidro, foi desfocada.' }),

  eq('flexora-sentada', 'leg-curl', 'flexora-sentada', 'Cadeira flexora',
    { confirm: true }),

  eq('abdutora', 'hip-abduction', 'abdutora', 'Cadeira abdutora',
    { brand: 'Matrix', note: 'Etiqueta "Hip Abductor". A adutora fica ao lado.' }),
  eq('abdutora-par', 'hip-abduction', 'abdutora-par', 'O par: abdutora e adutora lado a lado',
    { brand: 'Matrix', primary: false, note: 'As duas juntas, e é por isso que confundem: uma tem etiqueta "Hip Abductor" (abrir as pernas contra o peso) e a outra "Hip Adductor" (fechar). Seu treino usa a de ABRIR. Pessoas ao fundo foram desfocadas.' }),
  eq('quadril-selim', 'hip-abduction', 'quadril-selim', 'Máquina de selim com plataformas (área da rua)',
    { primary: false, confirm: true, note: 'Selim para sentar e duas plataformas para os pés, que abrem e fecham. Confira na etiqueta se é abdutora (abrir) ou adutora (fechar) — são exercícios opostos.' }),
  eq('multi-hip', 'hip-abduction', 'multi-hip', 'Multi-Hip',
    { primary: false, note: 'Etiqueta "Multi-Hip": abdução, adução e extensão de quadril em pé.' }),

  eq('hip-thrust', 'hip-thrust', 'hip-thrust', 'Máquina de elevação de quadril',
    { note: 'Plataforma para os pés e apoio acolchoado sobre o quadril.' }),
  eq('glute-drive', 'hip-thrust', 'glute-drive', 'Glute drive',
    { primary: false, confirm: true }),
  eq('hip-thrust-2', 'hip-thrust', 'hip-thrust-2', 'Máquina de quadril (outra)',
    { primary: false, confirm: true }),
  eq('gluteo-maquina', 'cable-kickback', 'gluteo-maquina', 'Coice de glúteo na máquina (apoio de joelho)',
    { confirm: true, note: 'Versão em máquina do coice: um joelho no apoio, a outra perna empurra a alavanca para trás. Mesmo movimento da polia.' }),

  eq('panturrilha-sentada', 'seated-calf-raise', 'panturrilha-sentada', 'Panturrilha sentada',
    { confirm: true, note: 'Apoio sobre os joelhos e plataforma para a ponta dos pés.' }),
  eq('panturrilha-em-pe', 'calf-raise', 'panturrilha-em-pe', 'Panturrilha em pé',
    { primary: false, confirm: true }),
  eq('panturrilha-vermelha', 'calf-raise', 'panturrilha-vermelha', 'Panturrilha (máquina vermelha)',
    { primary: false, confirm: true }),

  /* ---------- costas ---------- */
  eq('puxada-alta', 'lat-pulldown', 'puxada-alta', 'Puxada alta (a máquina da esquerda)',
    { confirm: true, note: 'Assento com apoio para as coxas e barra larga acima da cabeça. A máquina da direita, com degraus e apoio de joelho, é a barra assistida.' }),
  eq('puxada-independente', 'unilateral-pulldown', 'puxada-independente', 'Puxada de braços articulados (área da rua)',
    { note: 'Os dois braços descem separados, com rolos travando as coxas.' }),
  eq('remada-sentada', 'seated-cable-row', 'remada-sentada', 'Remada sentada (polia baixa)',
    { note: 'Banco comprido com apoio para os pés e pegadores no chão ao lado.' }),
  eq('graviton', 'pull-up', 'graviton', 'Barra fixa assistida (graviton)',
    { note: 'Apoio para os joelhos e degraus laterais. Quanto maior a carga escolhida, mais ajuda a máquina dá — é o contrário das outras.' }),

  /* ---------- peito e ombros ---------- */
  eq('supino-inclinado', 'incline-press', 'supino-inclinado', 'Banco inclinado com barra',
    { note: 'Banco regulável com suporte de barra.' }),
  eq('smith-machine', 'box-squat', 'smith-machine', 'Barra guiada (Smith), a fileira toda',
    { primary: false, confirm: true, note: 'A barra corre em trilhos, então não cai para os lados — é a forma mais controlada de agachar na academia. Ponha um banco atrás para marcar até onde descer, como você já faz em casa. Pessoas ao fundo foram desfocadas.' }),
  eq('desenvolvimento-hammer', 'shoulder-press', 'desenvolvimento-hammer', 'Desenvolvimento de placas',
    { brand: 'Hammer Strength', confirm: true }),
  eq('voador-vermelho', 'machine-chest-press', 'voador-vermelho', 'Supino de placas (braços vermelhos)',
    { confirm: true, note: 'Máquina de anilhas com encosto quase em pé e pegadores na altura do peito: é um supino sentado, não um voador. Antes ela aparecia, por engano, no crucifixo e no posterior de ombro.' }),
  eq('supino-hammer', 'incline-press', 'supino-hammer', 'Supino inclinado de placas',
    { brand: 'Hammer Strength', confirm: true, note: 'Versão de placas do supino inclinado, com braços independentes. O encosto fica bem inclinado — se estiver quase em pé, é desenvolvimento de ombros, não supino.' }),
  eq('crossover', 'cable-crossover', 'crossover', 'Polia dupla ajustável (crossover)',
    { brand: 'Alfa Fitness', note: 'Também serve para tríceps na polia e puxada unilateral.' }),

  /* ---------- braços ---------- */
  eq('rosca-scott', 'biceps-curl', 'rosca-scott', 'Rosca scott / banco com apoio',
    { confirm: true }),
  eq('polia-triceps', 'triceps-pushdown', 'polia-triceps', 'Polia alta (estação de cabos com barra fixa em cima)',
    { brand: 'Onix / Technogym', note: 'Prenda a barra ou a corda no carrinho de cima. A mesma estação tem barra fixa no alto e serve de crossover.' }),
];

export const GYM_EQUIPMENT_VERSION = 2;

/**
 * Correção das fotos (v2). Nove registros eram a MESMA foto de outro com
 * nome diferente — o caso visível era o crucifixo e o posterior de ombro
 * mostrando a mesma máquina, que na verdade é um supino de placas. Esses
 * saem; três fotos mudam de exercício. Os exercícios que ficaram sem foto
 * real da academia (crucifixo na máquina, posterior de ombro, remada com
 * apoio do peito) voltam a mostrar a ilustração própria.
 */
export const REMOVED_DUPLICATE_EQUIPMENT = [
  'eq-leg-press-sentado', 'eq-banco-polia', 'eq-graviton-duplo', 'eq-remada-placas',
  'eq-puxada-articulada', 'eq-banco-inclinado-barra', 'eq-peck-deck', 'eq-crossover-alfa', 'eq-rosca-maquina',
];
