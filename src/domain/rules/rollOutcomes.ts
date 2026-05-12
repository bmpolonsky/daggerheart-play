import type { ActionRollOutcome } from './types';

export interface ActionOutcomeInput {
  hopeDie: number;
  fearDie: number;
  total: number;
  difficulty: number;
}

export interface ActionOutcomeResult {
  outcome: ActionRollOutcome;
  success: boolean;
  isCritical: boolean;
  tone: 'hope' | 'fear' | 'critical';
  label: string;
  gmPrompt: string;
}

export function resolveActionOutcome(input: ActionOutcomeInput): ActionOutcomeResult {
  const { hopeDie, fearDie, total, difficulty } = input;

  if (hopeDie === fearDie) {
    return {
      outcome: 'criticalSuccess',
      success: true,
      isCritical: true,
      tone: 'critical',
      label: 'Критический успех',
      gmPrompt: 'Автоуспех: игрок получает Надежду, очищает 1 Стресс и получает дополнительный бонус в сцене.'
    };
  }

  const success = total >= difficulty;
  const hopeDominates = hopeDie > fearDie;

  if (success && hopeDominates) {
    return {
      outcome: 'successWithHope',
      success,
      isCritical: false,
      tone: 'hope',
      label: 'Успех с Надеждой',
      gmPrompt: 'Да, и... Герой получает желаемое и 1 Надежду.'
    };
  }

  if (success && !hopeDominates) {
    return {
      outcome: 'successWithFear',
      success,
      isCritical: false,
      tone: 'fear',
      label: 'Успех со Страхом',
      gmPrompt: 'Да, но... Герой успешен, а Мастер получает 1 Страх и добавляет цену или осложнение.'
    };
  }

  if (!success && hopeDominates) {
    return {
      outcome: 'failureWithHope',
      success,
      isCritical: false,
      tone: 'hope',
      label: 'Провал с Надеждой',
      gmPrompt: 'Нет, но... Герой проваливает цель, получает 1 Надежду, Активация переходит Мастеру.'
    };
  }

  return {
    outcome: 'failureWithFear',
    success,
    isCritical: false,
    tone: 'fear',
    label: 'Провал со Страхом',
    gmPrompt: 'Нет, и... Провал становится серьёзнее, Мастер получает 1 Страх, Активация переходит Мастеру.'
  };
}

export function outcomeClassName(outcome: ActionRollOutcome): string {
  return `outcome-${outcome}`;
}
