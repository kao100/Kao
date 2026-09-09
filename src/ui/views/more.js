/** Aba "Mais": acesso a todas as áreas de acompanhamento. */

import { h } from '../../core/dom.js';
import * as store from '../../core/store.js';
import { formatDate } from '../../core/format.js';
import { kneeStatus } from '../../logic/knee.js';
import { page, topbar, menuRow, sectionTitle, safetyNote } from '../shell.js';

export async function moreView() {
  const [knee, settings, guidance, equipment, photos] = await Promise.all([
    kneeStatus(),
    store.settings.get(),
    store.activeMedicalGuidance(),
    store.equipment.all(),
    store.photos.all(),
  ]);

  const kneeSub = {
    ok: 'Sem sinais de alerta nos registros recentes',
    attention: '🟡 Atenção nos últimos registros',
    caution: '🔴 Cautela — sem sugestão de aumento de carga',
  }[knee.level];

  return page(
    topbar({ title: 'Mais' }),

    h('div.stack.stack--sm',
      sectionTitle('Saúde e acompanhamento'),
      menuRow({ icon: '🦵', title: 'Joelho esquerdo', sub: kneeSub, to: '/joelho' }),
      menuRow({
        icon: '🩺',
        title: 'Orientações médicas',
        sub: guidance
          ? `Ativa desde ${formatDate(guidance.date, 'full')}`
          : settings?.nextAppointment
            ? `Retorno em ${formatDate(settings.nextAppointment, 'full')}`
            : 'Cadastre o que o profissional orientou',
        to: '/medico',
      }),
      menuRow({ icon: '📸', title: 'Meu físico', sub: `Medidas e ${photos.length} foto(s) de progresso`, to: '/fisico' }),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Treino'),
      menuRow({ icon: '📚', title: 'Biblioteca de exercícios', sub: 'Como identificar e executar cada exercício', to: '/biblioteca' }),
      menuRow({ icon: '🏭', title: 'Minha academia', sub: `${equipment.length} máquina(s) com foto`, to: '/academia' }),
      menuRow({ icon: '❤️', title: 'Planos de cardio', sub: 'Fases da esteira', to: '/cardio-planos' }),
      menuRow({ icon: '⚽', title: 'Registrar futebol', sub: 'Duração, intensidade e joelho', to: '/futebol' }),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Rotina'),
      menuRow({ icon: '📊', title: 'Resumo da semana', sub: 'Treinos, minutos, progressão e joelho', to: '/semana' }),
      menuRow({ icon: '💊', title: 'Suplementação', sub: 'Creatina Vitafor · Whey DUX', to: '/suplementos' }),
      menuRow({ icon: '🍽️', title: 'Nutrição', sub: 'Registro opcional de calorias e macros', to: '/nutricao' }),
      menuRow({ icon: '⚙️', title: 'Ajustes e backup', sub: 'Perfil, descansos, exportar dados', to: '/ajustes' }),
    ),

    safetyNote('Nunca treine "por cima" de dor articular ou de tendão. Desconforto muscular do treino é uma coisa; dor no joelho é outra — e merece avaliação profissional.'),
  );
}
