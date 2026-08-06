import { characterLevelRank } from '../domain/rules/levelUp';
import { restMoveOperation, rollRestFear, type LongRestRecoveryMove, type RestFearPlan, type RestType } from '../domain/rules/rest';
import { GameService } from './GameService';
import { CharacterService } from './CharacterService';
import { DiceService } from './DiceService';
import { EncounterService } from './EncounterService';
import { FeedService } from './FeedService';
import { RollLogService } from './RollLogService';
import { SceneTableService, type AddActorTokenOptions } from './SceneTableService';
import type { Adversary, Character, FormulaTermRoll, RestChoiceResult, TraitId } from '../domain/rules/types';
import type { EncounterFlowAction } from '../domain/rules/encounterFlow';
import type { ActorRef, TableScene, TokenState } from '../domain/tabletop/types';
import { DEFAULT_SCENE_HEIGHT, DEFAULT_SCENE_WIDTH, measureRange, moveTokenWithinWorld, syncSceneTokens, tokenIdFor } from '../domain/tabletop/logic';
import type { TokenFlagPatch } from '../domain/tabletop/logic';
import type { ActionRollRequest } from './DiceService';

export interface TabletopServiceDependencies {
  gameService: GameService;
  characterService: CharacterService;
  diceService: DiceService;
  encounterService: EncounterService;
  feedService: FeedService;
  rollLogService: RollLogService;
  sceneTableService: SceneTableService;
}

export interface TableActorView {
  token: TokenState;
  character?: Character;
  adversary?: Adversary;
  name: string;
  subtitle: string;
  imageUrl: string;
  kind: 'character' | 'adversary';
}

export interface CreatedTableCharacter {
  character: Character;
  tokenId: string;
}

export interface EncounterFlowDispatchInput {
  selectedCharacter: Character | null;
  trait: TraitId;
  difficulty: number;
  actionRollOptions?: Partial<ActionRollRequest>;
}

export interface ConductRestOptions {
  pcCount?: number;
  rng?: () => number;
}

export interface ResolveRestMoveResult {
  applied: boolean;
  message: string;
  result?: RestChoiceResult;
}

export type EncounterFlowDispatchResult =
  | { kind: 'handled' }
  | { kind: 'openPanel'; panel: 'party' | 'play' }
  | { kind: 'openDrawer'; tab: 'gm' | 'log' };

export class TabletopService {
  constructor(private dependencies: TabletopServiceDependencies) {}

  createCharacterOnActiveScene(input?: Partial<Character> & { className?: Character['className'] }): CreatedTableCharacter {
    const existingCharacters = this.dependencies.characterService.characters$.get();
    const character = this.dependencies.characterService.createCharacter({
      name: input?.name ?? `Герой ${existingCharacters.order.length + 1}`,
      playerName: input?.playerName ?? '',
      className: input?.className ?? 'Bard',
      level: input?.level ?? 1,
      ...input
    });
    const tokenId = this.placeCharacterOnActiveScene(character.id);
    return { character, tokenId };
  }

  placeCharacterOnActiveScene(characterId: string): string {
    return this.placeActorOnScene({ kind: 'character', id: characterId }) ?? tokenIdFor('character', characterId);
  }

  placeAdversaryOnActiveScene(adversaryId: string): string {
    return this.placeActorOnScene({ kind: 'adversary', id: adversaryId }) ?? tokenIdFor('adversary', adversaryId);
  }

  placeActorOnScene(
    actor: ActorRef,
    sceneId = this.dependencies.sceneTableService.sceneTable$.get().activeSceneId,
    options: AddActorTokenOptions = {}
  ): string | null {
    const token = this.dependencies.sceneTableService.addActorTokenToScene(sceneId, actor, options);
    if (token && this.dependencies.sceneTableService.sceneTable$.get().activeSceneId === sceneId) {
      this.dependencies.sceneTableService.selectToken(token.id);
    }
    return token?.id ?? null;
  }

  syncActorsToActiveScene(characters: Character[], adversaries: Adversary[]): void {
    this.dependencies.sceneTableService.updateActiveScene((scene) => syncSceneTokens(scene, characters, adversaries));
  }

  buildActorViews(scene: TableScene, characters: Record<string, Character>, adversaries: Record<string, Adversary>): TableActorView[] {
    const views: TableActorView[] = [];
    scene.tokens.forEach((token) => {
      if (token.actor.kind === 'character') {
        const character = characters[token.actor.id];
        if (!character) return;
        views.push({
          token,
          character,
          name: character.name,
          subtitle: `${character.className} ${character.level}`,
          imageUrl: character.portraitUrl,
          kind: 'character'
        });
        return;
      }
      if (token.actor.kind === 'adversary') {
        const adversary = adversaries[token.actor.id];
        if (!adversary) return;
        views.push({
          token,
          adversary,
          name: adversary.name,
          subtitle: `Ранг ${adversary.tier} / ${adversary.type}`,
          imageUrl: adversary.imageUrl ?? '',
          kind: 'adversary'
        });
      }
    });
    return views;
  }

  selectToken(tokenId: string | null): void {
    this.dependencies.sceneTableService.selectToken(tokenId);
  }

  moveToken(tokenId: string, x: number, y: number): void {
    const scene = this.dependencies.sceneTableService.getActiveScene();
    this.dependencies.sceneTableService.updateSceneTokens((tokens) =>
      tokens.map((token) => (token.id === tokenId
        ? moveTokenWithinWorld(token, x, y, scene.mode === 'tactical' && scene.allowTokenOverflow)
        : token))
    );
  }

  updateTokenFlags(tokenId: string, patch: TokenFlagPatch): TokenState | null {
    return this.dependencies.sceneTableService.updateTokenFlags(tokenId, patch);
  }

  setTokenHidden(tokenId: string, hidden: boolean): TokenState | null {
    return this.dependencies.sceneTableService.setTokenHidden(tokenId, hidden);
  }

  setTokenLocked(tokenId: string, locked: boolean): TokenState | null {
    return this.dependencies.sceneTableService.setTokenLocked(tokenId, locked);
  }

  setTokenVisibility(tokenId: string, visibility: 'public' | 'gm'): TokenState | null {
    return this.dependencies.sceneTableService.setTokenVisibility(tokenId, visibility);
  }

  duplicateToken(token: TokenState): void {
    if (token.actor.kind === 'character') {
      const duplicated = this.dependencies.characterService.duplicateCharacter(token.actor.id);
      if (!duplicated) return;
      this.dependencies.sceneTableService.updateSceneTokens((tokens) => [
        ...tokens,
        {
          ...token,
          id: tokenIdFor('character', duplicated.id),
          actor: { kind: 'character', id: duplicated.id },
          x: clampWorld(token.x + 70, 0, DEFAULT_SCENE_WIDTH),
          y: clampWorld(token.y + 70, 0, DEFAULT_SCENE_HEIGHT)
        }
      ]);
      return;
    }
    if (token.actor.kind === 'adversary') {
      const duplicated = this.dependencies.encounterService.duplicateAdversary(token.actor.id);
      if (!duplicated) return;
      this.dependencies.sceneTableService.updateSceneTokens((tokens) => [
        ...tokens,
        {
          ...token,
          id: tokenIdFor('adversary', duplicated.id),
          actor: { kind: 'adversary', id: duplicated.id },
          x: clampWorld(token.x + 70, 0, DEFAULT_SCENE_WIDTH),
          y: clampWorld(token.y + 70, 0, DEFAULT_SCENE_HEIGHT)
        }
      ]);
    }
  }

  removeTokenFromScene(tokenOrId: TokenState | string, sceneId?: string): boolean {
    const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenOrId.id;
    return sceneId ? this.dependencies.sceneTableService.removeTokenFromSceneInScene(sceneId, tokenId) : this.dependencies.sceneTableService.removeTokenFromScene(tokenId);
  }

  deleteCharacter(characterId: string): void {
    this.dependencies.characterService.deleteCharacter(characterId);
    this.pruneOrphanTokens();
  }

  deleteAdversary(adversaryId: string): void {
    this.dependencies.encounterService.deleteAdversary(adversaryId);
    this.pruneOrphanTokens();
  }

  deleteToken(token: TokenState): void {
    if (token.actor.kind === 'character') {
      this.deleteCharacter(token.actor.id);
      return;
    }
    if (token.actor.kind === 'adversary') {
      this.deleteAdversary(token.actor.id);
      return;
    }
    this.dependencies.sceneTableService.updateSceneTokens((tokens) => tokens.filter((item) => item.id !== token.id));
    this.dependencies.sceneTableService.selectToken(null);
  }

  private pruneOrphanTokens(): void {
    this.dependencies.sceneTableService.pruneOrphanTokens(
      this.dependencies.characterService.characters$.get(),
      this.dependencies.encounterService.encounter$.get()
    );
  }

  rollAction(actor: Character | null, trait: TraitId, difficulty: number, options: Partial<ActionRollRequest> = {}): void {
    this.dependencies.diceService.rollAction({
      ...options,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? 'Бросок',
      trait,
      difficulty,
      applyConsequences: this.dependencies.gameService.game$.get().autoApplyRollConsequences
    });
  }

  executeEncounterFlowAction(action: EncounterFlowAction, input: EncounterFlowDispatchInput): EncounterFlowDispatchResult {
    if (action === 'start') {
      this.dependencies.encounterService.startEncounter();
      return { kind: 'handled' };
    }
    if (action === 'passSpotlight') {
      this.dependencies.gameService.passSpotlight();
      return { kind: 'handled' };
    }
    if (action === 'roll') {
      this.rollAction(input.selectedCharacter, input.trait, input.difficulty, input.actionRollOptions);
      return { kind: 'handled' };
    }
    if (action === 'review') {
      return { kind: 'openDrawer', tab: 'gm' };
    }
    return { kind: 'openPanel', panel: 'party' };
  }

  conductRest(restType: RestType, options: ConductRestOptions = {}): RestFearPlan {
    const characterIds = this.dependencies.characterService.characters$.get().order;
    const pcCount = options.pcCount ?? characterIds.length;
    const plan = rollRestFear(restType, pcCount, options.rng);
    characterIds.forEach((characterId) => {
      this.dependencies.characterService.resetUsageTrackersForRest(characterId, restType);
    });
    this.dependencies.gameService.gainFear(plan.total);
    const restTitle = restType === 'short' ? 'Короткий отдых' : 'Продолжительный отдых';
    const modifierText = plan.modifier > 0 ? ` + ${plan.modifier} персонаж(ей)` : '';
    this.dependencies.rollLogService.addManual(
      restTitle,
      `Страх: 1d4 (${plan.die})${modifierText} = ${plan.total}.`,
      { authorName: 'Мастер', feedType: 'system' }
    );
    return plan;
  }

  applyLongRestGroupRecovery(move: LongRestRecoveryMove): number {
    const changedCount = this.dependencies.characterService.applyLongRestGroupRecovery(move);
    const label = longRestRecoveryLabel(move);
    this.dependencies.rollLogService.addManual(
      'Продолжительный отдых',
      changedCount > 0 ? `${label}: применено к персонажам (${changedCount}).` : `${label}: нет изменений.`,
      { authorName: 'Мастер', feedType: 'system' }
    );
    return changedCount;
  }

  resolveRestMove(restEntryId: string, actorId: string, choiceId: string): ResolveRestMoveResult {
    const restEntry = this.dependencies.feedService.feed$.get().find((entry) => (
      entry.type === 'rest' && (entry.id === restEntryId || entry.rest.id === restEntryId)
    ));
    if (!restEntry || restEntry.type !== 'rest') return { applied: false, message: 'Отдых не найден.' };
    if (restEntry.rest.status === 'cancelled') return { applied: false, message: 'Отдых отменён.' };
    const participant = restEntry.rest.participants.find((item) => item.actorId === actorId);
    const choice = participant?.choices.find((item) => item.id === choiceId);
    if (!participant || !choice) return { applied: false, message: 'Ход отдыха не найден.' };
    if (choice.status === 'resolved') {
      return { applied: false, message: 'Ход отдыха уже применён.', result: choice.result };
    }
    const character = this.dependencies.characterService.getCharacter(actorId);
    if (!character) return { applied: false, message: 'Персонаж не найден.' };
    const result = this.applyRestMove(character, restEntry.rest.restType, choice.label, choice.count);
    this.dependencies.feedService.resolveRestParticipantChoice(restEntry.id, actorId, choice.id, result);
    return { applied: true, message: result.note, result };
  }

  measureRange(source: TokenState | null, target: TokenState | null, gridSize: number) {
    return measureRange(source, target, gridSize);
  }

  private applyRestMove(character: Character, _restType: RestType, label: string, count: number): RestChoiceResult {
    const safeCount = Math.max(1, Math.trunc(count));
    const rank = characterLevelRank(character.level);
    const operation = restMoveOperation(label);
    if (operation === 'rollHp') {
      const roll = this.dependencies.diceService.rollManualDice({
        actorId: character.id,
        actorName: character.name,
        formula: restRecoveryFormula(safeCount, rank),
        label: 'Отдых: исцеление',
        notes: label
      });
      this.dependencies.characterService.clearHp(character.id, roll.total);
      return { formula: roll.formula, rolls: formulaRollValues(roll.terms), total: roll.total, appliedAmount: roll.total, note: `Исцелено ран: ${roll.total}.` };
    }
    if (operation === 'rollStress') {
      const roll = this.dependencies.diceService.rollManualDice({
        actorId: character.id,
        actorName: character.name,
        formula: restRecoveryFormula(safeCount, rank),
        label: 'Отдых: стресс',
        notes: label
      });
      this.dependencies.characterService.clearStress(character.id, roll.total);
      return { formula: roll.formula, rolls: formulaRollValues(roll.terms), total: roll.total, appliedAmount: roll.total, note: `Очищено стресса: ${roll.total}.` };
    }
    if (operation === 'rollArmor') {
      const roll = this.dependencies.diceService.rollManualDice({
        actorId: character.id,
        actorName: character.name,
        formula: restRecoveryFormula(safeCount, rank),
        label: 'Отдых: броня',
        notes: label
      });
      this.dependencies.characterService.updateArmor(character.id, {
        markedSlots: Math.max(0, character.armor.markedSlots - roll.total)
      }, false);
      return { formula: roll.formula, rolls: formulaRollValues(roll.terms), total: roll.total, appliedAmount: roll.total, note: `Починено брони: ${roll.total}.` };
    }
    if (operation === 'prepare') {
      const amount = safeCount;
      this.dependencies.characterService.adjustHope(character.id, amount);
      return { appliedAmount: amount, note: `Получено Надежды: ${amount}.` };
    }
    if (operation === 'clearHp') {
      const amount = character.hp.marked;
      this.dependencies.characterService.clearHp(character.id, amount);
      return { appliedAmount: amount, note: `Очищены все раны: ${amount}.` };
    }
    if (operation === 'clearStress') {
      const amount = character.stress.marked;
      this.dependencies.characterService.clearStress(character.id, amount);
      return { appliedAmount: amount, note: `Очищен весь стресс: ${amount}.` };
    }
    if (operation === 'clearArmor') {
      const amount = character.armor.markedSlots;
      this.dependencies.characterService.updateArmor(character.id, { markedSlots: 0 }, false);
      return { appliedAmount: amount, note: `Починена вся броня: ${amount}.` };
    }
    return { note: 'Ход отмечен как выполненный вручную.' };
  }
}

function restRecoveryFormula(count: number, rank: number): string {
  const diceCount = Math.max(1, Math.trunc(count));
  const modifier = Math.max(0, Math.trunc(rank)) * diceCount;
  return modifier > 0 ? `${diceCount}d4+${modifier}` : `${diceCount}d4`;
}

function formulaRollValues(terms: FormulaTermRoll[]): number[] {
  return terms.flatMap((term) => 'rolls' in term ? term.rolls : []);
}

function longRestRecoveryLabel(move: LongRestRecoveryMove): string {
  if (move === 'clearHp') return 'Залечить все Раны';
  if (move === 'clearStress') return 'Снять весь Стресс';
  return 'Полный ремонт Брони';
}

function clampWorld(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
