/** @jsxImportSource preact */
import { Bed, Coffee, Hourglass, Swords, Users } from "lucide-react";
import { useStore } from "../../../../core/hooks/useStore";
import type { RestType } from "../../../../domain/rules/rest";
import { characterService, feedService } from "../../../../services/serviceRegistry";
import { playerViewUiActions } from "../playerViewUiState";

export function GmActionsPanel() {
  const charactersState = useStore(characterService.charactersStore);
  const actorOptions = charactersState.order.flatMap((characterId) => {
    const character = charactersState.entities[characterId];
    if (!character) return [];
    return {
      actorId: character.id,
      actorName: character.name
    };
  });
  const requestRest = (restType: RestType) => {
    feedService.requestRest(restType, {
      requestedBy: { actorName: 'Мастер', actorType: 'system' },
      participants: actorOptions
    });
  };
  const requestTeamwork = (kind: 'groupAction' | 'tagTeam') => {
    feedService.requestTeamworkRoll({
      kind,
      requestedBy: { actorName: 'Мастер', actorType: 'system' },
      availableActors: actorOptions,
      publication: 'public'
    });
  };
  return (
    <section className="player-gm-actions" aria-label="Действия мастера">
      <div className="player-gm-actions__rest-list">
        <RestRow restType="short" onRequest={() => requestRest('short')} />
        <RestRow restType="long" onRequest={() => requestRest('long')} />
        <TeamworkRow kind="groupAction" onRequest={() => requestTeamwork('groupAction')} />
        <TeamworkRow kind="tagTeam" onRequest={() => requestTeamwork('tagTeam')} />
        <button className="player-gm-actions__rest-row" type="button" onClick={() => playerViewUiActions.setCountdownComposerOpen(true)}>
          <Hourglass size={16} aria-hidden="true" />
          <span>
            <strong>Создать отсчет</strong>
          </span>
        </button>
      </div>
    </section>
  );
}

function RestRow({
  restType,
  onRequest
}: {
  restType: RestType;
  onRequest: () => void;
}) {
  const Icon = restType === 'short' ? Coffee : Bed;
  return (
    <button className="player-gm-actions__rest-row" type="button" onClick={onRequest}>
      <Icon size={16} aria-hidden="true" />
      <span>
        <strong>{restType === 'short' ? 'Короткий отдых' : 'Продолжительный отдых'}</strong>
      </span>
    </button>
  );
}

function TeamworkRow({
  kind,
  onRequest
}: {
  kind: 'groupAction' | 'tagTeam';
  onRequest: () => void;
}) {
  const Icon = kind === 'groupAction' ? Users : Swords;
  return (
    <button className="player-gm-actions__rest-row" type="button" onClick={onRequest}>
      <Icon size={16} aria-hidden="true" />
      <span>
        <strong>{kind === 'groupAction' ? 'Групповой бросок' : 'Командный бросок'}</strong>
      </span>
    </button>
  );
}
