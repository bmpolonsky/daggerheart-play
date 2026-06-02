/** @jsxImportSource preact */
import { useMemo } from "preact/hooks";
import { SidebarContainer } from "@combat/components/app/SidebarContainer";
import { WorkspaceContainer } from "@combat/components/app/WorkspaceContainer";
import { AdversaryDetailsModal } from "@combat/components/adversaries/AdversaryDetailsModal";
import { CustomAdversaryEditorHost } from "@combat/components/adversaries/CustomAdversaryEditorHost";
import { useStore } from "../../core/hooks/useStore";
import { adversariesService } from "@combat/services/adversariesService";
import { encounterService } from "@combat/services/encounterService";
import { customAdversaryEditorService } from "@combat/services/customAdversaryEditorService";
import { adversariesStore } from "@combat/stores/adversaries";
import { encounterStore } from "@combat/stores/encounter";

export default function App({ embedded = false }: { embedded?: boolean }) {
  adversariesService.ensureLoaded();
  encounterService.ensureHydrated();

  const { items, selectedAdversaryId } = useStore(adversariesStore);
  const { entries } = useStore(encounterStore);
  const selectedAdversary = useMemo(
    () =>
      items.find((item) => item.id === selectedAdversaryId) ??
      entries.find((entry) => entry.adversary.id === selectedAdversaryId)?.adversary ??
      null,
    [entries, items, selectedAdversaryId]
  );

  return (
    <div className={`combat-builder-app flex ${embedded ? 'h-full' : 'h-screen'} w-full overflow-hidden bg-[#111318]`}>
      <div
        className={`flex h-full min-w-0 flex-1 transition-[padding] duration-200 ${
          selectedAdversary ? "lg:pl-[34rem]" : ""
        }`}
      >
        <SidebarContainer />
        <WorkspaceContainer />
      </div>
      {selectedAdversary && (
        <div className="pointer-events-none fixed inset-y-0 left-0 z-40 flex w-full max-w-[34rem]">
          <div className="pointer-events-auto h-full w-full">
            <AdversaryDetailsModal
              adversary={selectedAdversary}
              onClose={() => adversariesService.closeDetails()}
              onAdd={() => encounterService.addAdversary(selectedAdversary)}
              onEdit={
                selectedAdversary.isCustom
                  ? () => customAdversaryEditorService.openEdit(selectedAdversary)
                  : undefined
              }
              onDuplicate={() => customAdversaryEditorService.openDuplicate(selectedAdversary)}
            />
          </div>
        </div>
      )}
      <CustomAdversaryEditorHost />
    </div>
  );
}
