import { NumberField } from '../components/common/Field';
import { ResourcePips } from '../components/common/ResourcePips';
import { buildEffectiveCharacterStats } from '../../domain/rules/effects';
import type { Character } from '../../domain/rules/types';
import { gameService, characterService } from '../../services/serviceRegistry';
import { useStore } from '../../core/hooks/useStore';

export function ResourcePanel({ character }: { character: Character }) {
  const game = useStore(gameService.gameStore);
  const effective = buildEffectiveCharacterStats(character);
  return (
    <div className="stack gap-lg">
      <div className="resource-grid">
        <ResourcePips
          label="Надежда"
          current={effective.hope.value}
          max={effective.hope.max}
          filledMeansMarked={false}
          onChange={(next) => characterService.setHope(character.id, next)}
        />
        <ResourcePips
          label="Отмеченные Раны"
          current={character.hp.marked}
          max={character.hp.max}
          onChange={(next) => characterService.markSlots(character.id, 'hp', next - character.hp.marked)}
        />
        <ResourcePips
          label="Отмеченный Стресс"
          current={character.stress.marked}
          max={character.stress.max}
          onChange={(next) => characterService.markSlots(character.id, 'stress', next - character.stress.marked)}
        />
        <ResourcePips
          label="Ячейки Брони"
          current={character.armor.markedSlots}
          max={character.armor.score}
          onChange={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
        />
      </div>
      <div className="grid-4">
        <NumberField
          label="Макс. Ран"
          value={character.hp.max}
          onChange={(event) => characterService.updateResourceMax(character.id, 'hp', Number(event.currentTarget.value))}
        />
        <NumberField
          label="Макс. Стресса"
          value={character.stress.max}
          onChange={(event) => characterService.updateResourceMax(character.id, 'stress', Number(event.currentTarget.value))}
        />
        <NumberField
          label="Макс. Надежды"
          value={character.hope.max}
          onChange={(event) => characterService.updateResourceMax(character.id, 'hope', Number(event.currentTarget.value))}
        />
        {game.showLegacyActionTokens && (
          <NumberField
            label="Жетоны действия"
            value={character.actionTokens}
            onChange={(event) => characterService.setActionTokens(character.id, Number(event.currentTarget.value))}
            hint="Устаревший опциональный счётчик; текущий SRD-поток использует Активацию."
          />
        )}
      </div>
    </div>
  );
}
