/** @jsxImportSource preact */
import { CustomAdversaryModal } from "@combat/components/adversaries/CustomAdversaryModal";
import type { Adversary } from "@combat/lib/api";
import { useStream } from "../../../../core/hooks/useStream";
import { adversariesService } from "@combat/services/adversariesService";
import { customAdversaryEditorService } from "@combat/services/customAdversaryEditorService";

export function CustomAdversaryEditorHost() {
  const editor = useStream(customAdversaryEditorService.editor$);

  if (!editor) return null;

  const handleSave = (payload: Partial<Adversary>) => {
    if (editor.mode === "edit" && editor.adversary) {
      adversariesService.updateCustomAdversary(editor.adversary.id, payload);
      customAdversaryEditorService.close();
      return;
    }

    const adversary = adversariesService.createCustomAdversary(payload);
    customAdversaryEditorService.close();
    adversariesService.openDetails(adversary.id);
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("Удалить кастомного противника из каталога? В текущем бою он останется.")) {
      return;
    }

    adversariesService.removeCustomAdversary(id);
    customAdversaryEditorService.close();
  };

  return (
    <CustomAdversaryModal
      adversary={editor.adversary}
      mode={editor.mode}
      onClose={() => customAdversaryEditorService.close()}
      onSave={handleSave}
      onDelete={editor.mode === "edit" && editor.adversary ? handleDelete : undefined}
    />
  );
}
