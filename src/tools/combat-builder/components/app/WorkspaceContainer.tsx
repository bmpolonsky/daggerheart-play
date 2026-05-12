/** @jsxImportSource preact */
import { EncounterPanel } from "@combat/components/encounter/EncounterPanel";
import { useStore } from "@combat/lib/store";
import { buildEncounterSummary } from "@combat/lib/mechanics";
import { adversariesService } from "@combat/services/adversariesService";
import { encounterService } from "@combat/services/encounterService";
import { encounterStore } from "@combat/stores/encounter";

export function WorkspaceContainer() {
  const {
    entries,
    playerCount,
    difficultyMode,
    isDamageBoosted,
    isLowerTierUsed,
    isSidebarOpen,
  } = useStore(encounterStore);

  const summary = buildEncounterSummary(entries, {
    playerCount,
    difficultyMode,
    isDamageBoosted,
    isLowerTierUsed,
  });

  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => encounterService.setSidebarOpen(false)}
        />
      )}

      <aside
        className={`combat-encounter-sheet fixed inset-y-0 right-0 z-30 flex h-full w-80 transform flex-col border-l border-slate-700 bg-dagger-panel shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:w-96 ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <EncounterPanel
          entries={entries}
          summary={summary}
          playerCount={playerCount}
          difficultyMode={difficultyMode}
          isDamageBoosted={isDamageBoosted}
          isLowerTierUsed={isLowerTierUsed}
          onOpenDetails={(id) => adversariesService.openDetails(id)}
          onUpdateCount={(id, delta) => encounterService.updateCount(id, delta)}
          onAdjustHp={(id, unitId, delta) => encounterService.adjustHp(id, unitId, delta)}
          onAdjustStress={(id, unitId, delta) =>
            encounterService.adjustStress(id, unitId, delta)
          }
          onClear={() => encounterService.clear()}
          onSetPlayerCount={(count) => encounterService.setPlayerCount(count)}
          onSetDifficultyMode={(mode) => encounterService.setDifficultyMode(mode)}
          onToggleDamageBoosted={() => encounterService.toggleDamageBoosted()}
          onToggleLowerTierUsed={() => encounterService.toggleLowerTierUsed()}
        />
      </aside>
    </>
  );
}
