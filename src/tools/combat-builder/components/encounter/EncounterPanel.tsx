/** @jsxImportSource preact */
import { useMemo, useState } from "preact/hooks";
import type { DifficultyMode, EncounterSummary } from "@combat/lib/mechanics";
import { calculateAdversaryCost } from "@combat/lib/mechanics";
import type { EncounterBattleEntry } from "@combat/stores/encounter";
import {
  IconInfo,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconUsers,
} from "@combat/components/icons";
import { Button } from "../../../../ui/components/common/Button";
import { Checkbox } from "../../../../ui/components/common/Checkbox";
import { IconButton } from "../../../../ui/components/common/IconButton";
import { Surface } from "../../../../ui/components/common/Surface";
import { TabButton, Tabs } from "../../../../ui/components/common/Tabs";

interface EncounterPanelProps {
  entries: EncounterBattleEntry[];
  summary: EncounterSummary;
  playerCount: number;
  difficultyMode: DifficultyMode;
  isDamageBoosted: boolean;
  isLowerTierUsed: boolean;
  onOpenDetails: (id: number) => void;
  onUpdateCount: (id: number, delta: number) => void;
  onAdjustHp: (id: number, unitId: string, delta: number) => void;
  onAdjustStress: (id: number, unitId: string, delta: number) => void;
  onClear: () => void;
  onSetPlayerCount: (count: number) => void;
  onSetDifficultyMode: (mode: DifficultyMode) => void;
  onToggleDamageBoosted: () => void;
  onToggleLowerTierUsed: () => void;
}

function getDifficultyColor(tone: EncounterSummary["difficulty"]["tone"]) {
  if (tone === "quiet") return "text-gray-400";
  if (tone === "good") return "text-green-400";
  if (tone === "balanced") return "text-dagger-gold";
  if (tone === "warning") return "text-orange-500";
  if (tone === "danger") return "text-red-500";
  return "text-purple-500";
}

function progressWidth(finalBudget: number, totalCost: number) {
  return `${Math.min(100, (totalCost / (Math.max(1, finalBudget) * 1.5)) * 100)}%`;
}

interface TrackProps {
  label: string;
  labelClassName?: string;
  value: number;
  max: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

function Track({
  label,
  labelClassName,
  value,
  max,
  onDecrease,
  onIncrease,
}: TrackProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] uppercase tracking-wider ${labelClassName ?? "text-slate-400"}`}>
        {label}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          type="button"
          onClick={onDecrease}
          size="xs"
          variant="ghost"
          title={`Уменьшить ${label.toLowerCase()}`}
          aria-label={`Уменьшить ${label.toLowerCase()}`}
        >
          <IconMinus size={10} />
        </IconButton>
        <span className="w-10 text-center font-mono text-xs text-white">
          {value}/{max}
        </span>
        <IconButton
          type="button"
          onClick={onIncrease}
          size="xs"
          variant="ghost"
          title={`Увеличить ${label.toLowerCase()}`}
          aria-label={`Увеличить ${label.toLowerCase()}`}
        >
          <IconPlus size={10} />
        </IconButton>
      </div>
    </div>
  );
}

export function EncounterPanel({
  entries,
  summary,
  playerCount,
  difficultyMode,
  isDamageBoosted,
  isLowerTierUsed,
  onOpenDetails,
  onUpdateCount,
  onAdjustHp,
  onAdjustStress,
  onClear,
  onSetPlayerCount,
  onSetDifficultyMode,
  onToggleDamageBoosted,
  onToggleLowerTierUsed,
}: EncounterPanelProps) {
  const [showModifiers, setShowModifiers] = useState(true);
  const totalEntries = entries.reduce((sum, entry) => sum + entry.count, 0);

  const autoModifiers = useMemo(
    () => ({
      multipleSolos: summary.modifiers.some(
        (modifier) => modifier.id === "multiple-solos" && modifier.active
      ),
      noHeavies: summary.modifiers.some(
        (modifier) => modifier.id === "no-heavies" && modifier.active
      ),
    }),
    [summary.modifiers]
  );

  return (
    <div className="combat-encounter-panel flex h-full w-full flex-col bg-dagger-panel">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 p-4 shadow-xs">
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-bold uppercase tracking-wider text-slate-300">
            Бой
          </span>
          <span className="block truncate text-xs text-slate-500">
            {totalEntries} противников · {summary.totalCost}/{summary.finalBudget} ОБ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            onClick={() => setShowModifiers(!showModifiers)}
            variant={showModifiers ? "primary" : "ghost"}
            size="sm"
            title="Настройки боя"
            aria-label="Настройки боя"
            aria-pressed={showModifiers}
          >
            <IconSettings size={18} />
          </IconButton>
          {entries.length > 0 && (
            <IconButton
              type="button"
              onClick={onClear}
              variant="danger"
              size="sm"
              title="Очистить бой"
              aria-label="Очистить бой"
            >
              <IconRefresh size={18} />
            </IconButton>
          )}
        </div>
      </div>

      {showModifiers && (
        <div className="animate-in slide-in-from-top-2 space-y-4 border-b border-slate-700 bg-slate-800/50 p-4 duration-200">
          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Настройка сложности
            </span>
            <Tabs className="combat-difficulty-tabs" layout="equal" label="Настройка сложности">
              <TabButton
                type="button"
                onClick={() => onSetDifficultyMode("easy")}
                active={difficultyMode === "easy"}
              >
                Легкий (-1)
              </TabButton>
              <TabButton
                type="button"
                onClick={() => onSetDifficultyMode("standard")}
                active={difficultyMode === "standard"}
              >
                Норма
              </TabButton>
              <TabButton
                type="button"
                onClick={() => onSetDifficultyMode("hard")}
                active={difficultyMode === "hard"}
              >
                Сложный (+2)
              </TabButton>
            </Tabs>
          </div>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Ручные модификаторы
            </span>
            <div className="space-y-2">
              <Checkbox
                className="combat-modifier-checkbox"
                checked={isDamageBoosted}
                onChange={onToggleDamageBoosted}
                label="Усиленный урон (+1d4 или +2)"
                meta={<span className="font-mono text-xs text-red-400">-2 ОБ</span>}
              />
              <Checkbox
                className="combat-modifier-checkbox"
                checked={isLowerTierUsed}
                onChange={onToggleLowerTierUsed}
                label="Враги низкого ранга"
                meta={<span className="font-mono text-xs text-green-400">+1 ОБ</span>}
              />
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Авто-модификаторы
            </span>
            <div className="space-y-2">
              <div
                className={`flex items-center justify-between text-sm ${
                  autoModifiers.multipleSolos ? "text-dagger-gold" : "text-slate-600"
                }`}
              >
                <span>2+ Одиночки (Solo)</span>
                <span className="font-mono text-xs">-2 ОБ</span>
              </div>
              <div
                className={`flex items-center justify-between text-sm ${
                  autoModifiers.noHeavies ? "text-dagger-gold" : "text-slate-600"
                }`}
              >
                <span>Нет тяжелых типов</span>
                <span className="font-mono text-xs">+1 ОБ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="custom-scrollbar grow space-y-3 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <div className="mx-2 rounded-lg border-2 border-dashed border-slate-800 py-12 text-center italic text-slate-600">
            <p>Противники не выбраны.</p>
            <p className="mt-2 text-xs text-slate-700">
              Нажмите "Добавить в бой" на карточках.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const cost = calculateAdversaryCost(entry.adversary.roleId);
            return (
              <Surface
                key={entry.adversary.id}
                tone="subtle"
                padding="sm"
              >
                <div className="flex items-start gap-3">
                  <Button
                    type="button"
                    onClick={() => onOpenDetails(entry.adversary.id)}
                    size="iconSm"
                    variant="secondary"
                    title="Посмотреть свойства"
                    aria-label="Посмотреть свойства"
                    className="shrink-0"
                  >
                    {cost}
                  </Button>

                  <div className="min-w-0 grow">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      fullWidth
                      className="justify-start"
                      onClick={() => onOpenDetails(entry.adversary.id)}
                    >
                      <span className="min-w-0 truncate">{entry.adversary.name}</span>
                    </Button>
                    <div className="truncate text-xs capitalize text-slate-500">
                      {entry.adversary.roleName}
                      {entry.count > 1 ? ` • x${entry.count}` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      type="button"
                      onClick={() => onUpdateCount(entry.adversary.id, -1)}
                      size="xs"
                      variant="ghost"
                      title="Уменьшить / Удалить"
                      aria-label="Уменьшить / Удалить"
                    >
                      <IconMinus size={14} />
                    </IconButton>
                    <span className="w-5 select-none text-center text-sm font-mono text-white">
                      {entry.count}
                    </span>
                    <IconButton
                      type="button"
                      onClick={() => onUpdateCount(entry.adversary.id, 1)}
                      size="xs"
                      variant="ghost"
                      title="Увеличить"
                      aria-label="Увеличить"
                    >
                      <IconPlus size={14} />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5">
                  {entry.instances.map((instance) => (
                    <div key={instance.id} className="grid gap-2 sm:grid-cols-2">
                        <Track
                          label="Раны"
                          labelClassName="text-red-300"
                          value={instance.currentHp}
                          max={entry.adversary.hp}
                          onDecrease={() => onAdjustHp(entry.adversary.id, instance.id, -1)}
                          onIncrease={() => onAdjustHp(entry.adversary.id, instance.id, 1)}
                        />
                        <Track
                          label="Стресс"
                          labelClassName="text-yellow-300"
                          value={instance.currentStress}
                          max={entry.adversary.stress}
                          onDecrease={() =>
                            onAdjustStress(entry.adversary.id, instance.id, -1)
                          }
                          onIncrease={() => onAdjustStress(entry.adversary.id, instance.id, 1)}
                        />
                    </div>
                  ))}
                </div>

              </Surface>
            );
          })
        )}
      </div>

      <div className="relative z-10 shrink-0 border-t border-dagger-gold/20 bg-slate-900 p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <IconUsers size={18} />
            <span className="text-sm font-medium">Размер группы</span>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              type="button"
              onClick={() => onSetPlayerCount(Math.max(1, playerCount - 1))}
              size="xs"
              variant="ghost"
              aria-label="Уменьшить размер группы"
            >
              <IconMinus size={16} />
            </IconButton>
            <span className="w-6 select-none text-center text-lg font-bold text-white">
              {playerCount}
            </span>
            <IconButton
              type="button"
              onClick={() => onSetPlayerCount(playerCount + 1)}
              size="xs"
              variant="ghost"
              aria-label="Увеличить размер группы"
            >
              <IconPlus size={16} />
            </IconButton>
          </div>
        </div>

        {summary.totalModifiers !== 0 && (
          <div className="mb-2 flex justify-between border-t border-dashed border-slate-800 pt-2 text-xs text-slate-500">
            <span>База: {summary.baseBudget}</span>
            <span className={summary.totalModifiers > 0 ? "text-green-500" : "text-red-500"}>
              {summary.totalModifiers > 0 ? "+" : ""}
              {summary.totalModifiers} Мод.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-sm font-medium text-slate-400">Очки боя (ОБ)</span>
            <div className="flex items-baseline gap-1 text-right">
              <span
                className={`font-display text-3xl font-bold drop-shadow-xs ${getDifficultyColor(
                  summary.difficulty.tone
                )}`}
              >
                {summary.totalCost}
              </span>
              <span className="text-xl font-light text-slate-600">/</span>
              <span className="font-mono text-xl text-slate-400">{summary.finalBudget}</span>
            </div>
          </div>

          <div className="relative h-3 overflow-hidden rounded-full border border-slate-700 bg-slate-800 shadow-inner">
            <div
              className="absolute bottom-0 top-0 z-10 w-0.5 bg-white/50 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
              style={{ left: `${Math.min(100, (1 / 1.5) * 100)}%` }}
            />
            <div
              className={`relative h-full transition-all duration-500 ease-out ${
                summary.totalCost > summary.finalBudget
                  ? "bg-gradient-to-r from-orange-500 to-red-600"
                  : "bg-gradient-to-r from-dagger-gold to-yellow-300"
              }`}
              style={{ width: progressWidth(summary.finalBudget, summary.totalCost) }}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <IconInfo size={12} />
              <span>Бюджет: {summary.finalBudget}</span>
            </div>
            <span
              className={`rounded-sm border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getDifficultyColor(
                summary.difficulty.tone
              )}`}
            >
              {summary.difficulty.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
