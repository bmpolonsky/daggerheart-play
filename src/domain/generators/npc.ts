import { filterBuilderContent } from '../characterBuilder';
import type { ContentState, GenericLibraryItem } from '../content/types';
import { generateNames } from './names';

type NpcOrigin = Pick<GenericLibraryItem, 'id' | 'name'>;

export interface NpcCatalog {
  ancestries: NpcOrigin[];
  communities: NpcOrigin[];
}

export interface GeneratedNpc {
  name: string;
  gender: 'male' | 'female';
  ancestry: NpcOrigin;
  community: NpcOrigin;
  occupation: string;
  appearance: string;
  motive: string;
}

export type NpcField = keyof GeneratedNpc;
export const NPC_GENDER_LABELS = { male: 'мужской', female: 'женский' };

const OCCUPATIONS = [
  'торговец', 'стражник', 'кузнец', 'охотник', 'лекарь', 'повар', 'наёмник',
  'вор', 'священник', 'слуга', 'ремесленник', 'учитель', 'музыкант', 'посыльный',
  'фермер', 'трактирщик', 'телохранитель', 'разведчик', 'портной', 'строитель'
];
const APPEARANCES = [
  'заметный шрам на лице',
  'очень высокий рост',
  'очень низкий рост',
  'крепкое телосложение',
  'худощавое телосложение',
  'сутулая осанка',
  'глаза разного цвета',
  'повязка на одном глазу',
  'широкая улыбка',
  'резкие черты лица',
  'очки в круглой оправе',
  'потёртая одежда',
  'аккуратные заплаты на одежде',
  'яркий шарф',
  'множество мелких украшений',
  'широкополая шляпа',
  'длинный плащ с вышивкой',
  'пятна краски на одежде',
  'ручной зверёк выглядывает из сумки',
  'опирается на украшенную резьбой трость'
];
const MOTIVES = [
  'жить в своё удовольствие',
  'собирать редкости и диковинки',
  'найти любовь',
  'помогать нуждающимся',
  'накопить, чтобы больше не работать',
  'искать приключения',
  'отомстить обидчикам',
  'обеспечить детям лучшее будущее',
  'выведывать чужие секреты',
  'превзойти своего учителя',
  'наживаться на чужой доверчивости',
  'заработать на жизнь',
  'расплатиться с долгами',
  'прославиться',
  'разоблачать обман',
  'искать запретные знания',
  'распространять свою веру',
  'добиться власти'
];

export function buildNpcCatalog(content: ContentState['generic'], includePlaytest = false): NpcCatalog {
  const available = filterBuilderContent(content, includePlaytest);
  const origins = (items: GenericLibraryItem[]): NpcOrigin[] => items
    .filter((item) => item.name.trim())
    .map(({ id, name }) => ({ id, name }));
  return { ancestries: origins(available.ancestries), communities: origins(available.communities) };
}

export function generateNpc(catalog: NpcCatalog, rng: () => number = Math.random, previous?: GeneratedNpc): GeneratedNpc | null {
  if (!catalog.ancestries.length || !catalog.communities.length) return null;
  // Пол определяет только род имени; происхождение не задаёт остальные поля.
  const gender = pick(['male', 'female'] as const, rng);
  const ancestry = pick(catalog.ancestries, rng);
  const community = pick(catalog.communities, rng);
  const occupation = pick(OCCUPATIONS, rng);
  const appearance = pick(APPEARANCES, rng);
  const motive = pick(MOTIVES, rng);
  const name = generateNpcName(gender, rng, previous?.name);
  return { name, gender, ancestry, community, occupation, appearance, motive };
}

export function formatNpc(npc: GeneratedNpc): string {
  return `${npc.name}\nПол: ${NPC_GENDER_LABELS[npc.gender]}.\nРодословная: ${npc.ancestry.name}.\nСообщество: ${npc.community.name}.\nЗанятие: ${npc.occupation}.\nВнешность: ${npc.appearance}.\nМотив: ${npc.motive}.`;
}

export function rerollNpcField(npc: GeneratedNpc, catalog: NpcCatalog, field: NpcField, rng: () => number = Math.random): GeneratedNpc {
  switch (field) {
    case 'name':
      return { ...npc, name: generateNpcName(npc.gender, rng, npc.name) };
    case 'gender': {
      const gender = npc.gender === 'male' ? 'female' : 'male';
      return { ...npc, gender, name: generateNpcName(gender, rng, npc.name) };
    }
    case 'ancestry': {
      const alternatives = catalog.ancestries.filter((item) => item.id !== npc.ancestry.id);
      return alternatives.length ? { ...npc, ancestry: pick(alternatives, rng) } : npc;
    }
    case 'community': {
      const alternatives = catalog.communities.filter((item) => item.id !== npc.community.id);
      return alternatives.length ? { ...npc, community: pick(alternatives, rng) } : npc;
    }
    case 'occupation':
      return { ...npc, occupation: pick(OCCUPATIONS.filter((value) => value !== npc.occupation), rng) };
    case 'appearance':
      return { ...npc, appearance: pick(APPEARANCES.filter((value) => value !== npc.appearance), rng) };
    case 'motive':
      return { ...npc, motive: pick(MOTIVES.filter((value) => value !== npc.motive), rng) };
  }
}

function generateNpcName(gender: GeneratedNpc['gender'], rng: () => number, previous?: string): string {
  return generateNames({ kind: 'character', style: 'any', gender, withSurname: false },
    { previous: previous ? [{ name: previous, surname: '' }] : [] }, rng)[0]!.name;
}

function pick<T>(values: readonly T[], rng: () => number): T {
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(rng() * values.length)))]!;
}
