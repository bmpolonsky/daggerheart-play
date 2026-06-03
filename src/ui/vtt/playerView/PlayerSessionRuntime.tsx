/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { audioService, p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

interface PlayerSessionRuntimeProps {
  displayedCharacter: PlayerViewCharacterSummary | null;
  gameGmName: string;
  playerCharacterId: string | null;
  role: TableViewRole;
  selectedPlayerName?: string;
  selectedPlayerSeatId: string | null;
  sessionPassword?: string;
  sessionRoomId?: string;
}

export function PlayerSessionRuntime({
  displayedCharacter,
  gameGmName,
  playerCharacterId,
  role,
  selectedPlayerName,
  selectedPlayerSeatId,
  sessionPassword,
  sessionRoomId
}: PlayerSessionRuntimeProps) {
  const audioState = useStream(audioService.audio$);
  const p2pSession = useStream(p2pSessionService.session$);
  const autoP2PRestoreKey = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (role === 'gm') {
      if ((p2pSession.connected || p2pSession.status === 'connecting') && p2pSession.role === 'gm') {
        autoP2PRestoreKey.current = null;
        return;
      }
      const key = `gm:auto-open:${gameGmName}`;
      if (autoP2PRestoreKey.current === key) return;
      autoP2PRestoreKey.current = key;
      void p2pSessionService.ensureGmRoom(gameGmName).catch(() => {
        autoP2PRestoreKey.current = null;
      });
      return;
    }

    if (!sessionRoomId) {
      const key = `player:restore:${selectedPlayerName ?? 'anonymous'}`;
      if (autoP2PRestoreKey.current === key) return;
      autoP2PRestoreKey.current = key;
      void p2pSessionService.restoreActiveSession('player', selectedPlayerName).catch(() => undefined);
      return;
    }
    const session = p2pSessionService.session$.get();
    if (session.connected && session.role === 'player' && session.roomId === sessionRoomId) {
      return;
    }
    const key = `player:room:${sessionRoomId}:${sessionPassword}`;
    if (autoP2PRestoreKey.current === key && session.status === 'connecting') return;
    autoP2PRestoreKey.current = key;
    void p2pSessionService.startPlayerRoom({
      roomId: sessionRoomId,
      password: sessionPassword,
      participantId: selectedPlayerSeatId ?? undefined,
      actorIds: playerCharacterId ? [playerCharacterId] : [],
      participantName: selectedPlayerName
    }).catch(() => undefined);
  }, [gameGmName, p2pSession.connected, p2pSession.role, p2pSession.status, playerCharacterId, role, selectedPlayerName, selectedPlayerSeatId, sessionPassword, sessionRoomId]);

  useEffect(() => {
    if (role !== 'player') {
      return;
    }
    p2pSessionService.setPlayerActorContext({
      participantId: selectedPlayerSeatId,
      actorId: displayedCharacter?.id,
      actorName: displayedCharacter?.name
    });
  }, [displayedCharacter?.id, displayedCharacter?.name, role, selectedPlayerSeatId]);

  useEffect(() => {
    if (role !== 'player' || !p2pSession.connected || !displayedCharacter?.id) {
      return;
    }
    const publish = () => {
      void p2pSessionService.publishPresence({
        requesterId: p2pSession.peerId ?? selectedPlayerSeatId ?? displayedCharacter.id,
        actorId: displayedCharacter.id,
        actorName: displayedCharacter.name,
        playerName: selectedPlayerName ?? '',
        connected: true,
        voiceMuted: audioState.voiceMuted,
        voiceLive: audioState.voiceStatus === 'live'
      });
    };
    publish();
    const intervalId = window.setInterval(publish, 3000);
    return () => window.clearInterval(intervalId);
  }, [audioState.voiceMuted, audioState.voiceStatus, displayedCharacter?.id, displayedCharacter?.name, p2pSession.connected, p2pSession.peerId, role, selectedPlayerName, selectedPlayerSeatId]);

  return null;
}
