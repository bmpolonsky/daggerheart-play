export type BuilderStep = 'class' | 'ancestry' | 'community' | 'subclass' | 'traits' | 'identity' | 'background' | 'connections' | 'equipment' | 'cards' | 'loadout';

export const BUILDER_STEPS: Array<{ id: BuilderStep; label: string }> = [
  { id: 'class', label: 'Класс' },
  { id: 'ancestry', label: 'Родословная' },
  { id: 'community', label: 'Сообщество' },
  { id: 'subclass', label: 'Подкласс' },
  { id: 'traits', label: 'Характеристики' },
  { id: 'identity', label: 'Личность' },
  { id: 'background', label: 'История' },
  { id: 'connections', label: 'Связи' },
  { id: 'equipment', label: 'Экипировка' },
  { id: 'cards', label: 'Карты' },
  { id: 'loadout', label: 'Итог' }
];

export function nextBuilderStep(step: BuilderStep): BuilderStep {
  const index = BUILDER_STEPS.findIndex((item) => item.id === step);
  return BUILDER_STEPS[Math.min(BUILDER_STEPS.length - 1, index + 1)]?.id ?? 'loadout';
}

export function previousBuilderStep(step: BuilderStep): BuilderStep {
  const index = BUILDER_STEPS.findIndex((item) => item.id === step);
  return BUILDER_STEPS[Math.max(0, index - 1)]?.id ?? 'class';
}
