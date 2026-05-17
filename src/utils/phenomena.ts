export type PhenomenonKind = 'water' | 'drift' | 'freeze' | 'jam' | 'unknown';

export const PHENOMENON_INFO: Record<PhenomenonKind, { title: string; description: string }> = {
  water: {
    title: 'Чистая вода',
    description: 'Участок свободен ото льда или наблюдается вода на льду.',
  },
  drift: {
    title: 'Ледоход',
    description: 'Наблюдается движение льда, подвижки, закраины или разводья.',
  },
  freeze: {
    title: 'Ледостав',
    description: 'Фиксируется устойчивый ледяной покров на участке реки.',
  },
  jam: {
    title: 'Затор',
    description: 'Обнаружено скопление льда с риском подпора воды.',
  },
  unknown: {
    title: 'Не определено',
    description: 'Есть отметка наблюдения, но тип явления не распознан.',
  },
};

export function detectPhenomenonKind(notes?: string, locationName?: string): PhenomenonKind {
  const text = `${notes ?? ''} ${locationName ?? ''}`.toLowerCase();
  if (text.includes('затор') || text.includes('навал')) return 'jam';
  if (text.includes('чистая вода') || text.includes('вода на льду')) return 'water';
  if (text.includes('ледостав')) return 'freeze';
  if (
    text.includes('ледоход') ||
    text.includes('подвижк') ||
    text.includes('закраин') ||
    text.includes('развод')
  ) {
    return 'drift';
  }
  return 'unknown';
}

export function isJamObservation(notes?: string, locationName?: string): boolean {
  return detectPhenomenonKind(notes, locationName) === 'jam';
}
