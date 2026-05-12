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
  isOpen?: boolean;
  onToggleOpen?: () => void;
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
        <button
          type="button"
          onClick={onDecrease}
          className="flex h-5 w-5 items-center justify-center rounded-sm border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          <IconMinus size={10} />
        </button>
        <span className="w-10 text-center font-mono text-xs text-white">
          {value}/{max}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          className="flex h-5 w-5 items-center justify-center rounded-sm border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          <IconPlus size={10} />
        </button>
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
  isOpen = true,
  onToggleOpen,
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
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900 p-4 shadow-xs">
        <button
          type="button"
          className="min-w-0 flex-1 text-left lg:hidden"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
        >
          <span className="block text-sm font-bold uppercase tracking-wider text-dagger-gold lg:text-slate-300">
            Бой
          </span>
          <span className="block truncate text-xs text-slate-500">
            {totalEntries} противников · {summary.totalCost}/{summary.finalBudget} ОБ
          </span>
        </button>
        <div className="hidden min-w-0 flex-1 lg:block">
          <span className="block text-sm font-bold uppercase tracking-wider text-slate-300">
            Бой
          </span>
          <span className="block truncate text-xs text-slate-500">
            {totalEntries} противников · {summary.totalCost}/{summary.finalBudget} ОБ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowModifiers(!showModifiers)}
            className={`rounded-sm p-2 transition-colors ${
              showModifiers
                ? "bg-slate-800 text-dagger-gold"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Настройки боя"
          >
            <IconSettings size={18} />
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-sm p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
              title="Очистить бой"
            >
              <IconRefresh size={18} />
            </button>
          )}
          {onToggleOpen && (
            <button
              type="button"
              onClick={onToggleOpen}
              className="rounded-sm p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
              title={isOpen ? "Свернуть бой" : "Открыть бой"}
              aria-label={isOpen ? "Свернуть бой" : "Открыть бой"}
              aria-expanded={isOpen}
            >
              {isOpen ? <IconMinus size={18} /> : <IconPlus size={18} />}
            </button>
          )}
        </div>
      </div>

      {showModifiers && (
        <div className="animate-in slide-in-from-top-2 space-y-4 border-b border-slate-700 bg-slate-800/50 p-4 duration-200">
          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Настройка сложности
            </span>
            <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => onSetDifficultyMode("easy")}
                className={`flex-1 rounded-sm py-1 text-xs font-medium transition-colors ${
                  difficultyMode === "easy"
                    ? "bg-green-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Легкий (-1)
              </button>
              <button
                type="button"
                onClick={() => onSetDifficultyMode("standard")}
                className={`flex-1 rounded-sm py-1 text-xs font-medium transition-colors ${
                  difficultyMode === "standard"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Норма
              </button>
              <button
                type="button"
                onClick={() => onSetDifficultyMode("hard")}
                className={`flex-1 rounded-sm py-1 text-xs font-medium transition-colors ${
                  difficultyMode === "hard"
                    ? "bg-orange-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Сложный (+2)
              </button>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Ручные модификаторы
            </span>
            <div className="space-y-2">
              <label className="group flex cursor-pointer items-center justify-between text-sm text-slate-300">
                <span className="transition-colors group-hover:text-white">
                  Усиленный урон (+1d4 или +2)
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-red-400">-2 ОБ</span>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-sm border transition-colors ${
                      isDamageBoosted
                        ? "border-dagger-gold bg-dagger-gold text-dagger-dark"
                        : "border-slate-600 bg-slate-900"
                    }`}
                    onClick={onToggleDamageBoosted}
                  >
                    {isDamageBoosted && "✓"}
                  </div>
                </div>
              </label>
              <label className="group flex cursor-pointer items-center justify-between text-sm text-slate-300">
                <span className="transition-colors group-hover:text-white">
                  Враги низкого ранга
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-green-400">+1 ОБ</span>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-sm border transition-colors ${
                      isLowerTierUsed
                        ? "border-dagger-gold bg-dagger-gold text-dagger-dark"
                        : "border-slate-600 bg-slate-900"
                    }`}
                    onClick={onToggleLowerTierUsed}
                  >
                    {isLowerTierUsed && "✓"}
                  </div>
                </div>
              </label>
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
              <div
                key={entry.adversary.id}
                className="rounded-sm border border-slate-700 bg-slate-800 p-3 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenDetails(entry.adversary.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-dagger-gold/30 bg-dagger-dark text-sm font-bold text-dagger-gold shadow-inner transition-colors hover:bg-slate-700"
                    title="Посмотреть свойства"
                  >
                    {cost}
                  </button>

                  <div className="min-w-0 grow">
                    <div
                      className="truncate pr-1 text-sm font-medium text-slate-200 transition-colors hover:text-dagger-gold"
                      onClick={() => onOpenDetails(entry.adversary.id)}
                    >
                      {entry.adversary.name}
                    </div>
                    <div className="truncate text-xs capitalize text-slate-500">
                      {entry.adversary.roleName}
                      {entry.count > 1 ? ` • x${entry.count}` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 rounded-sm border border-slate-700 bg-slate-900 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => onUpdateCount(entry.adversary.id, -1)}
                      className="p-1 text-slate-400 transition-colors hover:text-red-400"
                      title="Уменьшить / Удалить"
                    >
                      <IconMinus size={14} />
                    </button>
                    <span className="w-5 select-none text-center text-sm font-mono text-white">
                      {entry.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateCount(entry.adversary.id, 1)}
                      className="p-1 text-slate-400 transition-colors hover:text-green-400"
                      title="Увеличить"
                    >
                      <IconPlus size={14} />
                    </button>
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

              </div>
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
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 shadow-xs">
            <button
              type="button"
              onClick={() => onSetPlayerCount(Math.max(1, playerCount - 1))}
              className="p-1 text-slate-400 transition-colors hover:text-white"
            >
              <IconMinus size={16} />
            </button>
            <span className="w-6 select-none text-center text-lg font-bold text-white">
              {playerCount}
            </span>
            <button
              type="button"
              onClick={() => onSetPlayerCount(playerCount + 1)}
              className="p-1 text-slate-400 transition-colors hover:text-white"
            >
              <IconPlus size={16} />
            </button>
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
