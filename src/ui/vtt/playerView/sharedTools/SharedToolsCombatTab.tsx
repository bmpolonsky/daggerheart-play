/** @jsxImportSource preact */
import { Minus, Plus, Shield, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Adversary } from '@combat/lib/api';
import { buildEncounterSummary, calculateAdversaryCost, type DifficultyMode } from '@combat/lib/mechanics';
import { adversariesService } from '@combat/services/adversariesService';
import { encounterService } from '@combat/services/encounterService';
import type { EncounterBattleEntry } from '@combat/stores/encounter';
import { useStream } from '../../../../core/hooks/useStream';
import { sceneTableService } from '../../../../services/serviceRegistry';
import {
  AssetImage,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Notice,
  SearchField,
  SegmentedControl,
  SelectControl,
  Surface
} from '../../../components/common';
import { LibraryDetailPanel } from '../library/LibraryDetailPanel';
import type { LibraryEntry } from '../library/libraryDetailTypes';

const difficultyOptions: Array<{ value: DifficultyMode; label: string }> = [
  { value: 'easy', label: 'Легко' },
  { value: 'standard', label: 'Норма' },
  { value: 'hard', label: 'Сложно' }
];

function sourceLabel(adversary: Adversary) {
  if (adversary.isCustom) return 'Свой';
  if (adversary.sourceSlugs.includes('playtest-the-void')) return 'The Void';
  return 'Основная книга';
}

export function SharedToolsCombatTab() {
  adversariesService.ensureLoaded();
  encounterService.ensureHydrated();

  const adversariesState = useStream(adversariesService.adversaries$);
  const encounter = useStream(encounterService.encounter$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const [selectedAdversaryId, setSelectedAdversaryId] = useState<number | null>(null);
  const [detailMessage, setDetailMessage] = useState('');
  const [playerCountManuallyAdjusted, setPlayerCountManuallyAdjusted] = useState(false);
  const [clearEncounterOpen, setClearEncounterOpen] = useState(false);
  const { filteredItems, roleOptions } = adversariesService.buildBrowserView();
  const tierOptions = useMemo(
    () => Array.from(new Set(adversariesState.items.map((item) => item.tier))).sort((left, right) => left - right),
    [adversariesState.items]
  );
  const summary = buildEncounterSummary(encounter.entries, {
    playerCount: encounter.playerCount,
    difficultyMode: encounter.difficultyMode,
    isDamageBoosted: encounter.isDamageBoosted,
    isLowerTierUsed: encounter.isLowerTierUsed
  });
  const budgetPercent = summary.finalBudget > 0
    ? Math.min(100, Math.round((summary.totalCost / summary.finalBudget) * 100))
    : 0;
  const activeModifiers = summary.modifiers.filter((modifier) => modifier.active);
  const activeScene = sceneTable.scenes[sceneTable.activeSceneId];
  const scenePlayerCount = Math.min(8, new Set(
    (activeScene?.tokens ?? [])
      .filter((token) => token.actor.kind === 'character')
      .map((token) => token.actor.id)
  ).size);
  const selectedAdversary = adversariesState.items.find((item) => item.id === selectedAdversaryId) ?? null;
  const selectedEntry = selectedAdversary ? combatAdversaryEntry(selectedAdversary) : null;

  useEffect(() => {
    if (playerCountManuallyAdjusted || scenePlayerCount < 1 || scenePlayerCount === encounter.playerCount) return;
    encounterService.setPlayerCount(scenePlayerCount);
  }, [encounter.playerCount, playerCountManuallyAdjusted, scenePlayerCount]);

  return (
    <section className="player-tools-section player-tools-section--embedded-combat" aria-label="Бой">
      <div className={`player-combat-layout ${selectedEntry ? 'player-combat-layout--with-detail' : ''}`}>
        <Surface className="player-combat-catalog" padding="none">
          <header className="player-combat-panel-header">
            <div>
              <span>Противники</span>
            </div>
            {adversariesState.isLoading && <Badge tone="blue">Загрузка</Badge>}
          </header>

          <div className="player-combat-filters">
            <SearchField
              size="sm"
              placeholder="Поиск..."
              value={adversariesState.searchTerm}
              aria-label="Поиск противников"
              onInput={(event) => adversariesService.setSearchTerm(event.currentTarget.value)}
            />
            <SelectControl
              value={String(adversariesState.tierFilter)}
              aria-label="Фильтр ранга"
              onChange={(event) => {
                const value = event.currentTarget.value;
                adversariesService.setTierFilter(value === 'all' ? 'all' : Number(value));
              }}
            >
              <option value="all">Любой ранг</option>
              {tierOptions.map((tier) => <option key={tier} value={tier}>Ранг {tier}</option>)}
            </SelectControl>
            <SelectControl
              value={adversariesState.roleFilter}
              aria-label="Фильтр роли"
              onChange={(event) => adversariesService.setRoleFilter(event.currentTarget.value)}
            >
              <option value="all">Любая роль</option>
              {roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </SelectControl>
          </div>

          {adversariesState.error && <Notice tone="error">{adversariesState.error}</Notice>}

          <div className="player-combat-cards" aria-label="Список противников">
            {filteredItems.map((adversary) => (
              <AdversaryChoice
                key={adversary.id}
                adversary={adversary}
                selected={selectedAdversaryId === adversary.id}
                onSelect={() => {
                  setSelectedAdversaryId(adversary.id);
                  setDetailMessage('');
                }}
              />
            ))}
            {filteredItems.length === 0 && !adversariesState.isLoading && (
              <EmptyState
                tone="subtle"
                size="sm"
                icon={<Shield size={18} />}
                title="Ничего не найдено"
                body="Попробуйте другой поиск, ранг или роль."
              />
            )}
          </div>
        </Surface>

        {selectedEntry && (
          <div className="player-combat-detail">
            <LibraryDetailPanel
              actionMessage={detailMessage}
              entry={selectedEntry}
              onAction={setDetailMessage}
              onClose={() => {
                setSelectedAdversaryId(null);
                setDetailMessage('');
              }}
            />
          </div>
        )}

        <Surface className="player-combat-encounter" padding="none">
          <header className="player-combat-panel-header player-combat-panel-header--encounter">
            <div>
              <span>Состав боя</span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              iconBefore={<Trash2 size={14} />}
              disabled={encounter.entries.length === 0}
              onClick={() => setClearEncounterOpen(true)}
            >
              Очистить
            </Button>
          </header>

          <div className="player-combat-settings">
            <div className="player-combat-setting-row">
              <span>Размер группы</span>
              <div className="player-combat-stepper" aria-label="Количество героев">
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Уменьшить количество героев"
                  onClick={() => {
                    setPlayerCountManuallyAdjusted(true);
                    encounterService.setPlayerCount(encounter.playerCount - 1);
                  }}
                >
                  <Minus size={13} />
                </IconButton>
                <strong>{encounter.playerCount}</strong>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Увеличить количество героев"
                  onClick={() => {
                    setPlayerCountManuallyAdjusted(true);
                    encounterService.setPlayerCount(encounter.playerCount + 1);
                  }}
                >
                  <Plus size={13} />
                </IconButton>
              </div>
            </div>
            <SegmentedControl
              label="Сложность сцены"
              layout="equal"
              tone="gold"
              value={encounter.difficultyMode}
              options={difficultyOptions}
              onChange={(value) => encounterService.setDifficultyMode(value)}
            />
            <div className="player-combat-modifiers">
              <Checkbox
                size="sm"
                layout="row"
                label="Усиленный урон (+1d4 или +2)"
                meta="-2 ОБ"
                checked={encounter.isDamageBoosted}
                onChange={() => encounterService.toggleDamageBoosted()}
              />
              <Checkbox
                size="sm"
                layout="row"
                label="Враги ниже ранга"
                meta="+1 ОБ"
                checked={encounter.isLowerTierUsed}
                onChange={() => encounterService.toggleLowerTierUsed()}
              />
            </div>
          </div>

          <div className="player-combat-budget">
            <div className="player-combat-budget__top">
              <span className={`player-combat-difficulty player-combat-difficulty--${summary.difficulty.tone}`}>
                {summary.difficulty.label}
              </span>
              <span>{summary.totalModifiers >= 0 ? '+' : ''}{summary.totalModifiers} ОБ мод.</span>
            </div>
            <div className="player-combat-budget__bar" aria-hidden="true">
              <span style={{ width: `${budgetPercent}%` }} />
            </div>
            <div className="player-combat-budget__modifiers">
              {activeModifiers.map((modifier) => (
                <Badge key={modifier.id} tone={modifier.value < 0 ? 'danger' : 'success'}>
                  {modifier.value >= 0 ? '+' : ''}{modifier.value} {modifier.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="player-combat-entries" aria-label="Состав боя">
            {encounter.entries.map((entry) => <EncounterEntryCard key={entry.adversary.id} entry={entry} />)}
            {encounter.entries.length === 0 && (
              <EmptyState
                tone="subtle"
                size="sm"
                icon={<Users size={18} />}
                title="Состав пуст"
                body="Добавьте противников кнопками плюс в каталоге."
              />
            )}
          </div>
        </Surface>
      </div>
      {clearEncounterOpen && (
        <ConfirmDialog
          title="Очистить состав боя?"
          body="Все противники будут удалены из подготовленного состава. Это действие нельзя отменить."
          confirmLabel="Очистить"
          onCancel={() => setClearEncounterOpen(false)}
          onConfirm={() => {
            setClearEncounterOpen(false);
            encounterService.clear();
          }}
        />
      )}
    </section>
  );
}

function AdversaryChoice({ adversary, selected, onSelect }: { adversary: Adversary; selected: boolean; onSelect: () => void }) {
  const cost = calculateAdversaryCost(adversary.roleId);

  return (
    <article className={`player-combat-card ${selected ? 'dh-is-selected' : ''}`}>
      <Button
        className="player-combat-card__open"
        variant="ghost"
        aria-pressed={selected}
        aria-label={`Открыть описание: ${adversary.name}`}
        onClick={onSelect}
      >
        <div className="player-combat-card__media" aria-hidden="true">
          {adversary.image ? <AssetImage src={adversary.image} alt="" /> : <Shield size={28} />}
        </div>
        <div className="player-combat-card__body">
          <div className="player-combat-card__meta">
            <Badge tone={adversary.isCustom ? 'blue' : 'neutral'}>{sourceLabel(adversary)}</Badge>
            <span>{cost} ОБ</span>
          </div>
          <h3>{adversary.name}</h3>
          <p>{adversary.summary || 'Описание пока не заполнено.'}</p>
          <div className="player-combat-card__tags">
            <span>Ранг {adversary.tier}</span>
            <span>{adversary.roleName}</span>
          </div>
        </div>
      </Button>
      <IconButton
        className="player-combat-card__add"
        variant="primary"
        size="sm"
        tone="gold"
        aria-label={`Добавить ${adversary.name}`}
        title="Добавить в бой"
        onClick={() => encounterService.addAdversary(adversary)}
      >
        <Plus size={15} aria-hidden="true" />
      </IconButton>
    </article>
  );
}

function combatAdversaryEntry(adversary: Adversary): LibraryEntry {
  const attackBonus = Number(adversary.attackBonus);
  const signedAttack = Number.isFinite(attackBonus) && attackBonus >= 0 ? `+${adversary.attackBonus}` : adversary.attackBonus;
  const damage = adversary.damageDieCount > 0 && adversary.damageDieSize > 0
    ? `${adversary.damageDieCount}d${adversary.damageDieSize}${adversary.damageBonus > 0 ? `+${adversary.damageBonus}` : adversary.damageBonus < 0 ? adversary.damageBonus : ''}`
    : '—';
  const sections = [
    { title: 'Кратко', body: adversary.summary },
    {
      title: 'Боевые параметры',
      body: [
        `Роль: ${adversary.roleName}`,
        `Сложность: ${adversary.difficulty}`,
        `Раны: ${adversary.hp}`,
        `Стресс: ${adversary.stress}`,
        `Пороги: ${adversary.damageThresholds?.join(' / ') || '—'}`,
        `Бонус атаки: ${signedAttack}`,
        `Атака: ${adversary.weaponName || '—'}`,
        `Урон: ${damage} ${adversary.damageType}`,
        `Дистанция: ${adversary.attackRange || '—'}`
      ].join('\n')
    },
    { title: 'Мотивы и тактика', body: adversary.motives },
    { title: 'Опыт', body: adversary.experiences },
    { title: 'Описание', body: adversary.mainBody },
    {
      title: 'Особенности',
      body: adversary.features.map((feature) => `### ${feature.name}\n${feature.text}`).join('\n\n')
    }
  ].filter((section) => section.body.trim().length > 0);

  return {
    id: `combat-adversary-${adversary.id}`,
    title: adversary.name,
    kicker: `Ранг ${adversary.tier} / ${adversary.roleName}`,
    preview: adversary.summary,
    imageUrl: adversary.image,
    stats: [
      `Сложность ${adversary.difficulty}`,
      `Раны ${adversary.hp}`,
      `Стресс ${adversary.stress}`,
      `Атака ${signedAttack}`,
      `${adversary.weaponName || 'Урон'}: ${damage}`
    ],
    sections,
    actions: [{
      label: 'Добавить в бой',
      onClick: () => {
        encounterService.addAdversary(adversary);
        return `${adversary.name} добавлен в состав боя`;
      }
    }]
  };
}

function EncounterEntryCard({ entry }: { entry: EncounterBattleEntry }) {
  const adversary = entry.adversary;
  const cost = calculateAdversaryCost(adversary.roleId);

  return (
    <article className="player-combat-entry">
      <header>
        <div className="player-combat-entry__cost">{cost}</div>
        <div className="player-combat-entry__title">
          <strong>{adversary.name}</strong>
          <span>Ранг {adversary.tier} — {adversary.roleName}</span>
        </div>
        <div className="player-combat-stepper" aria-label={`Количество ${adversary.name}`}>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={`Уменьшить количество ${adversary.name}`}
            onClick={() => encounterService.updateCount(adversary.id, -1)}
          >
            <Minus size={13} />
          </IconButton>
          <strong>{entry.count}</strong>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={`Увеличить количество ${adversary.name}`}
            onClick={() => encounterService.updateCount(adversary.id, 1)}
          >
            <Plus size={13} />
          </IconButton>
        </div>
      </header>
    </article>
  );
}
