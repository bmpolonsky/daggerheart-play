import { clamp, toSafeInteger } from '../../core/utils/clamp';
import type { DomainCardRecord, TraitId } from './types';

export interface DomainCardParsedCost {
  hope: number;
  stress: number;
  tokens: number;
}

export type DomainCardTextMacro =
  | { id: string; kind: 'actionRoll'; start: number; end: number; label: string; difficulty: number | null; traitHint: 'spellcast' | null }
  | { id: string; kind: 'diceRoll'; start: number; end: number; label: string; formula: string; scalesWithProficiency: boolean }
  | { id: string; kind: 'damageRoll'; start: number; end: number; label: string; formula: string; damageType: 'physical' | 'magic' | null }
  | { id: string; kind: 'reference'; start: number; end: number; label: string }
  | { id: string; kind: 'spendHope' | 'gainHope' | 'spendFear' | 'gainFear' | 'markStress' | 'clearStress' | 'markHp' | 'clearHp' | 'spendToken'; start: number; end: number; label: string; amount: number };

type DomainCardResourceMacroKind = Extract<DomainCardTextMacro, { amount: number }>['kind'];
type DomainCardResourceMacroTarget = 'source' | 'gm';

export interface DomainCardResourceMacroPlan {
  cardId: string;
  cardName: string;
  macroId: string;
  label: string;
  kind: DomainCardResourceMacroKind;
  amount: number;
  target: DomainCardResourceMacroTarget;
  canApply: boolean;
  confirmationText: string;
  warning?: string;
}

export function parseDomainCardCost(input: string | undefined): DomainCardParsedCost {
  const text = input?.trim() ?? '';
  if (!text) return { hope: 0, stress: 0, tokens: 0 };
  return {
    hope: costAmount(text, ['hope', 'надежд']),
    stress: costAmount(text, ['stress', 'стресс']),
    tokens: costAmount(text, ['token', 'жетон'])
  };
}

export function parseDomainCardTextMacros(text: string): DomainCardTextMacro[] {
  const macros: DomainCardTextMacro[] = [];
  collectActionRollMacros(text, macros);
  collectDiceRollMacros(text, macros);
  collectResourceMacros(text, macros);
  return dedupeOverlappingMacros(macros).sort((left, right) => left.start - right.start || left.end - right.end);
}

export function resolveDomainCardDiceFormula(
  macro: Extract<DomainCardTextMacro, { kind: 'diceRoll' }>,
  proficiency: number
): string {
  if (!macro.scalesWithProficiency) return macro.formula;
  return scaleImplicitDiceFormulaByProficiency(macro.formula, proficiency);
}

export function scaleImplicitDiceFormulaByProficiency(formula: string, proficiency: number): string {
  const normalized = normalizeDiceFormula(formula);
  const safeProficiency = Math.max(1, Math.trunc(proficiency));
  return normalized.replace(/(^|[+-])(\d*)d(4|6|8|10|12)(?=$|[+-])/giu, (_match, sign: string, count: string, sides: string) => {
    if (count) return `${sign}${count}d${sides}`;
    return `${sign}${safeProficiency}d${sides}`;
  });
}

export function planDomainCardResourceMacro(
  card: Pick<DomainCardRecord, 'id' | 'name' | 'text'>,
  macro: DomainCardTextMacro,
  role: 'gm' | 'player'
): DomainCardResourceMacroPlan | null {
  if (!('amount' in macro)) return null;
  const target = macro.kind === 'spendFear' || macro.kind === 'gainFear'
    ? 'gm'
    : 'source';
  const canApply = target === 'source' || (target === 'gm' && role === 'gm');
  return {
    cardId: card.id,
    cardName: card.name,
    macroId: macro.id,
    label: macro.label,
    kind: macro.kind,
    amount: macro.amount,
    target,
    canApply,
    confirmationText: `${card.name}: ${resourceMacroActionLabel(macro.kind, macro.amount)}?`,
    warning: canApply ? undefined : resourceMacroWarning(target, role)
  };
}

export function resolveDomainCardTokenMax(card: DomainCardRecord, traits: Record<TraitId, number>): number {
  const text = normalizeRulesText(`${card.cost ?? ''}\n${card.text}`);
  const explicitMax =
    text.match(/(?:максимум|не более|до|max(?:imum)?|up to)\s*(\d+)\s*(?:жетон|token)/i) ??
    text.match(/(?:жетон|token)[а-яa-z\s:.-]*(?:максимум|max(?:imum)?|up to)\s*(\d+)/i);
  if (explicitMax) return clamp(toSafeInteger(explicitMax[1], 0), 0, 12);

  const trait = tokenMaxTrait(text);
  if (trait) {
    const traitValue = clamp(traits[trait] ?? 0, 0, 12);
    return traitValue > 0 ? traitValue : 6;
  }

  return /(?:жетон|token)/i.test(text) ? 6 : 0;
}

function costAmount(text: string, labels: string[]): number {
  const normalized = text.toLowerCase();
  for (const label of labels) {
    const afterMatch = normalized.match(new RegExp(`${label}[а-яa-z\\s:.-]*(\\d+)`, 'i'));
    if (afterMatch) return clamp(toSafeInteger(afterMatch[1], 1), 0, 20);
    const beforeMatch = normalized.match(new RegExp(`(\\d+)[а-яa-z\\s:.-]*${label}`, 'i'));
    if (beforeMatch) return clamp(toSafeInteger(beforeMatch[1], 1), 0, 20);
    if (normalized.includes(label)) return 1;
  }
  return 0;
}

function resourceMacroActionLabel(kind: DomainCardResourceMacroKind, amount: number): string {
  if (kind === 'spendHope') return `потратить Надежду ${amount}`;
  if (kind === 'gainHope') return `получить Надежду ${amount}`;
  if (kind === 'spendFear') return `потратить Страх ${amount}`;
  if (kind === 'gainFear') return `получить Страх ${amount}`;
  if (kind === 'markStress') return `отметить Стресс ${amount}`;
  if (kind === 'clearStress') return `очистить Стресс ${amount}`;
  if (kind === 'markHp') return `отметить Раны ${amount}`;
  if (kind === 'clearHp') return `очистить Раны ${amount}`;
  return `потратить жетоны ${amount}`;
}

function resourceMacroWarning(target: DomainCardResourceMacroTarget, role: 'gm' | 'player'): string {
  if (target === 'gm' && role !== 'gm') return 'Ресурсы Мастера применяет только Мастер.';
  return role === 'gm'
    ? 'Не удалось надежно определить владельца ресурса.'
    : 'Ресурсный макрос не применен: владелец ресурса не очевиден.';
}

function collectActionRollMacros(text: string, macros: DomainCardTextMacro[]): void {
  forEachMatch(text, /(?:бросок|броска)\s+заклинания(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('spellcast', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: 'spellcast'
    });
  });
  forEachMatch(text, /spellcast\s+roll(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('spellcast', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: 'spellcast'
    });
  });
  forEachMatch(text, /(?:совершите|сделайте|make|perform)\s+(?:a\s+)?(?:бросок|roll)(?:\s+действия|\s+duality)?(?:\s*\((\d+)\))?/giu, (match, index) => {
    if (/заклинания|spellcast/i.test(match[0])) return;
    macros.push({
      id: macroId('action', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: null
    });
  });
  forEachMatch(text, /(?:броском|бросок|броска)\s+реакции(?:\s+на\s+(?:проворность|силу|искусность|инстинкт|влияние|знание|agility|strength|finesse|instinct|presence|knowledge))?(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('reaction-roll', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: null
    });
  });
  forEachMatch(text, /reaction\s+roll(?:\s+(?:on\s+)?(?:agility|strength|finesse|instinct|presence|knowledge))?(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('reaction-roll', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: null
    });
  });
  forEachMatch(text, /(?:броском|бросок|броска)\s+(?:проворности|силы|искусности|инстинкта|влияния|знания|agility|strength|finesse|instinct|presence|knowledge)(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('trait-roll', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: null
    });
  });
  forEachMatch(text, /(?:agility|strength|finesse|instinct|presence|knowledge)\s+roll(?:\s*\((\d+)\))?/giu, (match, index) => {
    macros.push({
      id: macroId('trait-roll', index),
      kind: 'actionRoll',
      start: index,
      end: index + match[0].length,
      label: match[0],
      difficulty: match[1] ? clamp(toSafeInteger(match[1], 0), 0, 99) : null,
      traitHint: null
    });
  });
}

function collectDiceRollMacros(text: string, macros: DomainCardTextMacro[]): void {
  const die = String.raw`(?:\d+)?d(?:4|6|8|10|12|20)`;
  const term = String.raw`(?:${die}|\d+)`;
  const formulaPattern = new RegExp(String.raw`(^|[^а-яa-z0-9])(${die}(?:\s*[+-]\s*${term})*)(?![а-яa-z0-9])`, 'giu');
  forEachMatch(text, formulaPattern, (match, index) => {
    const prefix = match[1] ?? '';
    const formula = normalizeDiceFormula(match[2]);
    const start = index + prefix.length;
    macros.push({
      id: macroId('dice', start),
      kind: 'diceRoll',
      start,
      end: start + match[2].length,
      label: formula,
      formula,
      scalesWithProficiency: hasImplicitDiceCount(formula)
    });
  });
}

function hasImplicitDiceCount(formula: string): boolean {
  return /(^|[+-])d(?:4|6|8|10|12)(?=$|[+-])/iu.test(normalizeDiceFormula(formula));
}

function normalizeDiceFormula(formula: string): string {
  return formula.replace(/\s+/g, '').toLowerCase();
}

function collectResourceMacros(text: string, macros: DomainCardTextMacro[]): void {
  const amount = String.raw`(?:(\d+)|a|an|one|один|одно|одну|одного|одной|дополнительн(?:ую|ые|ый|ое)|additional)\s+`;
  const specs: Array<[RegExp, DomainCardResourceMacroKind, string]> = [
    [new RegExp(String.raw`(?:потратьте|потратить|потрать|тратите|тратит|spend|spends)\s+(?:${amount})?(?:надежд(?:у|ы|а)?|hope)`, 'giu'), 'spendHope', 'Потратить Надежду'],
    [new RegExp(String.raw`(?:получите|получить|получи|получает|получаете|gain|gains)\s+(?:${amount})?(?:надежд(?:у|ы|а)?|hope)`, 'giu'), 'gainHope', 'Получить Надежду'],
    [new RegExp(String.raw`(?:потратьте|потратить|потрать|тратите|тратит|spend|spends)\s+(?:${amount})?(?:страх(?:а)?|fear)`, 'giu'), 'spendFear', 'Потратить Страх'],
    [new RegExp(String.raw`(?:получите|получить|получи|получает|получаете|gain|gains)\s+(?:${amount})?(?:страх(?:а)?|fear)`, 'giu'), 'gainFear', 'Получить Страх'],
    [new RegExp(String.raw`(?:отметьте|отметить|отмечает|отмечаете|mark|marks)\s+(?:${amount})?(?:стресс(?:а)?|stress)`, 'giu'), 'markStress', 'Отметить Стресс'],
    [new RegExp(String.raw`(?:очистите|очистить|очищает|очищаете|снимите|снять|снимает|снимаете|clear|clears)\s+(?:${amount})?(?:стресс(?:а)?|stress)`, 'giu'), 'clearStress', 'Очистить Стресс'],
    [new RegExp(String.raw`(?:отметьте|отметить|отмечает|отмечаете|mark|marks)\s+(?:${amount})?(?:ран(?:у|ы|а)?|hp|hit points?|hit point)`, 'giu'), 'markHp', 'Отметить Рану'],
    [new RegExp(String.raw`(?:очистите|очистить|очищает|очищаете|снимите|снять|снимает|снимаете|исцелите|исцелить|исцеляет|heal|heals|clear|clears)\s+(?:${amount})?(?:ран(?:у|ы|а)?|hp|hit points?|hit point)`, 'giu'), 'clearHp', 'Очистить Рану'],
    [new RegExp(String.raw`(?:потратьте|потратить|потрать|тратите|тратит|spend|spends)\s+(?:${amount})?(?:жетон(?:а|ы|ов)?|token)`, 'giu'), 'spendToken', 'Потратить жетон']
  ];
  specs.forEach(([pattern, kind, fallbackLabel]) => {
    forEachMatch(text, pattern, (match, index) => {
      macros.push({
        id: macroId(kind, index),
        kind,
        start: index,
        end: index + match[0].length,
        label: match[0].trim() || fallbackLabel,
        amount: clamp(toSafeInteger(match[1], 1), 1, 20)
      });
    });
  });
}

function dedupeOverlappingMacros(macros: DomainCardTextMacro[]): DomainCardTextMacro[] {
  const selected: DomainCardTextMacro[] = [];
  const byPriority = [...macros].sort((left, right) => {
    const lengthDelta = (right.end - right.start) - (left.end - left.start);
    return lengthDelta || left.start - right.start;
  });
  for (const macro of byPriority) {
    if (selected.some((item) => rangesOverlap(macro, item))) continue;
    selected.push(macro);
  }
  return selected;
}

function rangesOverlap(left: Pick<DomainCardTextMacro, 'start' | 'end'>, right: Pick<DomainCardTextMacro, 'start' | 'end'>): boolean {
  return left.start < right.end && right.start < left.end;
}

function forEachMatch(text: string, pattern: RegExp, callback: (match: RegExpExecArray, index: number) => void): void {
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    callback(match, match.index);
    match = pattern.exec(text);
  }
}

function tokenMaxTrait(text: string): TraitId | null {
  const equalTrait = text.match(/(?:жетон|token)[^.?!]*(?:равн|equal)[^.?!]*(влияни|presence|проворност|agility|сил|strength|искусност|finesse|инстинкт|instinct|знани|knowledge)/i);
  if (!equalTrait) return null;
  return traitFromText(equalTrait[1]);
}

function traitFromText(text: string): TraitId | null {
  const normalized = text.toLowerCase();
  if (/presence|влияни/.test(normalized)) return 'presence';
  if (/agility|проворност/.test(normalized)) return 'agility';
  if (/strength|сил/.test(normalized)) return 'strength';
  if (/finesse|искусност/.test(normalized)) return 'finesse';
  if (/instinct|инстинкт/.test(normalized)) return 'instinct';
  if (/knowledge|знани/.test(normalized)) return 'knowledge';
  return null;
}

function macroId(kind: string, index: number): string {
  return `${kind}:${index}`;
}

function normalizeRulesText(text: string): string {
  return text.replace(/ё/g, 'е').toLowerCase();
}
