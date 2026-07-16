import { NumberField } from '../components/common/Field';
import { ResourcePips } from '../components/common/ResourcePips';
import { buildEffectiveCharacterStats } from '../../domain/rules/effects';
import type { Character } from '../../domain/rules/types';
import { gameService, characterService } from '../../services/serviceRegistry';
import { useStream } from '../../core/hooks/useStream';

export function ResourcePanel({ character, allowStructureEdit = false }: { character: Character; allowStructureEdit?: boolean }) {
  const game = useStream(gameService.game$);
  const effective = buildEffectiveCharacterStats(character);
  return (
    <div className="stack gap-lg">
      <div className="resource-grid">
        <ResourcePips
          label="Надежда"
          current={effective.hope.value}
          max={effective.hope.max}
          tone="hope"
          filledMeansMarked={false}
          onChange={(next) => characterService.setHope(character.id, next)}
        />
        <ResourcePips
          label="Отмеченные Раны"
          current={character.hp.marked}
          max={character.hp.max}
          tone="hp"
          onChange={(next) => characterService.markSlots(character.id, 'hp', next - character.hp.marked)}
        />
        <ResourcePips
          label="Отмеченный Стресс"
          current={character.stress.marked}
          max={character.stress.max}
          tone="stress"
          onChange={(next) => characterService.markSlots(character.id, 'stress', next - character.stress.marked)}
        />
        <ResourcePips
          label="Ячейки Брони"
          current={character.armor.markedSlots}
          max={character.armor.score}
          tone="armor"
          onChange={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
        />
      </div>
      {allowStructureEdit && (
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
      )}
    </div>
  );
}
