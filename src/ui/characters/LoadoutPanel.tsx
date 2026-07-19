import { Trash2 } from 'lucide-react';
import { Button } from '../components/common/Button';
import { NumberField, SelectField, TextAreaField, TextField } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import { RichChoicePicker } from '../components/common/RichChoicePicker';
import { DAMAGE_TYPE_LABELS, DOMAIN_LABELS, RANGES, TRAITS, TRAIT_LABELS, rangeLabel } from '../../domain/rules/constants';
import type { ContentState, GenericLibraryItem, LibraryEquipmentItem } from '../../domain/content/types';
import { cleanRulesText, domainCardFromLibrary, isDomainCardForDomains } from '../../domain/characterBuilder';
import { buildEquipmentAttachmentPlan } from '../../domain/rules/equipment';
import type { Character, DamageType, TraitId } from '../../domain/rules/types';
import { useStream } from '../../core/hooks/useStream';
import { characterService, gameService } from '../../services/serviceRegistry';

export function LoadoutPanel({ character, content }: { character: Character; content?: ContentState }) {
  const game = useStream(gameService.game$);
  const weaponOptions = content?.equipment.filter((item) => item.type === 'primary-weapon' || item.type === 'secondary-weapon') ?? [];
  const inventoryOptions = content?.equipment.filter((item) => item.type === 'consumable' || item.type === 'item' || item.type === 'combat-wheelchair') ?? [];
  const domainCardOptions = (content?.generic.domainCards ?? [])
    .filter((item) => isDomainCardForDomains(item, character.domains))
    .filter((item) => cardLevel(item) <= character.level);

  return (
    <div className="stack gap-lg">
      <section className="stack">
        <div className="row-between">
          <h3>Оружие и атаки</h3>
          <div className="character-editor-toolbar">
            {weaponOptions.length > 0 && (
              <RichChoicePicker
                label="Добавить оружие"
                value=""
                placeholder="Из каталога"
                items={weaponOptions.map(equipmentPickerItem)}
                onChange={(itemId) => addEquipmentFromCatalog(character.id, weaponOptions, itemId)}
              />
            )}
            <Button onClick={() => characterService.addWeapon(character.id)}>+ Своя атака</Button>
          </div>
        </div>
        {character.weapons.map((weapon, index) => (
          <details className="character-editor-item" key={weapon.id} open={index === 0}>
            <summary>
              <strong>{weaponLabel(weapon.name)}</strong>
              <span>{TRAIT_LABELS[weapon.trait]} — {rangeLabel(weapon.range)} — {weapon.damageFormula}</span>
            </summary>
            <div className="character-editor-item__fields">
            <div className="grid-5">
              {weaponOptions.length > 0 ? (
                <RichChoicePicker
                  label="Оружие"
                  value={equipmentIdByName(weaponOptions, weapon.name)}
                  placeholder={weaponLabel(weapon.name)}
                  items={weaponOptions.map(equipmentPickerItem)}
                  onChange={(itemId) => updateWeaponFromCatalog(character.id, weapon.id, weaponOptions, itemId)}
                />
              ) : (
                <TextField
                  label="Название"
                  value={weaponLabel(weapon.name)}
                  onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { name: event.currentTarget.value })}
                />
              )}
              <SelectField
                label="Характеристика"
                value={weapon.trait}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { trait: event.currentTarget.value as TraitId })}
              >
                {TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.label}</option>)}
              </SelectField>
              <SelectField
                label="Дистанция"
                value={weapon.range}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { range: event.currentTarget.value })}
              >
                {RANGES.map((range) => <option key={range} value={range}>{rangeLabel(range)}</option>)}
              </SelectField>
              <TextField
                label="Урон"
                value={weapon.damageFormula}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { damageFormula: event.currentTarget.value })}
              />
              <SelectField
                label="Тип"
                value={weapon.damageType}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { damageType: event.currentTarget.value as DamageType })}
              >
                {Object.entries(DAMAGE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
            </div>
            <div className="grid-3">
              <SelectField
                label="Занятость"
                value={weapon.burden ?? ''}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { burden: (event.currentTarget.value || null) as typeof weapon.burden })}
              >
                <option value="">Не указано</option>
                <option value="one-handed">Одноручное</option>
                <option value="two-handed">Двуручное</option>
              </SelectField>
              <TextField
                label="Свойство"
                value={weapon.featureText ?? weapon.notes ?? ''}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { featureText: event.currentTarget.value, notes: event.currentTarget.value })}
              />
              <TextField
                label="Источник"
                value={weapon.sourceSlug ?? ''}
                onChange={(event) => characterService.updateWeapon(character.id, weapon.id, { sourceSlug: event.currentTarget.value || undefined })}
              />
            </div>
            {hasTwoHandedConflict(character.weapons, weapon.id) && (
              <p className="form-hint">Двуручное оружие обычно занимает обе руки. Проверьте второе оружие вручную.</p>
            )}
            <div className="row-end">
              <IconButton variant="danger" size="sm" type="button" title="Удалить атаку" aria-label={`Удалить атаку ${weapon.name}`} onClick={() => characterService.removeWeapon(character.id, weapon.id)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>
            </div>
          </details>
        ))}
      </section>

      <section className="stack">
        <div className="row-between">
          <h3>Карты доменов / способности</h3>
          <div className="character-editor-toolbar">
            {domainCardOptions.length > 0 && (
              <RichChoicePicker
                label="Добавить карту домена"
                value=""
                placeholder="Из доступных доменов"
                items={domainCardOptions.map(domainCardPickerItem)}
                onChange={(itemId) => addDomainCardFromCatalog(character.id, domainCardOptions, itemId)}
              />
            )}
          </div>
        </div>
        {character.domainCards.map((card) => (
          <div key={card.id} className="domain-card-row">
            {domainCardOptions.length > 0 ? (
              <RichChoicePicker
                label="Карта"
                value={domainCardIdByRecord(domainCardOptions, card.sourceId, card.name)}
                placeholder={card.name || 'Карта не из каталога'}
                items={domainCardOptions.map(domainCardPickerItem)}
                onChange={(itemId) => updateDomainCardFromCatalog(character.id, card.id, domainCardOptions, itemId)}
              />
            ) : (
              <strong>{card.name}</strong>
            )}
            <span>{DOMAIN_LABELS[card.domain] ?? card.domain}</span>
            <span>Ур. {card.level}</span>
            <span>{card.cost ? `Цена ${card.cost}` : 'Без цены'}</span>
            <IconButton variant="danger" size="sm" type="button" title="Удалить карту" aria-label={`Удалить карту ${card.name}`} onClick={() => characterService.removeDomainCard(character.id, card.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
      </section>

      <section className="stack">
        <div className="row-between">
          <h3>Инвентарь</h3>
          <div className="character-editor-toolbar">
            {inventoryOptions.length > 0 && (
              <RichChoicePicker
                label="Добавить предмет"
                value=""
                placeholder="Из каталога"
                items={inventoryOptions.map(equipmentPickerItem)}
                onChange={(itemId) => addEquipmentFromCatalog(character.id, inventoryOptions, itemId)}
              />
            )}
            <Button onClick={() => characterService.addInventoryItem(character.id)}>+ Свой предмет</Button>
          </div>
        </div>
        <div className="character-editor-money">
          <h3>Деньги</h3>
          <div className={game.showCoins ? 'grid-4' : 'grid-3'}>
            {game.showCoins && (
              <NumberField
                label="Монеты"
                min={0}
                max={9}
                value={character.wealth.coins}
                hint="Опциональная деноминация."
                onChange={(event) => characterService.updateWealth(character.id, { coins: Number(event.currentTarget.value) })}
              />
            )}
            <NumberField
              label="Горсти"
              min={0}
              max={9}
              value={character.wealth.handfuls}
              onChange={(event) => characterService.updateWealth(character.id, { handfuls: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="Мешки"
              min={0}
              max={9}
              value={character.wealth.bags}
              onChange={(event) => characterService.updateWealth(character.id, { bags: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="Сундуки"
              min={0}
              max={1}
              value={character.wealth.chests}
              onChange={(event) => characterService.updateWealth(character.id, { chests: Number(event.currentTarget.value) })}
            />
          </div>
        </div>
        {character.inventory.map((item, index) => (
          <details className="character-editor-item" key={item.id} open={index === 0}>
            <summary>
              <strong>{item.name || 'Предмет без названия'}</strong>
              <span>{inventoryKindLabel(item.kind)} — {item.quantity} шт.</span>
            </summary>
            <div className="character-editor-item__fields">
            <div className="grid-5">
              <TextField
                label="Название"
                value={item.name}
                onChange={(event) => characterService.updateInventoryItem(character.id, item.id, { name: event.currentTarget.value })}
              />
              <SelectField
                label="Тип"
                value={item.kind}
                onChange={(event) => characterService.updateInventoryItem(character.id, item.id, { kind: event.currentTarget.value as typeof item.kind })}
              >
                <option value="consumable">Расходник</option>
                <option value="item">Предмет</option>
                <option value="custom">Другое</option>
              </SelectField>
              <NumberField
                label="Количество"
                value={item.quantity}
                min={0}
                onChange={(event) => characterService.updateInventoryItem(character.id, item.id, { quantity: Number(event.currentTarget.value) })}
              />
              <NumberField
                label="Использований"
                value={item.uses?.max ?? 0}
                min={0}
                onChange={(event) => {
                  const max = Number(event.currentTarget.value);
                  characterService.updateInventoryItem(character.id, item.id, { uses: max > 0 ? { current: Math.min(item.uses?.current ?? max, max), max } : undefined });
                }}
              />
              <TextField
                label="Источник"
                value={item.sourceSlug ?? ''}
                onChange={(event) => characterService.updateInventoryItem(character.id, item.id, { sourceSlug: event.currentTarget.value || undefined })}
              />
            </div>
            <TextAreaField
              label="Описание"
              value={item.text ?? ''}
              onChange={(event) => characterService.updateInventoryItem(character.id, item.id, { text: event.currentTarget.value })}
            />
            <div className="row-end">
              <IconButton variant="danger" size="sm" type="button" title="Удалить предмет" aria-label={`Удалить предмет ${item.name}`} onClick={() => characterService.removeInventoryItem(character.id, item.id)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}

function addEquipmentFromCatalog(characterId: string, items: LibraryEquipmentItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) {
    characterService.addEquipmentItem(characterId, item);
  }
}

function updateWeaponFromCatalog(characterId: string, weaponId: string, items: LibraryEquipmentItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const plan = buildEquipmentAttachmentPlan(item);
  if (plan.weapon) {
    characterService.updateWeapon(characterId, weaponId, plan.weapon);
  }
}

function addDomainCardFromCatalog(characterId: string, items: GenericLibraryItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) {
    characterService.addDomainCard(characterId, domainCardFromLibrary(item, true));
  }
}

function updateDomainCardFromCatalog(characterId: string, cardId: string, items: GenericLibraryItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) {
    characterService.updateDomainCard(characterId, cardId, domainCardFromLibrary(item, true));
  }
}

function equipmentIdByName(items: LibraryEquipmentItem[], name: string): string {
  return items.find((item) => item.name === name)?.id ?? '';
}

function domainCardIdByRecord(items: GenericLibraryItem[], sourceId: string | number | undefined, name: string): string {
  const source = sourceId === undefined ? null : String(sourceId);
  return items.find((item) => String(item.sourceId ?? item.id) === source || item.name === name)?.id ?? '';
}

function cardLevel(item: GenericLibraryItem): number {
  return Number(item.level ?? item.raw.level ?? 1) || 1;
}

function equipmentPickerItem(item: LibraryEquipmentItem) {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.typeName,
    description: cleanRulesText([item.featureText, typeof item.raw.main_body === 'string' ? item.raw.main_body : ''].filter(Boolean).join('\n\n')),
    imageUrl: item.imageUrl
  };
}

function domainCardPickerItem(item: GenericLibraryItem) {
  const card = domainCardFromLibrary(item, true);
  return {
    id: item.id,
    title: card.name,
    subtitle: `${DOMAIN_LABELS[card.domain] ?? card.domain} — уровень ${card.level}${card.cost ? ` — цена ${card.cost}` : ''}`,
    description: cleanRulesText(card.text),
    imageUrl: card.imageUrl
  };
}

function weaponLabel(name: string): string {
  const labels: Record<string, string> = {
    'Primary Weapon': 'Основное оружие',
    'Secondary Weapon': 'Запасное оружие',
    'Standard Attack': 'Обычная атака'
  };
  return labels[name] ?? name;
}

function inventoryKindLabel(kind: Character['inventory'][number]['kind']): string {
  if (kind === 'consumable') return 'Расходник';
  if (kind === 'item') return 'Предмет';
  return 'Другое';
}

function hasTwoHandedConflict(weapons: Character['weapons'], weaponId: string): boolean {
  const weapon = weapons.find((item) => item.id === weaponId);
  return weapon?.burden === 'two-handed' && weapons.length > 1;
}
