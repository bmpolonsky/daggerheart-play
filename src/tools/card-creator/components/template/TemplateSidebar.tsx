/** @jsxImportSource preact */
import type { TemplateCard } from "@cards/lib/api";
import { Input } from "@cards/components/ui/input";
import { IconSearch } from "@cards/components/icons";
import { cn } from "@cards/lib/utils";
import { stripInlineMarkers } from "@cards/lib/text";
import type { TargetedEvent } from "preact";
import type { TemplateGroupView } from "@cards/services/templatesService";
import type { CustomCardRecord } from "@cards/services/customCardsService";

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
  const handleSearchInput = (event: TargetedEvent<HTMLInputElement, Event>) => {
    onSearchChange(event.currentTarget.value);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredCustomCards = normalizedSearch
    ? customCards.filter((card) => {
        const title = card.raw.name || card.raw.title || "Без названия";
        return title.toLowerCase().includes(normalizedSearch);
      })
    : customCards;

  const renderTemplateGroup = (group: TemplateGroupView) => (
    <div key={group.id} className="template-group">
      <button type="button" className="template-group__toggle" onClick={group.toggle}>
        <span className="template-group__title">{group.title}</span>
        <div className="template-group__meta">
          <span className="template-group__count">{group.filteredItems.length}</span>
          <span
            className={cn(
              "template-group__chevron",
              !group.expanded && "template-group__chevron--collapsed"
            )}
          >
            −
          </span>
        </div>
      </button>
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
        <div className="sidebar__search-field">
          <IconSearch className="sidebar__search-icon" />
          <Input
            type="text"
            placeholder="Поиск по шаблонам..."
            value={searchTerm}
            onInput={handleSearchInput}
            className="input--search"
          />
        </div>
        <button
          type="button"
          className="sidebar__domain-button"
          onClick={onOpenDomainManager}
        >
          Управление доменами
        </button>
      </div>

      <div className="sidebar__templates">
        <div className="sidebar__templates-header">
          <h2 className="template-group__title">Категории карт</h2>
        </div>

        <div className="sidebar__scroll">
          <div className="custom-cards">
            <div className="custom-cards__header">
              <h3>Кастомные карты</h3>
              <span className="custom-cards__count">{filteredCustomCards.length}</span>
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
                      <div className="custom-cards__label">{title}</div>
                      <button
                        type="button"
                        className="custom-cards__delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteCustomCard(record);
                        }}
                      >
                        Удалить
                      </button>
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
            <div className="sidebar__status" role="status">
              Загружаем шаблоны…
            </div>
          )}
          {error && !isLoading && (
            <div className="sidebar__status sidebar__status--error" role="alert">
              {error}
            </div>
          )}
          {groups.map(renderTemplateGroup)}
        </div>
      </div>
    </aside>
  );
}
