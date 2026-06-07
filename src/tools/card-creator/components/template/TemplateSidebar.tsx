/** @jsxImportSource preact */
import { Trash2 } from "lucide-react";
import type { TemplateCard } from "@cards/lib/api";
import { Button } from "@cards/components/ui/button";
import { cn } from "@cards/lib/utils";
import { stripInlineMarkers } from "@cards/lib/text";
import type { TemplateGroupView } from "@cards/services/templatesService";
import type { CustomCardRecord } from "@cards/services/customCardsService";
import { Badge, IconButton, Notice, SearchField } from "../../../../ui/components/common";

interface TemplateSidebarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  groups: TemplateGroupView[];
  onSelectCard: (card: TemplateCard) => void;
  customCards: CustomCardRecord[];
  onSelectCustomCard: (record: CustomCardRecord) => void;
  onDeleteCustomCard: (record: CustomCardRecord) => void;
  onOpenDomainManager: () => void;
}

export function TemplateSidebar({
  searchTerm,
  onSearchChange,
  isLoading,
  error,
  groups,
  onSelectCard,
  customCards,
  onSelectCustomCard,
  onDeleteCustomCard,
  onOpenDomainManager,
}: TemplateSidebarProps) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredCustomCards = normalizedSearch
    ? customCards.filter((card) => {
        const title = card.raw.name || card.raw.title || "Без названия";
        return title.toLowerCase().includes(normalizedSearch);
      })
    : customCards;

  const renderTemplateGroup = (group: TemplateGroupView) => (
    <div key={group.id} className="template-group">
      <Button variant="ghost" className="template-group__toggle" onClick={group.toggle}>
        <span className="template-group__title">{group.title}</span>
        <div className="template-group__meta">
          <Badge tone="gold">{group.filteredItems.length}</Badge>
          <span
            className={cn(
              "template-group__chevron",
              !group.expanded && "template-group__chevron--collapsed"
            )}
          >
            −
          </span>
        </div>
      </Button>
      {group.expanded && group.filteredItems.length > 0 && (
        <div className="template-grid">
          {group.filteredItems.map((card) => {
            const displayName = stripInlineMarkers(card.name);
            return (
              <div
                key={card.id}
                className="template-card"
                onClick={() => onSelectCard(card)}
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={displayName}
                    className="template-card__image"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="template-card__placeholder">Нет изображения</div>
                )}
                <div className="template-card__label">{displayName}</div>
              </div>
            );
          })}
        </div>
      )}
      {group.expanded && group.filteredItems.length === 0 && (
        <div className="template-group__empty">Нет карточек по запросу</div>
      )}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__search">
        <SearchField
          placeholder="Поиск по шаблонам..."
          value={searchTerm}
          onInput={(event: any) => onSearchChange(event.currentTarget.value)}
          inputClassName="sidebar__search-input"
        />
        <Button
          variant="secondary"
          fullWidth
          className="sidebar__domain-button"
          onClick={onOpenDomainManager}
        >
          Управление доменами
        </Button>
      </div>

      <div className="sidebar__templates">
        <div className="sidebar__templates-header">
          <h2 className="template-group__title">Категории карт</h2>
        </div>

        <div className="sidebar__scroll">
          <div className="custom-cards">
            <div className="custom-cards__header">
              <h3>Кастомные карты</h3>
              <Badge tone="gold">{filteredCustomCards.length}</Badge>
            </div>
            {filteredCustomCards.length > 0 ? (
              <div className="custom-cards__grid">
                {filteredCustomCards.map((record) => {
                  const title = stripInlineMarkers(String(record.raw.name || record.raw.title || "Без названия"));
                  const previewImage = typeof record.raw.image_url === "string" ? record.raw.image_url : null;
                  return (
                    <div
                      key={record.id}
                      className="custom-cards__item"
                      onClick={() => onSelectCustomCard(record)}
                    >
                      <div className="custom-cards__media">
                        {previewImage ? (
                          <img
                            src={previewImage}
                            alt={title}
                            className="custom-cards__image"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="custom-cards__placeholder">Нет изображения</div>
                        )}
                        <IconButton
                          variant="secondary"
                          tone="danger"
                          size="sm"
                          type="button"
                          className="custom-cards__delete"
                          title="Удалить карту"
                          aria-label={`Удалить карту ${title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteCustomCard(record);
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </IconButton>
                      </div>
                      <div className="custom-cards__label">{title}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="custom-cards__empty">
                {normalizedSearch
                  ? "Нет кастомных карт по запросу."
                  : "Кастомные карты появятся после редактирования шаблонов."}
              </div>
            )}
          </div>
          {isLoading && (
            <Notice className="sidebar__status" role="status">
              Загружаем шаблоны…
            </Notice>
          )}
          {error && !isLoading && (
            <Notice className="sidebar__status" tone="error" role="alert">
              {error}
            </Notice>
          )}
          {groups.map(renderTemplateGroup)}
        </div>
      </div>
    </aside>
  );
}
