import type { GameHandout } from '../rules/types';
import type { TableScene } from './types';

export type GmPrepStepId = 'sceneArt' | 'sceneLive' | 'playerCharacter' | 'handout' | 'encounter';

export interface GmPrepStep {
  id: GmPrepStepId;
  label: string;
  detail: string;
  ready: boolean;
}

export interface GmPrepChecklist {
  readyCount: number;
  totalCount: number;
  steps: GmPrepStep[];
}

export interface GmPrepChecklistInput {
  activeScene: TableScene;
  liveSceneId: string | null;
  charactersCount: number;
  playerCharacterId: string | null;
  adversaryCount: number;
  handouts: GameHandout[];
  presentedHandoutId: string | null;
}

export function buildGmPrepChecklist(input: GmPrepChecklistInput): GmPrepChecklist {
  const hasSceneArt = Boolean(input.activeScene.backgroundAssetId || input.activeScene.backgroundUrl.trim());
  const liveHandout = input.handouts.find((handout) => handout.id === input.presentedHandoutId && handout.visibleToPlayers);
  const visibleHandouts = input.handouts.filter((handout) => handout.visibleToPlayers);
  const steps: GmPrepStep[] = [
    {
      id: 'sceneArt',
      label: 'Фон сцены',
      detail: hasSceneArt ? 'Есть арт или карта.' : 'Добавьте фон, чтобы первый экран выглядел готовым.',
      ready: hasSceneArt
    },
    {
      id: 'sceneLive',
      label: 'Сцена в эфире',
      detail: input.activeScene.id === input.liveSceneId ? 'Игроки видят текущую сцену.' : 'Опубликуйте сцену перед началом.',
      ready: input.activeScene.id === input.liveSceneId
    },
    {
      id: 'playerCharacter',
      label: 'Герой игрока',
      detail: input.playerCharacterId ? 'Экран игрока привязан к герою.' : input.charactersCount > 0 ? 'Назначьте героя для экрана игрока.' : 'Создайте хотя бы одного героя.',
      ready: Boolean(input.playerCharacterId)
    },
    {
      id: 'handout',
      label: 'Материал',
      detail: liveHandout ? `В эфире: ${liveHandout.title || 'Материал'}.` : visibleHandouts.length > 0 ? 'Есть публичные материалы, но ничего не показано.' : 'Подготовьте публичный материал, улику или иллюстрацию.',
      ready: Boolean(liveHandout)
    },
    {
      id: 'encounter',
      label: 'Столкновение',
      detail: input.adversaryCount > 0 ? `Противников: ${input.adversaryCount}.` : 'Добавьте adversary или окружение из библиотеки.',
      ready: input.adversaryCount > 0
    }
  ];
  return {
    readyCount: steps.filter((step) => step.ready).length,
    totalCount: steps.length,
    steps
  };
}
