import { AssetService } from './AssetService';
import { AudioService } from './AudioService';
import { GameService } from './GameService';
import { GmLobbyService } from './GmLobbyService';
import { ContentService } from './ContentService';
import { CharacterService } from './CharacterService';
import { DiceService } from './DiceService';
import { EncounterService } from './EncounterService';
import { FeedService } from './FeedService';
import { ImportExportService } from './ImportExportService';
import { P2PSessionService } from './P2PSessionService';
import { PersistenceService } from './PersistenceService';
import { PlayerActionRequestService } from './PlayerActionRequestService';
import { PlayerActivationQueueService } from './PlayerActivationQueueService';
import { PlayerPresenceService } from './PlayerPresenceService';
import { RollLogService } from './RollLogService';
import { SceneTableService } from './SceneTableService';
import { SceneAudioBroadcastService } from './SceneAudioBroadcastService';
import { SyncService } from './SyncService';
import { TabletopService } from './TabletopService';
import { UiService } from './UiService';

export const assetService = new AssetService();
export const audioService = new AudioService();
export const gameService = new GameService();
export const characterService = new CharacterService();
export const contentService = new ContentService();
export const diceService = new DiceService();
export const encounterService = new EncounterService();
export const feedService = new FeedService();
export const rollLogService = new RollLogService();
export const playerActionRequestService = new PlayerActionRequestService(diceService);
export const playerActivationQueueService = new PlayerActivationQueueService();
export const playerPresenceService = new PlayerPresenceService();
export const sceneTableService = new SceneTableService();
export const sceneAudioBroadcastService = new SceneAudioBroadcastService();
export const syncService = new SyncService();
export const p2pSessionService = new P2PSessionService(syncService, playerActionRequestService, playerActivationQueueService, playerPresenceService, feedService, sceneTableService, diceService, assetService, audioService, sceneAudioBroadcastService);
export const gmLobbyService = new GmLobbyService(p2pSessionService);
characterService.setDeathMoveRequestHandler((character, transition) => {
  if (p2pSessionService.isConnectedPlayerSession()) return;
  if (transition === 'defeatedRemoved') {
    feedService.cancelOpenDeathMoves(character.id);
    return;
  }
  feedService.requestDeathMove({
    actor: {
      actorId: character.id,
      actorName: character.name,
      actorType: 'character'
    },
    publication: 'public',
    dedupe: false
  });
});
export const tabletopService = new TabletopService({
  gameService,
  characterService,
  diceService,
  encounterService,
  feedService,
  rollLogService,
  sceneTableService
});
export const persistenceService = new PersistenceService(undefined, assetService);
export const importExportService = new ImportExportService(assetService, persistenceService);
export const uiService = new UiService();

export async function bootServices(): Promise<void> {
  persistenceService.start();
  await persistenceService.whenReady();
  contentService.ensureLoaded();
}
