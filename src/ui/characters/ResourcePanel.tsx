import { NumberField } from '../components/common/Field';
import { ResourcePips } from '../components/common/ResourcePips';
import { buildEffectiveCharacterStats } from '../../domain/rules/effects';
import type { Character } from '../../domain/rules/types';
import { gameService, characterService } from '../../services/serviceRegistry';
import { useStream } from '../../core/hooks/useStream';
import styles from './ResourcePanel.module.css';

export function ResourcePanel({ character, allowStructureEdit = false }: { character: Character; allowStructureEdit?: boolean }) {
  const game = useStream(gameService.game$);
  const effective = buildEffectiveCharacterStats(character);
  return (
    <div className={`stack gap-lg ${styles.panel}`}>
      <div className={`resource-grid ${styles.tracks}`}>
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
          current={effective.hp.marked}
          max={effective.hp.max}
          tone="hp"
          onChange={(next) => characterService.markSlots(character.id, 'hp', next - character.hp.marked)}
        />
        <ResourcePips
          label="Отмеченный Стресс"
          current={effective.stress.marked}
          max={effective.stress.max}
          tone="stress"
          onChange={(next) => characterService.markSlots(character.id, 'stress', next - character.stress.marked)}
        />
        <ResourcePips
          label="Ячейки Брони"
          current={Math.min(character.armor.markedSlots, effective.armorScore)}
          max={effective.armorScore}
          tone="armor"
          onChange={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
        />
      </div>
      {allowStructureEdit && (
        <div className={styles.baseFields}>
          <NumberField
            label="Базовый максимум Ран"
            value={character.hp.max}
            onChange={(event) => characterService.updateResourceMax(character.id, 'hp', Number(event.currentTarget.value))}
          />
          <NumberField
            label="Базовый максимум Стресса"
            value={character.stress.max}
            onChange={(event) => characterService.updateResourceMax(character.id, 'stress', Number(event.currentTarget.value))}
          />
          <NumberField
            label="Базовый максимум Надежды"
            value={character.hope.max}
            onChange={(event) => characterService.updateResourceMax(character.id, 'hope', Number(event.currentTarget.value))}
          />
          {game.showLegacyActionTokens && (
            <NumberField
              label="Жетоны действия"
              value={character.actionTokens}
              onChange={(event) => characterService.setActionTokens(character.id, Number(event.currentTarget.value))}
            />
          )}
          <small className={styles.hint}>Максимумы без бонусов свойств. Итоги показаны в шкалах выше.</small>
        </div>
      )}
    </div>
  );
}
