/** @jsxImportSource preact */
import { useMemo, useRef } from "preact/hooks";
import type { JSX } from "preact";
import { Button } from "@cards/components/ui/button";
import { IconClose } from "@cards/components/icons";
import { CardWorkspace } from "@cards/components/workspace/CardWorkspace";
import { useStream } from "../../../../core/hooks/useStream";
import { CARD_TYPE_CONFIG, type CardFields, type CardTypeId } from "@cards/lib/cardTypes";
import { renderMarkdown } from "@cards/lib/markdown";
import { stripMarkdownLinks } from "@cards/lib/templateUtils";
import { stripInlineMarkers } from "@cards/lib/text";
import { editorService } from "@cards/services/editorService";
import { exportService } from "@cards/services/exportService";
import { customCardsService } from "@cards/services/customCardsService";
import { EmptyState } from "../../../../ui/components/common";

type CardFieldInputFactory = <
  Element extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
>(
  field: keyof CardFields,
  transform?: (value: string) => string
) => (event: JSX.TargetedEvent<Element, Event>) => void;

interface WorkspaceContainerProps {
  onOpenDomainManager: () => void;
}

export function WorkspaceContainer({ onOpenDomainManager }: WorkspaceContainerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const { selectedCard, selectedTypeId, cardFields, customImage, selectedFeatureIndex, customCardId } = useStream(editorService.editor$);
  const { isExporting, exportError } = useStream(exportService.exportState$);
  const { items: customCards, lastUpdatedAt } = useStream(customCardsService.customCards$);

  const handleCloseEditor = () => {
    editorService.closeEditor();
  };

  const handleImageUpload = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    void editorService.loadImageFromFile(file);
  };

  const onCardFieldInput: CardFieldInputFactory = (field, transform) => (event) => {
    const value = event.currentTarget.value;
    editorService.setField(field, value, transform);
  };

  const handleSubclassFeatureChange = (event: JSX.TargetedEvent<HTMLSelectElement, Event>) => {
    const index = Number(event.currentTarget.value);
    editorService.setSubclassFeature(index);
  };

  const handleTypeChange = (event: JSX.TargetedEvent<HTMLSelectElement, Event>) => {
    const nextType = event.currentTarget.value as CardTypeId;
    editorService.setCardType(nextType);
  };

  const handleExportPNG = async () => {
    if (!cardRef.current) return;
    await exportService.exportCurrentCard(cardRef.current);
  };

  const handleRequestImageUpload = () => {
    fileInputRef.current?.click();
  };

  const lastUpdatedLabel = useMemo(() => {
    const activeCustom = customCardId
      ? customCards.find((item) => item.id === customCardId)?.updatedAt
      : null;
    const timestamp = activeCustom ?? lastUpdatedAt;
    if (!timestamp) {
      return null;
    }

    try {
      return new Date(timestamp).toLocaleString("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return null;
    }
  }, [customCards, customCardId, lastUpdatedAt]);

  const typeConfig = CARD_TYPE_CONFIG[selectedTypeId];
  const cardImage = customImage ?? selectedCard?.image ?? null;
  const isSubclass = selectedTypeId === "subclass";
  const preludeHtml = useMemo(() => renderMarkdown(cardFields.prelude), [cardFields.prelude]);
  const descriptionHtml = useMemo(
    () => renderMarkdown(cardFields.description),
    [cardFields.description]
  );
  const spellcastHtml = useMemo(() => {
    const html = renderMarkdown(cardFields.spellcast);
    return html.replace(/^<p>/, "").replace(/<\/p>$/, "");
  }, [cardFields.spellcast]);
  const cardLabel = cardFields.label || typeConfig.cardLabel;
  const displayTitle = stripInlineMarkers(cardFields.title || "Без названия");
  const selectedFeatures = selectedCard?.features ?? [];

  return (
    <>
      <main className="workspace">
      <header className="workspace__header">
        {selectedCard && (
          <div className="workspace__selection">
            <span className="workspace__selection-label">{displayTitle}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Закрыть редактор"
              onClick={handleCloseEditor}
            >
              <IconClose />
            </Button>
          </div>
        )}
      </header>

      <div className="workspace__body">
        {selectedCard ? (
          <CardWorkspace
            cardRef={cardRef}
            fileInputRef={fileInputRef}
            cardFields={cardFields}
            typeConfig={typeConfig}
            selectedTypeId={selectedTypeId}
            headlineTitle={typeConfig.name}
            lastUpdatedLabel={lastUpdatedLabel}
            showLastUpdated={Boolean(customCardId)}
            cardLabel={cardLabel}
            cardImage={cardImage}
            customImage={customImage}
            selectedCard={selectedCard}
            isSubclass={isSubclass}
            selectedFeatureIndex={selectedFeatureIndex}
            features={selectedFeatures}
            onTypeChange={handleTypeChange}
            onFieldInput={onCardFieldInput}
            onSubclassFeatureChange={handleSubclassFeatureChange}
            onImageUpload={handleImageUpload}
            onRequestImageUpload={handleRequestImageUpload}
            onRequestImageUploadFromPanel={handleRequestImageUpload}
            preludeHtml={preludeHtml}
            descriptionHtml={descriptionHtml}
            spellcastHtml={spellcastHtml}
            onExport={handleExportPNG}
            isExporting={isExporting}
            exportError={exportError}
            stripMarkdownLinks={stripMarkdownLinks}
            onRequestDomainManager={onOpenDomainManager}
          />
        ) : (
          <EmptyState
            className="workspace__empty-state"
            tone="panel"
            size="lg"
            title="Выберите шаблон"
            body="Нажмите на карточку, чтобы открыть рабочее пространство и начать редактировать."
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                width="48"
                height="48"
              >
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M2 10h20" />
                <path d="M6 6V4" />
                <path d="M10 6V4" />
                <path d="M14 6V4" />
                <path d="M18 6V4" />
              </svg>
            }
          />
        )}
      </div>
      </main>
    </>
  );
}
