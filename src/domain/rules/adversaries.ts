import { clamp, toSafeInteger } from '../../core/utils/clamp';
import type { AdversaryFeature, AdversaryType } from './types';

export interface AdversaryFeatureCost {
  fear: number;
  stress: number;
}

export interface ExplicitAdversaryFeatureCost {
  kind?: Extract<AdversaryFeature['kind'], 'fear'>;
  cost: string;
}

export function battlePointsForAdversaryType(type: AdversaryType): number {
  if (type === 'Minion' || type === 'Social' || type === 'Support') return 1;
  if (type === 'Horde' || type === 'Ranged' || type === 'Skulk' || type === 'Standard') return 2;
  if (type === 'Leader') return 3;
  if (type === 'Bruiser') return 4;
  if (type === 'Solo') return 5;
  return 2;
}

export function inferExplicitAdversaryFeatureCost(input: string): ExplicitAdversaryFeatureCost {
  const fear = explicitResourceCost(input, 'fear');
  if (fear > 0) return { kind: 'fear', cost: `Страх ${fear}` };
  const stress = explicitResourceCost(input, 'stress');
  if (stress > 0) return { cost: `Стресс ${stress}` };
  return { cost: '' };
}

export function parseAdversaryFeatureCost(feature: AdversaryFeature): AdversaryFeatureCost {
  const text = `${feature.cost ?? ''}`.trim();
  return {
    fear: costAmount(text, ['fear', 'страх']),
    stress: costAmount(text, ['stress', 'стресс'])
  };
}

function costAmount(text: string, labels: string[]): number {
  const normalized = text.toLowerCase();
  if (!normalized) return 0;
  for (const label of labels) {
    const afterMatch = normalized.match(new RegExp(`${label}[а-яa-z\\s:.-]*(\\d+)`, 'i'));
    if (afterMatch) return clamp(toSafeInteger(afterMatch[1], 1), 0, 20);
    const beforeMatch = normalized.match(new RegExp(`(\\d+)[а-яa-z\\s:.-]*${label}`, 'i'));
    if (beforeMatch) return clamp(toSafeInteger(beforeMatch[1], 1), 0, 20);
    if (normalized.includes(label)) return 1;
  }
  return 0;
}

function explicitResourceCost(input: string, resource: 'fear' | 'stress'): number {
  const labels = resource === 'fear' ? '(?:fear|страх)' : '(?:stress|стресс)';
  const normalized = input.toLowerCase();
  const match = normalized.match(new RegExp(`(?:spend|cost|costs|потратьте|потратить|цена|стоит)\\s*[:\\-—]?\\s*(?:(\\d+)\\s*)?${labels}(?:\\s*(\\d+))?`, 'i'));
  if (!match) return 0;
  return clamp(toSafeInteger(match[1] || match[2] || 1, 1), 1, 20);
}
