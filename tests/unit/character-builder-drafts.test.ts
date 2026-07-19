import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores } from "../../src/stores/gameStores";
import { characterService } from "../../src/services/serviceRegistry";
import {
  backgroundQuestionsFor,
  buildCharacterDraft,
  buildCharacterBuilderChoicePreview,
  connectionQuestionsFor,
  featureListText,
  filterBuilderContent,
  firstFeatureText,
  replaceBackgroundAnswerAt,
  replaceConnectionAnswerAt
} from "../../src/domain/characterBuilder/index";
import type { ContentState } from "../../src/domain/content/types";
import { classFixture, classItem, equipmentFixture, equipmentItem, firstCharacter, genericItem } from "./helpers";

test('character builder applies starting equipment to draft outside UI', () => {
  const content: ContentState['generic'] = {
    ancestries: [],
    communities: [],
    subclasses: [],
    domainCards: []
  };

  const result = buildCharacterDraft({
    content,
    equipment: equipmentFixture(),
    className: 'Warrior',
    armorId: 'full-plate-armor',
    primaryWeaponId: 'broadsword',
    secondaryWeaponId: 'tower-shield',
    classItem: 'Точильный камень',
    consumableId: 'minor-stamina-potion'
  });

  assert.equal(result.draft.armor?.name, 'Латный Доспех');
  assert.equal(result.draft.armor?.score, 4);
  assert.deepEqual(result.draft.thresholds, { major: 9, severe: 18 });
  assert.equal(result.draft.evasion, 11);
  assert.equal(result.draft.traits?.agility, 2);
  assert.deepEqual(result.draft.weapons?.map((weapon) => weapon.name), ['Палаш', 'Башенный Щит']);
  assert.equal(result.draft.inventory?.some((item) => item.name === 'Точильный камень'), true);
  assert.equal(result.draft.inventory?.some((item) => item.name === 'Малое Зелье Выносливости' && item.uses?.max === 1), true);
  assert.equal(result.selections.secondaryWeapon?.slug, 'tower-shield');
  assert.equal(result.warnings.some((warning) => warning.includes('модификаторы')), true);
});

test('character builder uses API class data for stats, domains, and mementos', () => {
  const subclass = genericItem({
    id: 'sub-warrior',
    name: 'Call of the Brave',
    raw: {
      class_slug: 'warrior',
      foundation_features: [{ id: 100, name: 'Foundation Feature', main_body: '**Strike** with courage.' }]
    }
  });
  const content: ContentState['generic'] = {
    ancestries: [],
    communities: [],
    subclasses: [subclass],
    domainCards: []
  };

  const result = buildCharacterDraft({
    content,
    classes: classFixture(),
    equipment: equipmentFixture(),
    className: 'Warrior',
    subclassId: 'sub-warrior',
    primaryWeaponId: 'longbow',
    classItem: 'Монета из API',
    appearance: 'Шрам через левую бровь.',
    backstory: 'Ищет пропавший отряд.',
    backgroundAnswers: ['Наставник из API', 'Давний долг', 'Нельзя бросать союзников'],
    connectionAnswers: [{ targetName: 'Ари', answer: 'Однажды спасли друг друга.' }]
  });

  assert.deepEqual(result.draft.domains, ['Blade', 'Bone']);
  assert.equal(result.draft.evasion, 13);
  assert.equal(result.draft.hp?.max, 8);
  assert.equal(result.draft.inventory?.some((item) => item.name === 'Монета из API'), true);
  assert.equal(result.draft.description?.backstory, 'Ищет пропавший отряд.');
  assert.equal(result.draft.backgroundAnswers?.[0]?.prompt, 'Кто обучил вас сражаться?');
  assert.equal(result.draft.backgroundAnswers?.[0]?.answer, 'Наставник из API');
  assert.equal(result.draft.connections?.[0]?.targetName, 'Ари');
  assert.equal(result.draft.sheetCards?.some((card) => card.kind === 'classFeature' && card.name === 'Class Feature'), true);
  assert.equal(result.draft.sheetCards?.some((card) => card.kind === 'subclassFeature' && card.name === 'Foundation Feature'), true);
  assert.equal(result.draft.sheetCards?.find((card) => card.kind === 'subclassFeature' && card.name === 'Foundation Feature')?.subclassTier, 'foundation');
});

test('character builder models spellcast trait and warns on magic weapons without one', () => {
  const spellClass = classItem({ slug: 'wizard', spellcast_trait: 'knowledge', domain_slugs: ['codex', 'splendor'] });
  const draft = buildCharacterDraft({
    content: { ancestries: [], communities: [], subclasses: [], domainCards: [] },
    classes: [spellClass],
    equipment: equipmentFixture(),
    className: 'Wizard',
    primaryWeaponId: 'broadsword'
  });
  assert.equal(draft.draft.spellcastTrait, 'knowledge');

  const spellSubclass = genericItem({
    id: 'school-of-knowledge',
    raw: { class_slug: 'wizard', spellcast_trait: 'knowledge' }
  });
  const subclassDraft = buildCharacterDraft({
    content: { ancestries: [], communities: [], subclasses: [spellSubclass], domainCards: [] },
    classes: [classItem({ slug: 'wizard', domain_slugs: ['codex', 'splendor'] })],
    equipment: equipmentFixture(),
    className: 'Wizard',
    subclassId: spellSubclass.id,
    primaryWeaponId: 'broadsword'
  });
  assert.equal(subclassDraft.draft.spellcastTrait, 'knowledge');

  const noSpell = buildCharacterDraft({
    content: { ancestries: [], communities: [], subclasses: [], domainCards: [] },
    classes: [],
    equipment: [equipmentItem({ slug: 'wand', name: 'Wand', type_slug: 'primary-weapon', char_trait: 'knowledge', damage_ty: 'magic', die_num: 1, die_size: 8, burden: 1, tier: 1 })],
    className: 'Warrior',
    primaryWeaponId: 'wand'
  });
  assert.equal(noSpell.warnings.some((warning) => warning.includes('магическое оружие')), true);
});

test('character builder flags text-derived mechanics without applying them silently', () => {
  const ancestry = genericItem({
    id: 'mechanical-ancestry',
    name: 'Careful Lineage',
    raw: {
      features: [{
        id: 1,
        name: 'Guarded',
        main_body: '+2 к Уклонению и +1 к Стрессу.'
      }]
    }
  });
  const result = buildCharacterDraft({
    content: { ancestries: [ancestry], communities: [], subclasses: [], domainCards: [] },
    classes: classFixture(),
    ancestryId: ancestry.id,
    className: 'Warrior'
  });

  assert.equal(result.draft.evasion, 13);
  assert.equal(result.draft.stress, undefined);
  assert.equal(result.warnings.some((warning) => warning.includes('механический эффект')), true);
});

test('character builder extracts and bounds class question answers in domain logic', () => {
  const apiClass = classItem({
    slug: 'warrior',
    background_questions: [],
    connection_questions: []
  });
  apiClass.raw.background_questions = [
    { prompt: '**Кто** обучил вас?' },
    '2. Почему вы ушли?',
    { question: '[Кому](https://example.test) вы должны?' },
    { prompt: 'Кто обучил вас?' }
  ] as unknown as string[];
  apiClass.raw.connection_questions = [
    { text: 'Почему ты доверяешь мне?' },
    'Что я знаю о тебе?'
  ] as unknown as string[];

  const backgroundQuestions = backgroundQuestionsFor(apiClass);
  const connectionQuestions = connectionQuestionsFor(apiClass);

  assert.deepEqual(backgroundQuestions, ['Кто обучил вас?', 'Почему вы ушли?', 'Кому вы должны?']);
  assert.deepEqual(connectionQuestions, ['Почему ты доверяешь мне?', 'Что я знаю о тебе?']);
  assert.deepEqual(replaceBackgroundAnswerAt([' old ', 'kept', 'extra'], 0, '  Новый ответ  ', backgroundQuestions), ['Новый ответ', 'kept', 'extra']);
  assert.deepEqual(replaceBackgroundAnswerAt(['one'], 99, 'ignored', backgroundQuestions), ['one', '', '']);
  assert.deepEqual(replaceConnectionAnswerAt([{ targetName: ' Ари ' }], 0, { answer: '  Вместе выжили  ' }, connectionQuestions), [
    { answer: 'Вместе выжили', targetName: 'Ари' },
    { answer: '', targetName: '' }
  ]);

  const result = buildCharacterDraft({
    content: { ancestries: [], communities: [], subclasses: [], domainCards: [] },
    classes: [apiClass],
    className: 'Warrior',
    backgroundAnswers: ['  A  ', ' B ', ' C ', 'D'],
    connectionAnswers: [{ targetName: ' Тесс ', answer: '  Помогла мне. ' }, { answer: ' знает тайну ' }, { answer: 'ignored' }]
  });

  assert.deepEqual(result.draft.backgroundAnswers?.map((item) => item.answer), ['A', 'B', 'C']);
  assert.deepEqual(result.draft.connections?.map((item) => item.answer), ['Помогла мне.', 'знает тайну']);
  assert.equal(result.draft.connections?.[0]?.targetName, 'Тесс');
});

test('character builder omits secondary weapon for two-handed starts', () => {
  const content: ContentState['generic'] = {
    ancestries: [],
    communities: [],
    subclasses: [],
    domainCards: []
  };

  const result = buildCharacterDraft({
    content,
    equipment: equipmentFixture(),
    className: 'Ranger',
    primaryWeaponId: 'longbow',
    secondaryWeaponId: 'round-shield'
  });

  assert.deepEqual(result.draft.weapons?.map((weapon) => weapon.name), ['Длинный лук']);
  assert.equal(result.draft.traits?.finesse, 1);
  assert.equal(result.selections.secondaryWeapon, null);
  assert.equal(result.warnings.some((warning) => warning.includes('занимает обе руки')), true);
});

test('character service applies API equipment through domain attachment plan', () => {
  resetAllStores();
  const character = firstCharacter();
  const equipment = equipmentFixture();

  const armorResult = characterService.addEquipmentItem(character.id, equipment.find((item) => item.slug === 'full-plate-armor')!);
  const weaponResult = characterService.addEquipmentItem(character.id, equipment.find((item) => item.slug === 'broadsword')!);
  const itemResult = characterService.addEquipmentItem(character.id, equipment.find((item) => item.slug === 'minor-health-potion')!);
  const updated = characterService.getCharacter(character.id);

  assert.equal(armorResult?.kind, 'armor');
  assert.equal(armorResult?.warnings.length, 1);
  assert.equal(weaponResult?.kind, 'weapon');
  assert.equal(itemResult?.kind, 'inventory');
  assert.equal(updated?.armor.name, 'Латный Доспех');
  assert.equal(updated?.thresholds.major, 9);
  assert.equal(updated?.weapons.at(-1)?.name, 'Палаш');
  assert.equal(updated?.weapons.at(-1)?.id.startsWith('weapon_'), true);
  assert.notEqual(updated?.weapons.at(-1)?.id, 'weapon-broadsword');
  assert.equal(updated?.inventory.some((item) => item.name === 'Малое Зелье Лечения' && item.kind === 'consumable' && item.uses?.max === 1), true);
  assert.equal(updated?.sheetCards.some((card) => card.kind === 'item' && card.name === 'Малое Зелье Лечения'), true);
});

test('character inventory uses are explicit and do not apply healing automatically', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.markSlots(character.id, 'hp', 2);
  const equipment = equipmentFixture();

  characterService.addEquipmentItem(character.id, equipment.find((item) => item.slug === 'minor-health-potion')!);
  const added = characterService.getCharacter(character.id)?.inventory.find((item) => item.name === 'Малое Зелье Лечения');
  assert.equal(added?.uses?.current, 1);

  characterService.useInventoryItem(character.id, added!.id);
  const updated = characterService.getCharacter(character.id);
  const used = updated?.inventory.find((item) => item.id === added!.id);
  assert.equal(used?.uses?.current, 0);
  assert.equal(updated?.hp.marked, 2);
});

test('using stacked consumables advances to the next item without applying effects', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.addInventoryItem(character.id, {
    name: 'Малое Зелье Лечения',
    kind: 'consumable',
    quantity: 2,
    uses: { current: 1, max: 1 },
    text: 'Излечите 1d4+1 Ран.'
  });
  const item = characterService.getCharacter(character.id)?.inventory.find((candidate) => candidate.name === 'Малое Зелье Лечения');

  characterService.useInventoryItem(character.id, item!.id);
  const afterFirst = characterService.getCharacter(character.id)?.inventory.find((candidate) => candidate.id === item!.id);
  assert.equal(afterFirst?.quantity, 1);
  assert.equal(afterFirst?.uses?.current, 1);

  characterService.useInventoryItem(character.id, item!.id);
  const afterSecond = characterService.getCharacter(character.id)?.inventory.find((candidate) => candidate.id === item!.id);
  assert.equal(afterSecond?.quantity, 1);
  assert.equal(afterSecond?.uses?.current, 0);
});

test('character builder firstFeatureText prefers raw feature text', () => {
  const item = genericItem({
    body: 'Fallback body',
    raw: { features: [{ name: 'Feature', main_body: '**Rules** text' }] }
  });

  assert.equal(firstFeatureText(item), 'Feature: Rules text');
});

test('character builder featureListText includes multiple ancestry features', () => {
  const item = genericItem({
    body: 'Fallback body',
    raw: {
      features: [
        { name: 'First', main_body: '**First** text' },
        { name: 'Second', main_body: 'Second text' }
      ]
    }
  });

  assert.equal(featureListText(item), 'First: First text\n\nSecond: Second text');
});

test('character builder exposes subclass foundation features and their starting-card effect', () => {
  const subclass = genericItem({
    id: 'school-of-knowledge',
    name: 'Школа знаний',
    raw: {
      spellcast_trait: 'knowledge',
      foundation_features: [{ name: 'Подготовленный', main_body: 'Возьмите дополнительную карту домена первого уровня.' }]
    }
  });
  const preview = buildCharacterBuilderChoicePreview({
    step: 'subclass',
    selectedSubclass: subclass,
  });

  assert.equal(firstFeatureText(subclass), 'Подготовленный: Возьмите дополнительную карту домена первого уровня.');
  assert.match(featureListText(subclass), /Подготовленный/);
  assert.deepEqual(preview?.facts, [
    'Характеристика заклинателя: Знание'
  ]);
});

test('character builder equipment preview cleans markdown links', () => {
  const result = buildCharacterDraft({
    content: { ancestries: [], communities: [], subclasses: [], domainCards: [] },
    equipment: equipmentFixture(),
    className: 'Warrior',
    armorId: 'full-plate-armor',
    primaryWeaponId: 'longbow'
  });

  const preview = buildCharacterBuilderChoicePreview({
    step: 'equipment',
    selectedArmor: result.selections.armor,
    selectedPrimaryWeapon: result.selections.primaryWeapon,
    selectedSecondaryWeapon: result.selections.secondaryWeapon,
    selectedConsumable: null
  });

  assert.equal(preview?.body.includes('[/rule/'), false);
  assert.equal(preview?.body.includes('[Уклонению]'), false);
  assert.match(preview?.body ?? '', /Очень тяжёлое: −2 к Уклонению; −1 к Проворности/);
});

test('character builder filters playtest content by default', () => {
  const core = genericItem({ id: 'core-card', raw: { source_slugs: ['core', 'srd'], domain_name: 'Grace', level: 1 } });
  const playtest = genericItem({ id: 'void-card', raw: { source_slugs: ['playtest-the-void'], domain_name: 'Grace', level: 1 } });
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'core-ancestry', raw: { source_slugs: ['core'] } }), genericItem({ id: 'void-ancestry', raw: { source_slugs: ['playtest-the-void'] } })],
    communities: [],
    subclasses: [],
    domainCards: [core, playtest]
  };

  assert.deepEqual(filterBuilderContent(content).domainCards.map((item) => item.id), ['core-card']);
  assert.deepEqual(filterBuilderContent(content, true).domainCards.map((item) => item.id), ['core-card', 'void-card']);
  assert.deepEqual(buildCharacterDraft({ content, className: 'Bard', selectedCardIds: ['void-card', 'core-card'] }).draft.domainCards?.map((card) => card.id), ['core-card']);
});
