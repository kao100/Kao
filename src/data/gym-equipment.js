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
  eq('leg-press-sentado', 'leg-press', 'leg-press-sentado', 'Leg press sentado (plataformas independentes)',
    { primary: false, confirm: true }),
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
  eq('quadril-selim', 'hip-abduction', 'quadril-selim', 'Máquina de quadril com selim (área da rua)',
    { primary: false, confirm: true, note: 'Selim para sentar e duas plataformas para os pés, que abrem e fecham. Confira na etiqueta se é abdutora (abrir) ou adutora (fechar) — são exercícios opostos.' }),
  eq('multi-hip', 'hip-abduction', 'multi-hip', 'Multi-Hip',
    { primary: false, note: 'Etiqueta "Multi-Hip": abdução, adução e extensão de quadril em pé.' }),

  eq('hip-thrust', 'hip-thrust', 'hip-thrust', 'Máquina de elevação de quadril',
    { note: 'Plataforma para os pés e apoio acolchoado sobre o quadril.' }),
  eq('glute-drive', 'hip-thrust', 'glute-drive', 'Glute drive',
    { primary: false, confirm: true }),
  eq('hip-thrust-2', 'hip-thrust', 'hip-thrust-2', 'Máquina de quadril (outra)',
    { primary: false, confirm: true }),
  eq('gluteo-maquina', 'hip-thrust', 'gluteo-maquina', 'Glúteo na máquina',
    { primary: false, confirm: true }),

  eq('panturrilha-sentada', 'calf-raise', 'panturrilha-sentada', 'Panturrilha sentada',
    { confirm: true, note: 'Apoio sobre os joelhos e plataforma para a ponta dos pés.' }),
  eq('panturrilha-em-pe', 'calf-raise', 'panturrilha-em-pe', 'Panturrilha em pé',
    { primary: false, confirm: true }),
  eq('panturrilha-vermelha', 'calf-raise', 'panturrilha-vermelha', 'Panturrilha (máquina vermelha)',
    { primary: false, confirm: true }),

  /* ---------- costas ---------- */
  eq('puxada-alta', 'lat-pulldown', 'puxada-alta', 'Puxada alta',
    { note: 'Assento com apoio para as coxas e barra larga acima da cabeça.' }),
  eq('puxada-independente', 'unilateral-pulldown', 'puxada-independente', 'Puxada com braços independentes',
    { confirm: true }),
  eq('puxada-articulada', 'unilateral-pulldown', 'puxada-articulada', 'Puxada de braços articulados (área da rua)',
    { primary: false, note: 'Os dois braços descem separados, com rolos travando as coxas. Ao lado fica uma puxada comum ("Lat PullDown").' }),
  eq('remada-placas', 'chest-supported-row', 'remada-placas', 'Remada de placas com apoio para o peito',
    { confirm: true, note: 'Sentado de frente para a máquina, peito no apoio e pés nas plataformas. Confira a etiqueta: pode ser remada alta em vez de remada com apoio do peito.' }),
  eq('remada-sentada', 'seated-cable-row', 'remada-sentada', 'Remada sentada (polia baixa)',
    { note: 'Banco comprido com apoio para os pés e pegadores no chão ao lado.' }),
  eq('banco-polia', 'seated-cable-row', 'banco-polia', 'Banco em frente à polia (área da rua)',
    { primary: false, confirm: true, note: 'Torre de peso com o triângulo e a barra reta no chão ao lado. Confira o que o banco faz: pode ser remada sentada ou um banco regulável posto na frente da polia.' }),
  eq('graviton', 'pull-up', 'graviton', 'Barra fixa assistida (graviton)',
    { note: 'Serve para treinar a barra com assistência, além da barra de casa.' }),
  eq('graviton-duplo', 'pull-up', 'graviton-duplo', 'Duas barras assistidas lado a lado (área da rua)',
    { primary: false, note: 'Apoio para os joelhos e degraus laterais. Quanto maior a carga escolhida, mais ajuda a máquina dá — é o contrário das outras.' }),

  /* ---------- peito e ombros ---------- */
  eq('supino-inclinado', 'incline-press', 'supino-inclinado', 'Banco inclinado com barra',
    { note: 'Banco regulável com suporte de barra.' }),
  eq('smith-machine', 'box-squat', 'smith-machine', 'Barra guiada (Smith), a fileira toda',
    { primary: false, confirm: true, note: 'A barra corre em trilhos, então não cai para os lados — é a forma mais controlada de agachar na academia. Ponha um banco atrás para marcar até onde descer, como você já faz em casa. Pessoas ao fundo foram desfocadas.' }),
  eq('banco-inclinado-barra', 'incline-press', 'banco-inclinado-barra', 'Banco inclinado com barra (outro)',
    { primary: false, note: 'Banco regulável em frente ao suporte de barra, do lado da piscina.' }),
  eq('desenvolvimento-hammer', 'shoulder-press', 'desenvolvimento-hammer', 'Desenvolvimento de placas',
    { brand: 'Hammer Strength', confirm: true }),
  eq('peck-deck', 'pec-deck', 'peck-deck', 'Voador / peck deck',
    { confirm: true }),
  eq('voador-vermelho', 'reverse-fly', 'voador-vermelho', 'Voador de braços vermelhos',
    { confirm: true, note: 'Sentado de peito no apoio, puxando os braços para trás. Confira na etiqueta: o mesmo aparelho costuma servir para o crucifixo (voador normal) virando o assento — se for esse o caso, troque o exercício aqui.' }),
  eq('supino-hammer', 'incline-press', 'supino-hammer', 'Supino inclinado de placas',
    { brand: 'Hammer Strength', confirm: true, note: 'Versão de placas do supino inclinado, com braços independentes. O encosto fica bem inclinado — se estiver quase em pé, é desenvolvimento de ombros, não supino.' }),
  eq('crossover', 'cable-crossover', 'crossover', 'Polia dupla ajustável (crossover)',
    { brand: 'Alfa Fitness', note: 'Também serve para tríceps na polia e puxada unilateral.' }),
  eq('crossover-alfa', 'cable-crossover', 'crossover-alfa', 'Crossover Alfa 2050, de frente',
    { brand: 'Alfa Fitness', primary: false, note: 'A mesma estação vista de frente, com a etiqueta "Sistema de Polia Dupla" visível. As duas torres regulam a altura da polia de forma independente.' }),

  /* ---------- braços ---------- */
  eq('rosca-scott', 'biceps-curl', 'rosca-scott', 'Rosca scott / banco com apoio',
    { confirm: true }),
  eq('rosca-maquina', 'biceps-curl', 'rosca-maquina', 'Rosca scott na máquina (área da rua)',
    { primary: false, confirm: true, note: 'Apoio acolchoado para os braços e pegador curvo preso à torre de peso.' }),
  eq('polia-triceps', 'triceps-pushdown', 'polia-triceps', 'Polia alta (estação de cabos com barra fixa em cima)',
    { brand: 'Onix / Technogym', note: 'Prenda a barra ou a corda no carrinho de cima. A mesma estação tem barra fixa no alto e serve de crossover.' }),
];

export const GYM_EQUIPMENT_VERSION = 1;
