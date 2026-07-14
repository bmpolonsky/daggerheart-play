/** @jsxImportSource preact */
import { CustomAdversaryModal } from "@combat/components/adversaries/CustomAdversaryModal";
import type { Adversary } from "@combat/lib/api";
import { useStream } from "../../../../core/hooks/useStream";
import { adversariesService } from "@combat/services/adversariesService";
import { customAdversaryEditorService } from "@combat/services/customAdversaryEditorService";
import { useState } from "preact/hooks";
import { ConfirmDialog } from "../../../../ui/components/common/ConfirmDialog";

export function CustomAdversaryEditorHost() {
  const editor = useStream(customAdversaryEditorService.editor$);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  if (!editor) return null;

  const handleSave = async (payload: Partial<Adversary>) => {
    if (editor.mode === "edit" && editor.adversary) {
      await adversariesService.updateCustomAdversary(editor.adversary.id, payload);
      customAdversaryEditorService.close();
      return;
    }

    const adversary = await adversariesService.createCustomAdversary(payload);
    customAdversaryEditorService.close();
    adversariesService.openDetails(adversary.id);
  };

  const handleDelete = async (id: number) => {
    setPendingDeleteId(id);
  };

  return (
    <>
      <CustomAdversaryModal
        adversary={editor.adversary}
        mode={editor.mode}
        onClose={() => customAdversaryEditorService.close()}
        onSave={handleSave}
        onDelete={editor.mode === "edit" && editor.adversary ? handleDelete : undefined}
      />
      {pendingDeleteId !== null && (
        <ConfirmDialog
          title="Удалить пользовательского противника?"
          body="Он исчезнет из каталога, но останется в уже собранном бою. Это действие нельзя отменить."
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            void adversariesService.removeCustomAdversary(id).then(() => customAdversaryEditorService.close());
          }}
        />
      )}
    </>
  );
}
