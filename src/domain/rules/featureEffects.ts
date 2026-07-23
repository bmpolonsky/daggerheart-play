import { cleanMarkdownText } from '../../core/utils/markdownText';

export type FeatureRuleEffect =
  | FeatureStatDeltaEffect
  | FeatureDomainCardGrantEffect
  | FeatureRestChoiceCountEffect
  | FeatureRestMoveSwapEffect
  | FeatureRestRerollEffect
  | FeatureRestMoveGrantEffect
  | FeatureUsageLimitEffect
  | FeatureUsageAllowanceEffect
  | FeatureInventoryGrantEffect
  | FeatureCreationChoiceEffect
  | FeatureResourceInitEffect
  | FeatureAdvancementGrantEffect
  | FeatureCompanionGrantEffect;

export type FeatureStatTarget =
  | 'hpMax'
  | 'stressMax'
  | 'evasion'
  | 'armorScore'
  | 'thresholdMajor'
  | 'thresholdSevere'
  | 'agility'
  | 'strength'
  | 'finesse'
  | 'instinct'
  | 'presence'
  | 'knowledge';

export type FeatureUsageReset = 'rest' | 'longRest' | 'session' | 'scene';

export interface FeatureRuleEvidence {
  text: string;
  start: number;
  end: number;
}

interface FeatureRuleEffectBase {
  id: string;
  summary: string;
  evidence: FeatureRuleEvidence;
  /** Automatic effects change derived rules. Assisted effects only add UI affordances. */
  automatic: boolean;
}

export interface FeatureStatDeltaEffect extends FeatureRuleEffectBase {
  kind: 'statDelta';
  target: FeatureStatTarget;
  amount: number;
  amountSource?: 'proficiency';
}

export interface FeatureDomainCardGrantEffect extends FeatureRuleEffectBase {
  kind: 'domainCardGrant';
  count: number;
}

export interface FeatureRestChoiceCountEffect extends FeatureRuleEffectBase {
  kind: 'restChoiceCount';
  rest: 'any' | 'short' | 'long';
  count: number;
}

export interface FeatureRestMoveSwapEffect extends FeatureRuleEffectBase {
  kind: 'restMoveSwap';
  from: 'short';
  to: 'long';
  max: number;
}

export interface FeatureRestRerollEffect extends FeatureRuleEffectBase {
  kind: 'restReroll';
  rest: 'short' | 'long';
  max: number;
  scope: 'self' | 'selfOrAlly';
}

export interface FeatureRestMoveGrantEffect extends FeatureRuleEffectBase {
  kind: 'restMoveGrant';
  rest: 'any' | 'short' | 'long';
  scope: 'self' | 'party';
  label: string;
}

export interface FeatureUsageLimitEffect extends FeatureRuleEffectBase {
  kind: 'usageLimit';
  max: number;
  reset: FeatureUsageReset;
  scope: 'feature' | 'targetFeature' | 'perOption';
  targetLabel?: string;
  options?: string[];
}

export interface FeatureUsageAllowanceEffect extends FeatureRuleEffectBase {
  kind: 'usageAllowance';
  count: number;
  reset: FeatureUsageReset;
  targetLabel: string;
}

export interface FeatureInventoryGrantEffect extends FeatureRuleEffectBase {
  kind: 'inventoryGrant';
  name: string;
  count: number;
}

export interface FeatureCreationChoiceEffect extends FeatureRuleEffectBase {
  kind: 'creationChoice';
  choice: 'experienceBonus' | 'customField' | 'stance' | 'element';
  count?: number;
  bonus?: number;
  perRankCount?: number;
  perRankBonus?: number;
}

export interface FeatureResourceInitEffect extends FeatureRuleEffectBase {
  kind: 'resourceInit';
  resource: string;
  value: number;
}

export interface FeatureAdvancementGrantEffect extends FeatureRuleEffectBase {
  kind: 'advancementGrant';
  target: 'companion';
  count: number;
}

export interface FeatureCompanionGrantEffect extends FeatureRuleEffectBase {
  kind: 'companionGrant';
}

export interface FeatureRuleAnalysis {
  text: string;
  effects: FeatureRuleEffect[];
}

/**
 * Compiles deliberately narrow SRD-style phrases into typed, inspectable rules.
 * Content identity is never consulted: official and custom features use the
 * same grammar, while unmatched prose remains readable and inert.
 */
export function analyzeFeatureRules(value: string): FeatureRuleAnalysis {
  const text = cleanMarkdownText(value, {
    stripEmphasis: true,
    normalizeLineBreaks: true,
    trim: false
  });
  const normalized = normalizeRuleText(text);
  const effects: FeatureRuleEffect[] = [];

  collectTrackSlotEffect(effects, text, normalized, 'hpMax', [
    /(?:получите|получаете|получить|gain)\s+(?:(\d+|одну|один|две|два|три)\s+)?дополнительн[а-яa-z]*\s+ячейк[а-яa-z]*\s+(?:ран[а-яa-z]*|hp|hit points?)/i
  ], 'Раны');
  collectTrackSlotEffect(effects, text, normalized, 'stressMax', [
    /(?:получите|получаете|получить|gain)\s+(?:(\d+|одну|один|две|два|три)\s+)?дополнительн[а-яa-z]*\s+ячейк[а-яa-z]*\s+(?:стресс[а-яa-z]*|stress)/i
  ], 'Стресс');

  collectFixedStatEffect(effects, text, normalized, 'evasion', [
    /(?:получите|получаете)\s+постоянн[а-яa-z]*\s+(?:бонус\s+)?([+-]\s*\d+)\s+к\s+(?:ваш[а-яa-z]*\s+)?уклонен[а-яa-z]*/i,
    /gain\s+(?:a\s+)?permanent\s+(?:bonus\s+)?(?:of\s+)?([+-]\s*\d+)\s+to\s+(?:your\s+)?evasion/i
  ], 'Уклонение');
  const armorAndThresholds = matchFirst(normalized, [
    /(?:получите|получаете)\s+(?:постоянн[а-яa-z]*\s+)?(?:бонус\s+)?([+-]\s*\d+)\s+к\s+(?:ваш[а-яa-z]*\s+)?показател[а-яa-z]*\s+брон[а-яa-z]*\s+и\s+порог[а-яa-z]*\s+урон[а-яa-z]*/i,
    /gain\s+(?:a\s+)?(?:permanent\s+)?(?:bonus\s+)?(?:of\s+)?([+-]\s*\d+)\s+to\s+(?:your\s+)?armor score\s+and\s+damage thresholds?/i
  ]);
  if (armorAndThresholds && !isConditionalAutomaticRule(normalized, armorAndThresholds)) {
    const amount = signedAmount(armorAndThresholds.match[1]);
    if (amount !== 0) {
      const evidence = evidenceFor(text, armorAndThresholds);
      effects.push(statEffect('armorScore', amount, `Показатель Брони: ${signedLabel(amount)}`, evidence));
      effects.push(statEffect('thresholdMajor', amount, `Оба порога: ${signedLabel(amount)}`, evidence));
      effects.push(statEffect('thresholdSevere', amount, `Оба порога: ${signedLabel(amount)}`, evidence));
    }
  }
  const traitRules: Array<{ target: Extract<FeatureStatTarget, 'agility' | 'strength' | 'finesse' | 'instinct' | 'presence' | 'knowledge'>; term: string; label: string }> = [
    { target: 'agility', term: 'проворн[а-яa-z]*|agility', label: 'Проворность' },
    { target: 'strength', term: 'сил[а-яa-z]*|strength', label: 'Сила' },
    { target: 'finesse', term: 'искусн[а-яa-z]*|finesse', label: 'Искусность' },
    { target: 'instinct', term: 'инстинкт[а-яa-z]*|instinct', label: 'Инстинкт' },
    { target: 'presence', term: 'влиян[а-яa-z]*|presence', label: 'Влияние' },
    { target: 'knowledge', term: 'знани[а-яa-z]*|knowledge', label: 'Знание' }
  ];
  for (const rule of traitRules) {
    collectFixedStatEffect(effects, text, normalized, rule.target, [
      new RegExp(`(?:получите|получаете)\\s+постоянн[а-яa-z]*\\s+(?:бонус\\s+)?([+-]\\s*\\d+)\\s+к\\s+(?:ваш[а-яa-z]*\\s+)?(?:${rule.term})`, 'i'),
      new RegExp(`gain\\s+(?:a\\s+)?permanent\\s+(?:bonus\\s+)?(?:of\\s+)?([+-]\\s*\\d+)\\s+to\\s+(?:your\\s+)?(?:${rule.term})`, 'i')
    ], rule.label);
  }
  collectFixedStatEffect(effects, text, normalized, 'thresholdMajor', [
    /(?:получите|получаете|gain)\s+постоянн[а-яa-z]*\s+(?:бонус\s+)?([+-]\s*\d+)\s+к\s+(?:ваш[а-яa-z]*\s+)?порог[а-яa-z]*\s+(?:ощутим[а-яa-z]*|major)\s+(?:урон[а-яa-z]*|damage)/i
  ], 'Ощутимый порог');
  collectFixedStatEffect(effects, text, normalized, 'thresholdSevere', [
    /(?:получите|получаете|gain)\s+постоянн[а-яa-z]*\s+(?:бонус\s+)?([+-]\s*\d+)\s+к\s+(?:ваш[а-яa-z]*\s+)?порог[а-яa-z]*\s+(?:тяжел[а-яa-z]*|severe)\s+(?:урон[а-яa-z]*|damage)/i
  ], 'Тяжёлый порог');

  const thresholdEffect = matchFirst(normalized, [
    /(?:получите|получаете|gain)\s+постоянн[а-яa-z]*\s+(?:бонус\s+)?([+-]\s*\d+)\s+к\s+(?:ваш[а-яa-z]*\s+)?порог[а-яa-z]*\s+урон[а-яa-z]*/i
  ]);
  if (thresholdEffect && !isConditionalAutomaticRule(normalized, thresholdEffect)) {
    const amount = signedAmount(thresholdEffect.match[1]);
    if (amount !== 0) {
      const evidence = evidenceFor(text, thresholdEffect);
      effects.push(statEffect('thresholdMajor', amount, `Оба порога: ${signedLabel(amount)}`, evidence));
      effects.push(statEffect('thresholdSevere', amount, `Оба порога: ${signedLabel(amount)}`, evidence));
    }
  }

  const proficiencyThresholds = matchFirst(normalized, [
    /(?:получаете|получите|gain)\s+(?:бонус\s+)?к\s+порог[а-яa-z]*\s+урон[а-яa-z]*[^.]*равн[а-яa-z]*[^.]*мастерств[а-яa-z]*/i,
    /(?:gain)\s+(?:a\s+)?bonus\s+to\s+(?:your\s+)?damage thresholds?[^.]*equal[^.]*proficiency/i
  ]);
  if (proficiencyThresholds && !isConditionalAutomaticRule(normalized, proficiencyThresholds)) {
    const evidence = evidenceFor(text, proficiencyThresholds);
    effects.push(statEffect('thresholdMajor', 1, 'Оба порога: +Мастерство', evidence, 'proficiency'));
    effects.push(statEffect('thresholdSevere', 1, 'Оба порога: +Мастерство', evidence, 'proficiency'));
  }

  const domainCard = matchFirst(normalized, [
    /(?:возьмите|получите|выберите|take|gain)\s+(?:(\d+|одну|один|две|два|три|an?|one|two|three)\s+)?дополнительн[а-яa-z]*\s+карт[а-яa-z]*\s+домен[а-яa-z]*/i,
    /(?:take|gain)\s+(?:(\d+|an?|one|two|three)\s+)?additional\s+domain card/i
  ]);
  if (domainCard && !isConditionalAutomaticRule(normalized, domainCard)) {
    const count = countAmount(domainCard.match[1]);
    const evidence = evidenceFor(text, domainCard);
    effects.push({
      id: effectId('domainCardGrant', evidence),
      kind: 'domainCardGrant',
      count,
      summary: `Дополнительных карт домена: ${count}`,
      evidence,
      automatic: true
    });
  }

  const inventoryGrant = matchFirst(normalized, [
    /добавьте\s+в\s+(?:свой|ваш)\s+инвентар[а-яa-z]*\s+([^.!?\n]+)/i,
    /add\s+([^.!?\n]+?)\s+to\s+your\s+inventory/i
  ]);
  if (inventoryGrant && !isConditionalAutomaticRule(normalized, inventoryGrant)) {
    const evidence = evidenceFor(text, inventoryGrant);
    const name = normalizeRussianAccusativePhrase(originalCapture(text, inventoryGrant, 1).replace(/[«»"']/g, '').trim());
    effects.push({
      id: effectId('inventoryGrant', evidence),
      kind: 'inventoryGrant',
      name,
      count: 1,
      summary: `В инвентарь: ${name}`,
      evidence,
      automatic: true
    });
  }

  const experienceChoice = matchFirst(normalized, [
    /при\s+создании\s+персонаж[а-яa-z]*\s+выберите\s+один\s+из\s+опыт[а-яa-z]*[^.]*постоянн[а-яa-z]*\s+бонус\s+([+-]\s*\d+)/i,
    /when\s+creating\s+(?:your\s+)?character[^.]*choose\s+one\s+(?:of\s+your\s+)?experiences?[^.]*permanent\s+(?:bonus\s+)?(?:of\s+)?([+-]\s*\d+)/i
  ]);
  if (experienceChoice) {
    const evidence = evidenceFor(text, experienceChoice);
    const bonus = signedAmount(experienceChoice.match[1]);
    effects.push({
      id: effectId('creationChoice:experienceBonus', evidence),
      kind: 'creationChoice',
      choice: 'experienceBonus',
      count: 1,
      bonus,
      summary: `При создании: выберите Опыт и увеличьте его на ${signedLabel(bonus)}`,
      evidence,
      automatic: false
    });
  }

  const customFieldChoice = matchFirst(normalized, [
    /выберите\s+сфер[а-яa-z]*[\s\S]{0,260}?выставите\s+им\s+значение\s+([+-]\s*\d+)[\s\S]{0,240}?кажд[а-яa-z]*\s+раз\s*,?[^.]*повышаете\s+(?:свой\s+)?ранг[^.]*постоянн[а-яa-z]*\s+бонус\s+([+-]\s*\d+)/i,
    /choose\s+(?:your\s+)?spheres?[^.]*set\s+their\s+value\s+to\s+([+-]?\s*\d+)[^.]*each\s+time[^.]*increase\s+(?:your\s+)?tier[^.]*permanent\s+(?:bonus\s+)?(?:of\s+)?([+-]\s*\d+)/i
  ]);
  if (customFieldChoice) {
    const evidence = evidenceFor(text, customFieldChoice);
    const bonus = signedAmount(customFieldChoice.match[1]);
    const perRankBonus = signedAmount(customFieldChoice.match[2]);
    effects.push({
      id: effectId('creationChoice:customField', evidence),
      kind: 'creationChoice',
      choice: 'customField',
      bonus,
      perRankBonus,
      summary: `При создании: запишите выбранные сферы со значением ${signedLabel(bonus)}; за новый ранг ${signedLabel(perRankBonus)}`,
      evidence,
      automatic: false
    });
  }

  const stanceChoice = matchFirst(normalized, [
    /начинаете\s+с\s+(одн[а-яa-z]*|дв[а-яa-z]*|тр[еия][а-яa-z]*|\d+)\s+боев[а-яa-z]*\s+сто(?:ек|йк[а-яa-z]*)[\s\S]{0,220}?нов[а-яa-z]*\s+ранг[а-яa-z]*[^.]*взять\s+(одн[а-яa-z]*|дв[а-яa-z]*|тр[еия][а-яa-z]*|\d+)\s+дополнительн[а-яa-z]*\s+сто(?:ек|йк[а-яa-z]*)/i,
    /start\s+with\s+(one|two|three|\d+)\s+combat\s+stances?[^.]*new\s+tier[^.]*take\s+(one|two|three|\d+)\s+additional\s+stances?/i
  ]);
  if (stanceChoice) {
    const evidence = evidenceFor(text, stanceChoice);
    const count = countAmount(stemmedCountAmount(stanceChoice.match[1]));
    const perRankCount = countAmount(stemmedCountAmount(stanceChoice.match[2]));
    effects.push({
      id: effectId('creationChoice:stance', evidence),
      kind: 'creationChoice',
      choice: 'stance',
      count,
      perRankCount,
      summary: `Боевые стойки: ${count} при создании и ещё ${perRankCount} за новый ранг`,
      evidence,
      automatic: false
    });
  }

  const elementChoice = matchFirst(normalized, [
    /выберите\s+один\s+из\s+следующ[а-яa-z]*\s+элемент[а-яa-z]*\s+при\s+создании\s+персонаж[а-яa-z]*/i,
    /choose\s+one\s+of\s+the\s+following\s+elements?\s+when\s+creating\s+(?:your\s+)?character/i
  ]);
  if (elementChoice) {
    const evidence = evidenceFor(text, elementChoice);
    effects.push({
      id: effectId('creationChoice:element', evidence),
      kind: 'creationChoice',
      choice: 'element',
      count: 1,
      summary: 'При создании: выберите один элемент',
      evidence,
      automatic: false
    });
  }

  const resourceInit = matchFirst(normalized, [
    /начните\s+с\s+(\d+|одн[а-яa-z]*|дв[а-яa-z]*|тр[еия][а-яa-z]*)\s+очк[а-яa-z]*\s+([^.!?\n]+)/i,
    /start\s+with\s+(\d+|one|two|three)\s+([^.!?\n]+?)\s+points?/i
  ]);
  if (resourceInit) {
    const evidence = evidenceFor(text, resourceInit);
    const value = countAmount(stemmedCountAmount(resourceInit.match[1]));
    const resource = normalizeResourceName(originalCapture(text, resourceInit, 2).trim());
    effects.push({
      id: effectId('resourceInit', evidence),
      kind: 'resourceInit',
      resource,
      value,
      summary: `Стартовый ресурс «${resource}»: ${value}`,
      evidence,
      automatic: false
    });
  }

  const companionGrant = matchFirst(normalized, [
    /у\s+вас\s+есть\s+животн[а-яa-z-]*компаньон[\s\S]{0,320}?возьмите\s+лист[^.]*компаньон/i,
    /you\s+have\s+an?\s+animal\s+companion[^.]*\.[^.]*take\s+the[^.]*companion\s+sheet/i
  ]);
  if (companionGrant) {
    const evidence = evidenceFor(text, companionGrant);
    effects.push({
      id: effectId('companionGrant', evidence),
      kind: 'companionGrant',
      summary: 'Создайте животное-компаньона по листу компаньона',
      evidence,
      automatic: false
    });
  }

  const companionAdvancement = matchFirst(normalized, [
    /выберите\s+(?:(одн[а-яa-z]*|дв[а-яa-z]*|тр[еия][а-яa-z]*|\d+)\s+)?дополнительн[а-яa-z]*\s+опци[а-яa-z]*\s+повышени[а-яa-z]*\s+уровн[а-яa-z]*\s+для\s+(?:вашего\s+)?компаньон[а-яa-z]*/i,
    /choose\s+(one|two|three|\d+)\s+additional\s+level[- ]up\s+options?\s+for\s+(?:your\s+)?companion/i
  ]);
  if (companionAdvancement) {
    const evidence = evidenceFor(text, companionAdvancement);
    const count = countAmount(stemmedCountAmount(companionAdvancement.match[1]));
    effects.push({
      id: effectId('advancementGrant:companion', evidence),
      kind: 'advancementGrant',
      target: 'companion',
      count,
      summary: `Дополнительных повышений компаньона: ${count}`,
      evidence,
      automatic: false
    });
  }

  const extraRestChoice = matchFirst(normalized, [
    /во\s+время\s+отдых[а-яa-z]*[^.]*совершить\s+(?:(\d+|один|два|три)\s+)?дополнительн[а-яa-z]*\s+ход[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /during\s+(?:a\s+)?rest[^.]*take\s+(?:(\d+|one|two|three)\s+)?additional\s+rest move/i
  ]);
  if (extraRestChoice) {
    const count = countAmount(extraRestChoice.match[1]);
    const evidence = evidenceFor(text, extraRestChoice);
    effects.push({
      id: effectId('restChoiceCount', evidence),
      kind: 'restChoiceCount',
      rest: 'any',
      count,
      summary: `Ходов отдыха: +${count}`,
      evidence,
      automatic: true
    });
  }

  const restSwap = matchFirst(normalized, [
    /заменить\s+один\s+из\s+(?:ваших\s+)?ход[а-яa-z]*\s+коротк[а-яa-z]*\s+отдых[а-яa-z]*\s+на\s+ход[а-яa-z]*\s+продолжительн[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /replace\s+one\s+(?:of\s+your\s+)?short rest moves?\s+with\s+(?:a\s+)?long rest move/i
  ]);
  if (restSwap) {
    const evidence = evidenceFor(text, restSwap);
    effects.push({
      id: effectId('restMoveSwap', evidence),
      kind: 'restMoveSwap',
      from: 'short',
      to: 'long',
      max: 1,
      summary: 'Один ход короткого отдыха можно заменить продолжительным',
      evidence,
      automatic: true
    });
  }

  const restReroll = matchFirst(normalized, [
    /во\s+время\s+коротк[а-яa-z]*\s+отдых[а-яa-z]*[^.]*перебросить\s+одн[а-яa-z]*\s+кость\s+ход[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /during\s+(?:a\s+)?short rest[^.]*reroll\s+one\s+rest move die/i
  ]);
  if (restReroll) {
    const evidence = evidenceFor(text, restReroll);
    const scope = /вы\s+или\s+(?:ваш[а-яa-z]*\s+)?союзник|you\s+or\s+(?:an?\s+)?ally/i.test(restReroll.match[0]) ? 'selfOrAlly' : 'self';
    effects.push({
      id: effectId('restReroll', evidence),
      kind: 'restReroll',
      rest: 'short',
      max: 1,
      scope,
      summary: scope === 'selfOrAlly'
        ? 'Вы или союзник можете один раз перебросить кость хода короткого отдыха'
        : 'Один переброс кости хода короткого отдыха',
      evidence,
      automatic: false
    });
  }

  const namedRestMove = matchFirst(normalized, [
    /(?:(ваша\s+группа)\s+)?получает\s+доступ\s+к\s+ход[а-яa-z]*\s+отдых[а-яa-z]*\s+под\s+названием\s+«?([^».\n]+)»?/i,
    /gains?\s+access\s+to\s+(?:a\s+)?rest move\s+(?:called|named)\s+['\"]?([^.'\"\n]+)['\"]?/i
  ]);
  if (namedRestMove) {
    const evidence = evidenceFor(text, namedRestMove);
    const isPartyEffect = /ваша\s+группа/i.test(namedRestMove.match[0]);
    const labelCaptureIndex = namedRestMove.match[2] !== undefined ? 2 : 1;
    const label = originalCapture(text, namedRestMove, labelCaptureIndex).replace(/[«»"']/g, '').trim();
    effects.push({
      id: effectId('restMoveGrant', evidence),
      kind: 'restMoveGrant',
      rest: 'any',
      scope: isPartyEffect ? 'party' : 'self',
      label,
      summary: `${isPartyEffect ? 'Группе доступен' : 'Доступен'} ход отдыха «${label}»`,
      evidence,
      automatic: false
    });
  }

  const offeredRestMove = matchFirst(normalized, [
    /во\s+время\s+отдых[а-яa-z]*,?\s+потратьте\s+один\s+из\s+(?:своих|ваших)\s+ход[а-яa-z]*\s+отдых[а-яa-z]*\s+в\s+качестве\s+дани\s+(?:вашему\s+)?покровител[а-яa-z]*/i,
    /during\s+(?:a\s+)?rest,?\s+spend\s+one\s+of\s+your\s+rest\s+moves?\s+as\s+(?:a\s+)?tribute\s+to\s+(?:your\s+)?patron/i
  ]);
  if (offeredRestMove) {
    const evidence = evidenceFor(text, offeredRestMove);
    effects.push({
      id: effectId('restMoveGrant', evidence),
      kind: 'restMoveGrant',
      rest: 'any',
      scope: 'self',
      label: 'Дань покровителю',
      summary: 'Доступен ход отдыха «Дань покровителю»',
      evidence,
      automatic: false
    });
  }

  collectStructuredUsageRules(effects, text, normalized);

  collectUsageLimit(effects, text, normalized, 'longRest', [
    /(один|два|три|\d+)\s+раз(?:а)?\s+до\s+следующ[а-яa-z]*\s+продолжительн[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /(one|two|three|\d+)\s+times?\s+(?:before|until)\s+(?:your\s+)?next\s+long rest/i
  ]);
  collectUsageLimit(effects, text, normalized, 'rest', [
    /(один|два|три|\d+)\s+раз(?:а)?\s+до\s+следующ[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /(один|два|три|\d+)\s+раз(?:а)?\s+за\s+отдых/i,
    /(one|two|three|\d+)\s+times?\s+(?:before|until)\s+(?:your\s+)?next\s+rest/i
  ]);
  collectUsageLimit(effects, text, normalized, 'session', [
    /(?:^|[\s,.;:!?])раз\s+за\s+сесси[а-яa-z]*/i,
    /(один|два|три|\d+)\s+раз(?:а)?\s+за\s+сесси[а-яa-z]*/i,
    /(one|two|three|\d+)\s+times?\s+per\s+session/i
  ]);
  collectUsageLimit(effects, text, normalized, 'scene', [
    /перв[а-яa-z]*\s+раз\s+в\s+сцен[а-яa-z]*/i,
    /(?:the\s+)?first\s+time\s+in\s+(?:a\s+)?scene/i
  ]);

  return { text, effects: dedupeEffects(effects) };
}

export function automaticFeatureRuleEffects(value: string): FeatureRuleEffect[] {
  return analyzeFeatureRules(value).effects.filter((effect) => effect.automatic);
}

function collectStructuredUsageRules(effects: FeatureRuleEffect[], text: string, normalized: string): void {
  const perOptionOverride = matchFirst(normalized, [
    /исполнить\s+кажд[а-яa-z]*\s+из\s+(?:ваших\s+)?песен\s+[“"«]([^”"»]+)[”"»]\s+не\s+один,?\s+а\s+(один|два|три|\d+)\s+раз(?:а)?\s+до\s+следующ[а-яa-z]*\s+продолжительн[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /perform\s+each\s+of\s+your\s+[“"']?([^”"']+)[”"']?\s+songs?[^.]*?(one|two|three|\d+)\s+times?\s+(?:before|until)\s+(?:your\s+)?next\s+long\s+rest/i
  ]);
  if (perOptionOverride) {
    const evidence = evidenceFor(text, perOptionOverride);
    const targetLabel = originalCapture(text, perOptionOverride, 1).trim();
    const max = countAmount(perOptionOverride.match[2]);
    effects.push({
      id: effectId('usageLimit:perOption:longRest', evidence),
      kind: 'usageLimit',
      max,
      reset: 'longRest',
      scope: 'perOption',
      targetLabel,
      summary: `Каждая опция «${targetLabel}»: ${max} до продолжительного отдыха`,
      evidence,
      automatic: false
    });
  }

  const perOption = matchFirst(normalized, [
    /(?:исполнить|использовать)\s+кажд[а-яa-z]*\s+([^,.;:\n]{1,48}?)\s+(один|два|три|\d+)\s+раз(?:а)?\s+до\s+следующ[а-яa-z]*\s+продолжительн[а-яa-z]*\s+отдых[а-яa-z]*/i,
    /(?:perform|use)\s+each\s+([^,.;:\n]{1,48}?)\s+(one|two|three|\d+)\s+times?\s+(?:before|until)\s+(?:your\s+)?next\s+long\s+rest/i
  ]);
  if (perOption && !perOptionOverride) {
    const evidence = evidenceFor(text, perOption);
    const targetLabel = normalizeRussianAccusativePhrase(originalCapture(text, perOption, 1).trim());
    const max = countAmount(perOption.match[2]);
    const options = extractFollowingOptionLabels(text, evidence.end);
    effects.push({
      id: effectId('usageLimit:perOption:longRest', evidence),
      kind: 'usageLimit',
      max,
      reset: 'longRest',
      scope: 'perOption',
      targetLabel,
      ...(options.length > 0 ? { options } : {}),
      summary: `Каждая опция «${targetLabel}»: ${max} до продолжительного отдыха`,
      evidence,
      automatic: false
    });
  }

  const targetLimit = matchFirst(normalized, [
    /использовать\s+[“"«]([^”"»]+)[”"»]\s+(один|два|три|\d+)\s+раз(?:а)?(?:,\s*вместо\s+одн[а-яa-z]*)?,?\s+(?:до\s+следующ[а-яa-z]*\s+продолжительн[а-яa-z]*\s+отдых[а-яa-z]*|за\s+сесси[а-яa-z]*)/i,
    /use\s+[“"']([^”"']+)[”"']\s+(one|two|three|\d+)\s+times?(?:,?\s+instead\s+of\s+once)?\s+(?:before|until)\s+(?:your\s+)?next\s+long\s+rest/i
  ]);
  if (targetLimit) {
    const evidence = evidenceFor(text, targetLimit);
    const targetLabel = originalCapture(text, targetLimit, 1).trim();
    const max = countAmount(targetLimit.match[2]);
    const reset: FeatureUsageReset = /сесси|session/i.test(targetLimit.match[0]) ? 'session' : 'longRest';
    effects.push({
      id: effectId(`usageLimit:targetFeature:${reset}`, evidence),
      kind: 'usageLimit',
      max,
      reset,
      scope: 'targetFeature',
      targetLabel,
      summary: `«${targetLabel}»: ${max} ${usageResetLabel(reset)}`,
      evidence,
      automatic: false
    });
  }

  const additionalUse = matchFirst(normalized, [
    /(?:можете\s+)?(?:инициировать|использовать)\s+([^.!?\n]{1,80}?)\s+(один|два|три|\d+)\s+дополнительн[а-яa-z]*\s+раз(?:а)?\s+за\s+сесси[а-яa-z]*/i,
    /(?:may\s+)?(?:initiate|use)\s+([^.!?\n]{1,80}?)\s+(one|two|three|\d+)\s+additional\s+times?\s+per\s+session/i
  ]);
  if (additionalUse) {
    const evidence = evidenceFor(text, additionalUse);
    const targetLabel = originalCapture(text, additionalUse, 1).trim();
    const count = countAmount(additionalUse.match[2]);
    effects.push({
      id: effectId('usageAllowance:session', evidence),
      kind: 'usageAllowance',
      count,
      reset: 'session',
      targetLabel,
      summary: `«${targetLabel}»: ещё ${count} раз за сессию`,
      evidence,
      automatic: false
    });
  }
}

function collectTrackSlotEffect(
  effects: FeatureRuleEffect[],
  text: string,
  normalized: string,
  target: Extract<FeatureStatTarget, 'hpMax' | 'stressMax'>,
  patterns: RegExp[],
  label: string
): void {
  const result = matchFirst(normalized, patterns);
  if (!result || isConditionalAutomaticRule(normalized, result)) return;
  const amount = countAmount(result.match[1]);
  effects.push(statEffect(target, amount, `${label}: +${amount}`, evidenceFor(text, result)));
}

function collectFixedStatEffect(
  effects: FeatureRuleEffect[],
  text: string,
  normalized: string,
  target: FeatureStatTarget,
  patterns: RegExp[],
  label: string
): void {
  const result = matchFirst(normalized, patterns);
  if (!result || isConditionalAutomaticRule(normalized, result)) return;
  const amount = signedAmount(result.match[1]);
  if (amount === 0) return;
  effects.push(statEffect(target, amount, `${label}: ${signedLabel(amount)}`, evidenceFor(text, result)));
}

function collectUsageLimit(
  effects: FeatureRuleEffect[],
  text: string,
  normalized: string,
  reset: FeatureUsageReset,
  patterns: RegExp[]
): void {
  const result = matchFirst(normalized, patterns);
  if (!result) return;
  if (isIllustrativeRuleMention(normalized, result.match.index)) return;
  const evidence = evidenceFor(text, result);
  if (effects.some((effect) => isUsageEffect(effect) && rangesOverlap(effect.evidence, evidence))) return;
  const max = countAmount(result.match[1]);
  effects.push({
    id: effectId(`usageLimit:${reset}`, evidence),
    kind: 'usageLimit',
    max,
    reset,
    scope: 'feature',
    summary: reset === 'scene' && /перв[а-яa-z]*\s+раз|first\s+time/i.test(result.match[0])
      ? 'Срабатывает один раз за сцену'
      : `Использований: ${max} ${usageResetLabel(reset)}`,
    evidence,
    automatic: false
  });
}

function isUsageEffect(effect: FeatureRuleEffect): effect is FeatureUsageLimitEffect | FeatureUsageAllowanceEffect {
  return effect.kind === 'usageLimit' || effect.kind === 'usageAllowance';
}

function rangesOverlap(left: FeatureRuleEvidence, right: FeatureRuleEvidence): boolean {
  return left.start < right.end && right.start < left.end;
}

function usageResetLabel(reset: FeatureUsageReset): string {
  const labels: Record<FeatureUsageReset, string> = {
    rest: 'до следующего отдыха',
    longRest: 'до продолжительного отдыха',
    session: 'за сессию',
    scene: 'за сцену'
  };
  return labels[reset];
}

function extractFollowingOptionLabels(text: string, start: number): string[] {
  const tail = text.slice(start);
  const labels: string[] = [];
  const pattern = /(?:^|\n)\s*[-•]\s*([^:\n]{1,80}):/g;
  for (let match = pattern.exec(tail); match && labels.length < 12; match = pattern.exec(tail)) {
    labels.push(match[1].replace(/[“”«»"'*_]/g, '').trim());
  }
  return labels;
}

function normalizeRussianAccusativePhrase(value: string): string {
  return value.split(/\s+/).map((word) => {
    if (!/[А-ЯЁа-яё]/.test(word)) return word;
    if (word.endsWith('ую')) return `${word.slice(0, -2)}ая`;
    if (word.endsWith('юю')) return `${word.slice(0, -2)}яя`;
    if (word.endsWith('ю')) return `${word.slice(0, -1)}я`;
    if (word.endsWith('у')) return `${word.slice(0, -1)}а`;
    return word;
  }).join(' ');
}

function normalizeResourceName(value: string): string {
  if (!/[А-ЯЁа-яё]/.test(value)) return value;
  if (value.endsWith('ости')) return `${value.slice(0, -1)}ь`;
  if (value.endsWith('ии')) return `${value.slice(0, -2)}ия`;
  if (value.endsWith('ы')) return `${value.slice(0, -1)}а`;
  return value;
}

function isIllustrativeRuleMention(text: string, matchIndex: number): boolean {
  const prefix = text.slice(Math.max(0, matchIndex - 160), matchIndex);
  const clauseStart = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('\n'), prefix.lastIndexOf(';'));
  return prefix.slice(clauseStart + 1).includes('например');
}

/**
 * Structural effects become permanent character rules, so a phrase embedded
 * in a temporary or triggered clause must stay inert. Creation-time wording is
 * intentionally allowed: it describes when a permanent character property is
 * established rather than a condition under which it is active.
 */
function isConditionalAutomaticRule(text: string, result: RuleMatch): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf('.', result.match.index - 1),
    text.lastIndexOf('!', result.match.index - 1),
    text.lastIndexOf('?', result.match.index - 1),
    text.lastIndexOf('\n', result.match.index - 1),
    text.lastIndexOf(';', result.match.index - 1)
  ) + 1;
  const matchEnd = result.match.index + result.match[0].length;
  const followingBoundaries = [
    text.indexOf('.', matchEnd),
    text.indexOf('!', matchEnd),
    text.indexOf('?', matchEnd),
    text.indexOf('\n', matchEnd),
    text.indexOf(';', matchEnd)
  ].filter((index) => index >= 0);
  const sentenceEnd = followingBoundaries.length > 0 ? Math.min(...followingBoundaries) : text.length;
  const sentence = text
    .slice(sentenceStart, sentenceEnd)
    .replace(/при\s+создании\s+(?:вашего\s+)?персонаж[а-яa-z]*/gi, '');

  return /(?:^|[\s,(])(?:если|когда|пока|после|прежде\s+чем|до\s+тех\s+пор|до\s+конц[а-яa-z]*|до\s+следующ[а-яa-z]*|находясь|во\s+время|при(?=\s)|в\s+(?:начал[а-яa-z]*|конц[а-яa-z]*|течени[а-яa-z]*)|на\s+(?:время|следующ[а-яa-z]*)|кажд[а-яa-z]*\s+раз|всяк[а-яa-z]*\s+раз|if|when|whenever|while|after|before|during|until|at\s+the\s+(?:start|end)|for\s+the\s+next|as\s+long\s+as)(?:[\s,)]+|$)/i.test(sentence);
}

function statEffect(
  target: FeatureStatTarget,
  amount: number,
  summary: string,
  evidence: FeatureRuleEvidence,
  amountSource?: 'proficiency'
): FeatureStatDeltaEffect {
  return {
    id: effectId(`statDelta:${target}`, evidence),
    kind: 'statDelta',
    target,
    amount,
    ...(amountSource ? { amountSource } : {}),
    summary,
    evidence,
    automatic: true
  };
}

interface RuleMatch {
  match: RegExpExecArray;
}

function matchFirst(text: string, patterns: RegExp[]): RuleMatch | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) return { match };
  }
  return null;
}

function evidenceFor(text: string, result: RuleMatch): FeatureRuleEvidence {
  const start = result.match.index;
  const end = start + result.match[0].length;
  return { text: text.slice(start, end), start, end };
}

function originalCapture(text: string, result: RuleMatch, index: number): string {
  const capture = result.match[index] ?? '';
  const offset = result.match[0].indexOf(capture);
  if (offset < 0) return capture;
  const start = result.match.index + offset;
  return text.slice(start, start + capture.length);
}

function normalizeRuleText(value: string): string {
  return value
    .replace(/−/g, '-')
    .replace(/ё/g, 'е')
    .replace(/[\u00a0\t]+/g, ' ')
    .toLowerCase();
}

function countAmount(value: string | undefined): number {
  if (!value) return 1;
  const normalized = value.toLowerCase();
  const words: Record<string, number> = {
    одну: 1,
    один: 1,
    a: 1,
    an: 1,
    one: 1,
    две: 2,
    два: 2,
    two: 2,
    три: 3,
    three: 3
  };
  return words[normalized] ?? Math.max(1, Number.parseInt(normalized, 10) || 1);
}

function stemmedCountAmount(value: string | undefined): string | undefined {
  if (!value) return value;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('одн')) return 'один';
  if (normalized.startsWith('дв')) return 'два';
  if (normalized.startsWith('тр')) return 'три';
  return value;
}

function signedAmount(value: string | undefined): number {
  return Number((value ?? '').replace(/\s+/g, '')) || 0;
}

function signedLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function effectId(kind: string, evidence: FeatureRuleEvidence): string {
  return `${kind}:${evidence.start}:${evidence.end}`;
}

function dedupeEffects(effects: FeatureRuleEffect[]): FeatureRuleEffect[] {
  const seen = new Set<string>();
  return effects.filter((effect) => {
    const discriminator = effectDiscriminator(effect);
    const key = `${effect.kind}:${discriminator}:${effect.evidence.start}:${effect.evidence.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function effectDiscriminator(effect: FeatureRuleEffect): string {
  switch (effect.kind) {
    case 'statDelta': return `${effect.target}:${effect.amountSource ?? effect.amount}`;
    case 'usageLimit': return `${effect.reset}:${effect.max}:${effect.scope}:${effect.targetLabel ?? ''}:${effect.options?.join('|') ?? ''}`;
    case 'usageAllowance': return `${effect.reset}:${effect.count}:${effect.targetLabel}`;
    case 'domainCardGrant': return String(effect.count);
    case 'inventoryGrant': return `${effect.name}:${effect.count}`;
    case 'creationChoice': return `${effect.choice}:${effect.count ?? ''}:${effect.bonus ?? ''}:${effect.perRankCount ?? ''}:${effect.perRankBonus ?? ''}`;
    case 'resourceInit': return `${effect.resource}:${effect.value}`;
    case 'advancementGrant': return `${effect.target}:${effect.count}`;
    case 'companionGrant': return 'companion';
    case 'restChoiceCount': return `${effect.rest}:${effect.count}`;
    case 'restMoveSwap': return `${effect.from}:${effect.to}:${effect.max}`;
    case 'restReroll': return `${effect.rest}:${effect.max}:${effect.scope}`;
    case 'restMoveGrant': return `${effect.rest}:${effect.scope}:${effect.label}`;
  }
}
