/** @jsxImportSource preact */
import { Bed, Coffee, Hourglass, Swords, Users } from "lucide-react";
import { useStream } from "../../../../core/hooks/useStream";
import { partyRestRulesForCharacters, restParticipantRulesForCharacter, type RestType } from "../../../../domain/rules/rest";
import { characterService, feedService } from "../../../../services/serviceRegistry";
import { ListItem } from "../../../components/common/ListItem";
import { playerViewUiActions } from "../playerViewUiState";

export function GmActionsPanel({ onOpenChronicle }: { onOpenChronicle?: () => void }) {
  const charactersState = useStream(characterService.characters$);
  const actorOptions = charactersState.order.flatMap((characterId) => {
    const character = charactersState.entities[characterId];
    if (!character) return [];
    return {
      actorId: character.id,
      actorName: character.name
    };
  });
  const requestRest = (restType: RestType) => {
    const characters = charactersState.order.flatMap((characterId) => {
      const character = charactersState.entities[characterId];
      return character ? [character] : [];
    });
    const partyRules = partyRestRulesForCharacters(characters, restType);
    const participants = charactersState.order.flatMap((characterId) => {
      const character = charactersState.entities[characterId];
      if (!character) return [];
      const rules = restParticipantRulesForCharacter(character, restType);
      return [{
        actorId: character.id,
        actorName: character.name,
        availableMoves: Array.from(new Set([...rules.availableMoves, ...partyRules.flatMap((rule) => rule.moveLabel ? [rule.moveLabel] : [])])),
        maxChoices: rules.maxChoices,
        longRestMoveLabels: rules.longRestMoveLabels,
        maxLongRestMoves: rules.maxLongRestMoves,
        ruleNotes: Array.from(new Set([...rules.notes, ...partyRules.map((rule) => rule.note)]))
      }];
    });
    feedService.requestRest(restType, {
      requestedBy: { actorName: 'Мастер', actorType: 'system' },
      participants
    });
    onOpenChronicle?.();
  };
  const requestTeamwork = (kind: 'groupAction' | 'tagTeam') => {
    feedService.requestTeamworkRoll({
      kind,
      requestedBy: { actorName: 'Мастер', actorType: 'system' },
      availableActors: actorOptions,
      publication: 'public'
    });
    onOpenChronicle?.();
  };
  return (
    <section className="player-gm-actions" aria-label="Действия мастера">
      <div className="player-gm-actions__rest-list">
        <RestRow restType="short" onRequest={() => requestRest('short')} />
        <RestRow restType="long" onRequest={() => requestRest('long')} />
        <TeamworkRow kind="groupAction" onRequest={() => requestTeamwork('groupAction')} />
        <TeamworkRow kind="tagTeam" onRequest={() => requestTeamwork('tagTeam')} />
        <ListItem className="player-gm-actions__rest-row" leftAccessory={<Hourglass size={16} aria-hidden="true" />} title="Создать отсчет" onClick={() => { playerViewUiActions.openCountdownComposer(); onOpenChronicle?.(); }} />
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
    <ListItem
      className="player-gm-actions__rest-row"
      leftAccessory={<Icon size={16} aria-hidden="true" />}
      title={restType === 'short' ? 'Короткий отдых' : 'Продолжительный отдых'}
      onClick={onRequest}
    />
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
    <ListItem
      className="player-gm-actions__rest-row"
      leftAccessory={<Icon size={16} aria-hidden="true" />}
      title={kind === 'groupAction' ? 'Групповой бросок' : 'Командный бросок'}
      onClick={onRequest}
    />
  );
}
