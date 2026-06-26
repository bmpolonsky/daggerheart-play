import type { Character } from '../rules/types';
import type { TableScene } from './types';

export const DEFAULT_LOBBY_SCENE_IMAGE = '/image/environment/cliffside-tavern.webp';
export const DEFAULT_SCENE_IMAGE = './image/environment/hallow-temple.webp';

const DEFAULT_CHARACTER_PORTRAIT_POOL = [
  './image/ancestry/card/human.jpg',
  './image/ancestry/card/elf.jpg',
  './image/ancestry/card/dwarf.jpg',
  './image/ancestry/card/katari.jpg',
  './image/ancestry/card/faerie.jpg',
  './image/ancestry/card/orc.jpg',
  './image/ancestry/card/drakona.jpg',
  './image/ancestry/card/galapa.jpg'
] as const;

const ANCESTRY_PORTRAITS: Record<string, string> = {
  clank: './image/ancestry/card/clank.jpg',
  dwarf: './image/ancestry/card/dwarf.jpg',
  drakona: './image/ancestry/card/drakona.jpg',
  elf: './image/ancestry/card/elf.jpg',
  faerie: './image/ancestry/card/faerie.jpg',
  faun: './image/ancestry/card/faun.jpg',
  firbolg: './image/ancestry/card/firbolg.jpg',
  fungril: './image/ancestry/card/fungril.jpg',
  galapa: './image/ancestry/card/galapa.jpg',
  giant: './image/ancestry/card/giant.jpg',
  goblin: './image/ancestry/card/goblin.jpg',
  halfling: './image/ancestry/card/halfling.jpg',
  human: './image/ancestry/card/human.jpg',
  infernis: './image/ancestry/card/infernis.jpg',
  katari: './image/ancestry/card/katari.jpg',
  orc: './image/ancestry/card/orc.jpg',
  ribbet: './image/ancestry/card/ribbet.jpg',
  simiah: './image/ancestry/card/simiah.jpg',
  великан: './image/ancestry/card/giant.jpg',
  галапа: './image/ancestry/card/galapa.jpg',
  гоблин: './image/ancestry/card/goblin.jpg',
  дварф: './image/ancestry/card/dwarf.jpg',
  дракона: './image/ancestry/card/drakona.jpg',
  инфернис: './image/ancestry/card/infernis.jpg',
  катари: './image/ancestry/card/katari.jpg',
  кланк: './image/ancestry/card/clank.jpg',
  орк: './image/ancestry/card/orc.jpg',
  полурослик: './image/ancestry/card/halfling.jpg',
  риббет: './image/ancestry/card/ribbet.jpg',
  симиан: './image/ancestry/card/simiah.jpg',
  фавн: './image/ancestry/card/faun.jpg',
  фангрил: './image/ancestry/card/fungril.jpg',
  фейри: './image/ancestry/card/faerie.jpg',
  фирболг: './image/ancestry/card/firbolg.jpg',
  человек: './image/ancestry/card/human.jpg',
  эльф: './image/ancestry/card/elf.jpg'
};

export function defaultSceneImageUrl(_scene: Pick<TableScene, 'id' | 'name' | 'subtitle' | 'mode'>): string {
  return DEFAULT_SCENE_IMAGE;
}

type DefaultCharacterPortraitInput = Pick<Character, 'id' | 'name'> & {
  className: string;
  ancestry?: string;
  portraitUrl?: string;
};

export function defaultCharacterPortraitUrl(character: DefaultCharacterPortraitInput): string {
  const explicitPortrait = character.portraitUrl?.trim();
  if (explicitPortrait) return explicitPortrait;
  const ancestryPortrait = ANCESTRY_PORTRAITS[normalizeArtKey(character.ancestry ?? '')];
  if (ancestryPortrait) return ancestryPortrait;
  return DEFAULT_CHARACTER_PORTRAIT_POOL[stableIndex(`${character.id}:${character.name}:${character.className}`, DEFAULT_CHARACTER_PORTRAIT_POOL.length)];
}

function normalizeArtKey(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function stableIndex(seed: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % count;
}
