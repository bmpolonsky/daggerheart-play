import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanMarkdownText } from "../../src/core/utils/markdownText";
import { parseDomainCardCost, parseDomainCardTextMacros, planDomainCardResourceMacro, resolveDomainCardDiceFormula, resolveDomainCardTokenMax } from "../../src/domain/rules/domainCards";
import { buildCharacterSummary } from "../../src/domain/tabletop/playerView";
import { resetAllStores, feedStore } from "../../src/stores/gameStores";
import { characterService, diceService } from "../../src/services/serviceRegistry";
import { runDomainCardMacroAction } from "../../src/ui/vtt/playerView/domainCards/domainCardMacroActions";
import { firstCharacter } from "./helpers";

test('domain card cost parsing stays raw and does not imply a generic activation', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.addDomainCard(character.id, {
    id: 'card-inspiring-words',
    name: 'Вдохновляющие слова',
    cost: 'Стресс 1',
    text: 'Поддержите союзника.',
    inLoadout: true
  });
  characterService.addDomainCard(character.id, {
    id: 'card-expensive',
    name: 'Слишком дорого',
    cost: 'Надежда 99',
    text: '',
    inLoadout: true
  });

  const updated = characterService.getCharacter(character.id);
  if (!updated) {
    assert.fail('Expected character to exist after adding domain cards');
  }
  assert.deepEqual(parseDomainCardCost('Spend 2 Hope / Стресс 1 / жетон 3'), { hope: 2, stress: 1, tokens: 3 });
  assert.equal(updated.domainCards.find((card) => card.id === 'card-inspiring-words')?.text, 'Поддержите союзника.');
  assert.equal(characterService.getCharacter(character.id)?.stress.marked, 0);
  assert.equal(characterService.getCharacter(character.id)?.hope.value, updated.hope.value);
});

test('domain card text macros expose concrete inline actions without a generic card roll', () => {
  const text = 'Потратьте Надежду. Совершите Бросок Заклинания (12), затем нанесите d10+2 магического урона. Очистить Стресс. Потратить жетон с этой карты.';
  const macros = parseDomainCardTextMacros(text);

  assert.deepEqual(macros.map((macro) => macro.kind), ['spendHope', 'actionRoll', 'diceRoll', 'clearStress', 'spendToken']);
  assert.equal(macros[1].kind, 'actionRoll');
  if (macros[1].kind === 'actionRoll') {
    assert.equal(macros[1].difficulty, 12);
    assert.equal(macros[1].traitHint, 'spellcast');
  }
  assert.equal(macros[2].kind, 'diceRoll');
  if (macros[2].kind === 'diceRoll') {
    assert.equal(macros[2].formula, 'd10+2');
  }
});

test('rules text macros recognize adversary-style dice formulas and trait checks', () => {
  const text = 'При успехе цель получает 1d8 урона от магии и Воспламеняется, пока не будет потушена успешным Броском Искусности (14). Пока цель Воспламенена, она получает 1d4 урона от магии при совершении Броска Действия.';
  const macros = parseDomainCardTextMacros(text);

  assert.deepEqual(macros.map((macro) => macro.kind), ['diceRoll', 'actionRoll', 'diceRoll']);
  assert.equal(macros[0].kind, 'diceRoll');
  if (macros[0].kind === 'diceRoll') {
    assert.equal(macros[0].formula, '1d8');
  }
  assert.equal(macros[1].kind, 'actionRoll');
  if (macros[1].kind === 'actionRoll') {
    assert.equal(macros[1].difficulty, 14);
  }
  assert.equal(macros[2].kind, 'diceRoll');
  if (macros[2].kind === 'diceRoll') {
    assert.equal(macros[2].formula, '1d4');
  }
});

test('rules text macros find dice formulas across markdown styles', () => {
  const text = cleanMarkdownText([
    'Киньте **d6**.',
    'Цель получает *1d8* урона.',
    'Добавьте [2d12 + 3](/rule/damage).',
    'Мастер бросает `d20` вручную.'
  ].join(' '), { stripEmphasis: true, stripCodeTicks: true });
  const macros = parseDomainCardTextMacros(text);

  assert.deepEqual(macros.map((macro) => macro.kind), ['diceRoll', 'diceRoll', 'diceRoll', 'diceRoll']);
  assert.deepEqual(macros.flatMap((macro) => macro.kind === 'diceRoll' ? [macro.formula] : []), ['d6', '1d8', '2d12+3', 'd20']);
  assert.deepEqual(macros.flatMap((macro) => macro.kind === 'diceRoll' ? [macro.scalesWithProficiency] : []), [true, false, false, false]);
});

test('rules text dice macros distinguish proficiency damage dice from explicit dice counts', () => {
  const macros = parseDomainCardTextMacros('Бросьте d4. Затем бросьте 1d4. Нанесите d8+3 или 2d12 + 1d8.');

  assert.deepEqual(macros.flatMap((macro) => macro.kind === 'diceRoll' ? [macro.formula] : []), ['d4', '1d4', 'd8+3', '2d12+1d8']);
  const diceMacros = macros.filter((macro) => macro.kind === 'diceRoll');
  assert.deepEqual(diceMacros.map((macro) => macro.scalesWithProficiency), [true, false, true, false]);
  assert.deepEqual(diceMacros.map((macro) => resolveDomainCardDiceFormula(macro, 3)), ['3d4', '1d4', '3d8+3', '2d12+1d8']);
});

test('rules text macros cover common resource phrases in Russian and English', () => {
  const text = [
    '**Потратьте 2 Страха**, чтобы разделиться.',
    'Потратьте 2 Страха на активацию.',
    'Spend a Fear to interrupt.',
    'Потратьте Надежду.',
    'Тратит Надежду.',
    'Spend 2 Hope.',
    'Получите Надежду.',
    'Цель получает Надежду.',
    'Gain one Hope.',
    'Отметьте 2 Стресса.',
    'Цель отмечает дополнительный Стресс.',
    'Mark a Stress.',
    'Очистите Стресс.',
    'Снимите Стресс.',
    'Clear 2 Stress.',
    'Отметьте Рану.',
    'Цель должна отметить дополнительную Рану.',
    'Mark 2 HP.',
    'Очистите 2 Раны.',
    'Снимите Рану.',
    'Clear a hit point.',
    'Потратьте жетон с этой карты.',
    'Потратьте 2 жетона.',
    'Spend one token.'
  ].join(' ');
  const macros = parseDomainCardTextMacros(cleanMarkdownText(text, { stripEmphasis: true }));

  assert.deepEqual(macros.map((macro) => macro.kind), [
    'spendFear',
    'spendFear',
    'spendFear',
    'spendHope',
    'spendHope',
    'spendHope',
    'gainHope',
    'gainHope',
    'gainHope',
    'markStress',
    'markStress',
    'markStress',
    'clearStress',
    'clearStress',
    'clearStress',
    'markHp',
    'markHp',
    'markHp',
    'clearHp',
    'clearHp',
    'clearHp',
    'spendToken',
    'spendToken',
    'spendToken'
  ]);
  assert.deepEqual(macros.flatMap((macro) => 'amount' in macro ? [macro.amount] : []), [2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 2, 1]);
});

test('rules text macros cover trait and spellcast checks with difficulty', () => {
  const text = [
    'Совершите Бросок Заклинания (12).',
    'Потушена успешным Броском Искусности (14).',
    'Цель должна совершить Бросок Реакции на Проворность (15).',
    'Make a roll (16).',
    'Reaction Roll on Agility (17).',
    'Finesse Roll (13).',
    'Spellcast Roll (15).'
  ].join(' ');
  const macros = parseDomainCardTextMacros(text);

  assert.deepEqual(macros.map((macro) => macro.kind), ['actionRoll', 'actionRoll', 'actionRoll', 'actionRoll', 'actionRoll', 'actionRoll', 'actionRoll']);
  assert.deepEqual(macros.flatMap((macro) => macro.kind === 'actionRoll' ? [macro.difficulty] : []), [12, 14, 15, 16, 17, 13, 15]);
});

test('domain card text macros keep resource actions simple and source-owned', () => {
  const text = 'Когда вы разговариваете с союзником, вы можете потратить жетон с этой карты, чтобы дать ему одно из следующих преимуществ: - Очистить Стресс. - Очистить Рану. - Получить Надежду.';
  const macros = parseDomainCardTextMacros(text);

  assert.deepEqual(macros.map((macro) => macro.kind), ['spendToken', 'clearStress', 'clearHp', 'gainHope']);
  const spendPlan = planDomainCardResourceMacro({ id: 'token-card', name: 'Token Card', text }, macros[0], 'player');
  const clearPlan = planDomainCardResourceMacro({ id: 'token-card', name: 'Token Card', text }, macros[1], 'player');
  assert.equal(spendPlan?.target, 'source');
  assert.equal(clearPlan?.target, 'source');
});

test('domain card resource macros apply obvious source costs and log them', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 3);
  characterService.addDomainCard(character.id, {
    id: 'confirm-card',
    name: 'Confirm Card',
    text: 'Spend 2 Hope to do something.',
    inLoadout: true
  });
  const summary = buildCharacterSummary(characterService.getCharacter(character.id)!);
  const card = summary.loadoutCards.find((item) => item.id === 'confirm-card')!;
  const macro = card.macros.find((item) => item.kind === 'spendHope')!;

  const plan = planDomainCardResourceMacro(card, macro, 'player');
  assert.equal(plan?.target, 'source');
  assert.equal(plan?.canApply, true);
  assert.match(plan?.confirmationText ?? '', /Confirm Card/);

  runDomainCardMacroAction(card, macro, {
    character: summary,
    role: 'player',
    openRollDraft: () => undefined
  });
  assert.equal(characterService.getCharacter(character.id)?.hope.value, 1);
  assert.equal(feedStore.getSnapshot()[0]?.body, 'Confirm Card · -2 Надежды');
});

test('domain card resource actions use cleaned markdown text for GM feed previews', () => {
  resetAllStores();
  const character = firstCharacter();
  const rawText = 'Один раз до следующего отдыха при успехе, вы можете **отметить** [**Стресс**](/rule/stress), чтобы заставить цель также отметить Стресс.';
  characterService.addDomainCard(character.id, {
    id: 'markdown-card',
    name: 'Markdown Card',
    text: rawText,
    inLoadout: true
  });
  const summary = buildCharacterSummary(characterService.getCharacter(character.id)!);
  const cleanText = cleanMarkdownText(rawText, { stripEmphasis: true, stripCodeTicks: true });
  const macro = parseDomainCardTextMacros(cleanText).find((item) => item.kind === 'markStress')!;
  const card = summary.loadoutCards.find((item) => item.id === 'markdown-card')!;

  runDomainCardMacroAction(card, macro, {
    character: summary,
    role: 'gm',
    openRollDraft: () => undefined
  });

  assert.equal(characterService.getCharacter(character.id)?.stress.marked, 1);
  assert.equal(feedStore.getSnapshot()[0]?.body, 'Markdown Card · +1 Стресс');
});

test('domain card dice macros scale implicit damage dice by character proficiency when rolled from a card', () => {
  resetAllStores();
  const character = firstCharacter();
  character.proficiency = 3;
  characterService.addDomainCard(character.id, {
    id: 'dice-card',
    name: 'Dice Card',
    text: 'Нанесите d4 урона, затем 1d4 урона.',
    inLoadout: true
  });
  const summary = buildCharacterSummary(characterService.getCharacter(character.id)!);
  const card = summary.loadoutCards.find((item) => item.id === 'dice-card')!;
  const macro = card.macros.find((item) => item.kind === 'diceRoll' && item.formula === 'd4')!;

  runDomainCardMacroAction(card, macro, {
    character: summary,
    role: 'player',
    openRollDraft: () => undefined
  });

  const roll = diceService.rollLogStore.getSnapshot()[0];
  assert.equal(roll.type, 'manual');
  assert.equal('formula' in roll ? roll.formula : null, '3d4');
});

test('domain card resource macros apply to the acting character without target inference', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 3);
  characterService.addDomainCard(character.id, {
    id: 'target-card',
    name: 'Target Card',
    text: 'Когда союзник может потратить Надежду, он получает преимущество.',
    inLoadout: true
  });
  const summary = buildCharacterSummary(characterService.getCharacter(character.id)!);
  const card = summary.loadoutCards.find((item) => item.id === 'target-card')!;
  const macro = card.macros.find((item) => item.kind === 'spendHope')!;

  const plan = planDomainCardResourceMacro(card, macro, 'player');
  assert.equal(plan?.target, 'source');
  assert.equal(plan?.canApply, true);

  runDomainCardMacroAction(card, macro, {
    character: summary,
    role: 'player',
    openRollDraft: () => undefined
  });
  assert.equal(characterService.getCharacter(character.id)?.hope.value, 2);
});

test('domain card token slots use trait-derived counts or six for token cards with unclear limits', () => {
  assert.equal(resolveDomainCardTokenMax({
    id: 'presence-tokens',
    name: 'Presence Tokens',
    domain: 'Grace',
    level: 1,
    text: 'После отдыха поместите на эту карту количество жетонов, равное вашему Влиянию.',
    inLoadout: true,
    tokens: { value: 0, max: 0 }
  }, { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 3, knowledge: 0 }), 3);
  assert.equal(resolveDomainCardTokenMax({
    id: 'zero-presence-tokens',
    name: 'Zero Presence Tokens',
    domain: 'Grace',
    level: 1,
    text: 'После отдыха поместите на эту карту количество жетонов, равное вашему Влиянию.',
    inLoadout: true,
    tokens: { value: 0, max: 0 }
  }, { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 }), 6);
  assert.equal(resolveDomainCardTokenMax({
    id: 'unclear-tokens',
    name: 'Unclear Tokens',
    domain: 'Grace',
    level: 1,
    text: 'Потратьте жетон с этой карты.',
    inLoadout: true,
    tokens: { value: 0, max: 0 }
  }, { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 }), 6);
  assert.equal(resolveDomainCardTokenMax({
    id: 'no-tokens',
    name: 'No Tokens',
    domain: 'Grace',
    level: 1,
    text: 'Потратьте Надежду.',
    inLoadout: true,
    tokens: { value: 0, max: 6 }
  }, { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 }), 0);
});

test('player view hides stale domain card token values when card text has no token mechanic', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.addDomainCard(character.id, {
    id: 'stale-token-card',
    name: 'Stale Token Card',
    text: 'Потратьте Надежду, чтобы получить преимущество.',
    tokens: { value: 2, max: 6 },
    inLoadout: true
  });

  const summary = buildCharacterSummary(characterService.getCharacter(character.id)!);
  const card = summary.loadoutCards.find((item) => item.id === 'stale-token-card');

  assert.equal(card?.tokens.value, 0);
  assert.equal(card?.tokens.max, 0);
});
