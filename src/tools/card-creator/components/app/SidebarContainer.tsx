/** @jsxImportSource preact */
import type { TemplateCard } from "@cards/lib/api";
import { TemplateSidebar } from "@cards/components/template/TemplateSidebar";
import { useStore } from "@cards/lib/store";
import { templatesStore } from "@cards/stores/templates";
import { templatesService } from "@cards/services/templatesService";
import { editorService } from "@cards/services/editorService";
import { customCardsStore } from "@cards/stores/customCards";
import type { CustomCardRecord } from "@cards/services/customCardsService";

interface SidebarContainerProps {
  onOpenDomainManager: () => void;
}

export function SidebarContainer({ onOpenDomainManager }: SidebarContainerProps) {
  const { isLoading, error, searchTerm } = useStore(templatesStore);
  const { items: customCards } = useStore(customCardsStore);
  const configuredGroups = templatesService.buildGroupViews();

  const handleSearchChange = (value: string) => {
    templatesService.setSearchTerm(value);
  };

  const handleCardClick = (card: TemplateCard) => {
    editorService.selectCard(card);
  };

  const handleCustomCardClick = (record: CustomCardRecord) => {
    editorService.openCustomCard(record);
  };

  const handleCustomCardDelete = (record: CustomCardRecord) => {
    editorService.removeCustomCard(record.id);
  };

  return (
    <TemplateSidebar
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      isLoading={isLoading}
      error={error}
      groups={configuredGroups}
      onSelectCard={handleCardClick}
      customCards={customCards}
      onSelectCustomCard={handleCustomCardClick}
      onDeleteCustomCard={handleCustomCardDelete}
      onOpenDomainManager={onOpenDomainManager}
    />
  );
}
