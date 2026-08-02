import { AssetService } from './AssetService';
import { AudioService } from './AudioService';
import { GameService } from './GameService';
import { GmLobbyService } from './GmLobbyService';
import { ContentService } from './ContentService';
import { CharacterService } from './CharacterService';
import { CloudBackupService } from './CloudBackupService';
import { DiceService } from './DiceService';
import { EncounterService } from './EncounterService';
import { FeedService } from './FeedService';
import { ImportExportService } from './ImportExportService';
import { MediaCallService } from './MediaCallService';
import { P2PSessionService } from './P2PSessionService';
import type { P2PTransportAdapter } from './p2p/P2PTransportAdapter';
import type { P2PTransportFactoryContext } from './p2p/P2PTransportAdapter';
import { createConfiguredP2PTransport } from './p2p/MultiStrategyP2PTransport';
import { ServerRelayTransport } from './ServerRelayTransport';
import { serverSessionEnabled } from '../domain/p2p/serverSession';
import type { TrysteroP2PTransportOptions } from './TrysteroSyncTransport';
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
export const persistenceService = new PersistenceService(undefined, assetService);
export const importExportService = new ImportExportService(assetService, persistenceService);
export const cloudBackupService = new CloudBackupService(importExportService, assetService);
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
export const mediaCallService = new MediaCallService(syncService);
const e2eP2PTransportFactory = typeof window !== 'undefined' && navigator.webdriver
  ? (window as typeof window & { __DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__?: () => P2PTransportAdapter }).__DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__
  : undefined;
const sessionTransportFactory = (
  options: TrysteroP2PTransportOptions,
  context?: P2PTransportFactoryContext
): P2PTransportAdapter => {
  if (e2eP2PTransportFactory) return e2eP2PTransportFactory();
  if (serverSessionEnabled() && context) return new ServerRelayTransport(context);
  return createConfiguredP2PTransport(options);
};
const hybridMediaTransportFactory = serverSessionEnabled()
  ? (options: TrysteroP2PTransportOptions) => createConfiguredP2PTransport(options)
  : undefined;
export const p2pSessionService = new P2PSessionService(syncService, playerActionRequestService, playerActivationQueueService, playerPresenceService, feedService, sceneTableService, diceService, assetService, audioService, sceneAudioBroadcastService, sessionTransportFactory, undefined, mediaCallService, characterService, hybridMediaTransportFactory, cloudBackupService);
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
export const uiService = new UiService();

export async function bootServices(): Promise<void> {
  persistenceService.start();
  await persistenceService.whenReady();
  sceneTableService.pruneOrphanTokens(characterService.characters$.get(), encounterService.encounter$.get());
  contentService.ensureLoaded();
}
