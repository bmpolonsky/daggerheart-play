/** @jsxImportSource preact */
import type { TemplateCard } from "@cards/lib/api";
import type { CardFields, CardTypeConfig, CardTypeId } from "@cards/lib/cardTypes";
import { CARD_TYPE_LIST } from "@cards/lib/cardTypes";
import type { TemplateFeature } from "@cards/lib/api";
import type { TargetedEvent } from "preact";
import { Input } from "@cards/components/ui/input";
import { Button } from "@cards/components/ui/button";
import { normalizeFeatureName } from "@cards/lib/templateUtils";
import { useStream } from "../../../../core/hooks/useStream";
import { domainService } from "@cards/services/domainService";
import { Field, SelectControl, TextAreaControl } from "../../../../ui/components/common/Field";

type CardFieldInputFactory = <
  Element extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
>(
  field: keyof CardFields,
  transform?: (value: string) => string
) => (event: TargetedEvent<Element, Event>) => void;

interface PropertiesPanelProps {
  selectedCard: TemplateCard | null;
  cardFields: CardFields;
  typeConfig: CardTypeConfig;
  selectedTypeId: CardTypeId;
  onTypeChange: (event: TargetedEvent<HTMLSelectElement, Event>) => void;
  onFieldInput: CardFieldInputFactory;
  onSubclassFeatureChange: (event: TargetedEvent<HTMLSelectElement, Event>) => void;
  isSubclass: boolean;
  selectedFeatureIndex: number;
  features: TemplateFeature[];
  onExport: () => void;
  isExporting: boolean;
  exportError: string | null;
  stripMarkdownLinks: (value: string) => string;
  onRequestImageUpload: () => void;
  onRequestDomainManager: () => void;
}

export function PropertiesPanel({
  selectedCard,
  cardFields,
  typeConfig,
  selectedTypeId,
  onTypeChange,
  onFieldInput,
  onSubclassFeatureChange,
  isSubclass,
  selectedFeatureIndex,
  features,
  onExport,
  isExporting,
  exportError,
  stripMarkdownLinks,
  onRequestImageUpload,
  onRequestDomainManager,
}: PropertiesPanelProps) {
  const typeOptions = CARD_TYPE_LIST;
  const { domains } = useStream(domainService.domains$);
  const domainOptions = [...domains].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const isDomainCard = selectedTypeId === "domain-card";
  const fontSizeOptions = [
    { value: "", label: "По умолчанию" },
    { value: "0.65rem", label: "Совсем мелкий жесть (0.65rem)" },
    { value: "0.75rem", label: "Мелкий (0.75rem)" },
    { value: "0.8rem", label: "Чуть меньше (0.8rem)" },
    { value: "0.85rem", label: "Средний (0.85rem)" },
    { value: "0.9rem", label: "Крупный (0.9rem)" },
    { value: "0.95rem", label: "Очень крупный (0.95rem)" },
  ];

  const renderFeatureOptions = () => {
    if (!isSubclass || !selectedCard || features.length === 0) {
      return null;
    }

    return (
      <Field label="Раздел">
        <SelectControl
          id="card-feature"
          value={String(selectedFeatureIndex)}
          onChange={onSubclassFeatureChange as any}
        >
          {features.map((feature, index) => (
            <option key={feature.id} value={index}>
              {feature.group
                ? `${feature.group} — ${normalizeFeatureName(feature)}`
              : normalizeFeatureName(feature)}
            </option>
          ))}
        </SelectControl>
      </Field>
    );
  };

  const renderDomainSelectors = () => {
    if (!isSubclass && !isDomainCard) return null;

    if (domainOptions.length === 0) {
      return (
        <Field label="Домены">
          <p className="properties-hint">Нет доступных доменов. Создайте новый домен.</p>
          <Button variant="secondary" size="sm" onClick={onRequestDomainManager}>
            Открыть менеджер доменов
          </Button>
        </Field>
      );
    }

    const handleDomainSelect =
      (field: "domainPrimary" | "domainSecondary") =>
      (event: TargetedEvent<HTMLSelectElement, Event>) => {
        const value = event.currentTarget.value;
        if (value === "__create__") {
          onRequestDomainManager();
          return;
        }
        onFieldInput<HTMLSelectElement>(field)(event);
      };

    if (isDomainCard) {
      return (
        <Field label="Домен">
          <SelectControl
            id="card-domain-primary"
            value={cardFields.domainPrimary}
            onChange={handleDomainSelect("domainPrimary") as any}
          >
            <option value="">Не выбран</option>
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
            <option value="__create__">＋ Создать новый домен</option>
          </SelectControl>
        </Field>
      );
    }

    return (
      <Field label="Домены класса">
        <div className="domain-selects">
          <SelectControl
            value={cardFields.domainPrimary}
            onChange={handleDomainSelect("domainPrimary") as any}
          >
            <option value="">Домен 1</option>
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
            <option value="__create__">＋ Создать новый домен</option>
          </SelectControl>
          <SelectControl
            value={cardFields.domainSecondary}
            onChange={handleDomainSelect("domainSecondary") as any}
          >
            <option value="">Домен 2</option>
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
            <option value="__create__">＋ Создать новый домен</option>
          </SelectControl>
        </div>
      </Field>
    );
  };

  return (
    <aside className="properties-panel">
      <div className="properties-section">
        <h3>Тип карты</h3>
        <Field label="Категория">
          <SelectControl
            id="card-type"
            value={selectedTypeId}
            onChange={onTypeChange as any}
          >
            {typeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectControl>
        </Field>
      </div>

      <div className="properties-section properties-section--form">
        <h3>Основные поля</h3>
        <Field label="Название карты">
          <Input
            id="card-title"
            value={cardFields.title}
            onInput={onFieldInput<HTMLInputElement>("title")}
          />
        </Field>
        <Field label="Подпись (лейбл)">
          <Input
            id="card-label"
            value={cardFields.label}
            placeholder={typeConfig.cardLabel}
            onInput={onFieldInput<HTMLInputElement>("label")}
          />
        </Field>
        {typeConfig.supportsPrelude && (
          <Field label="Прелюдия / вступление">
            <TextAreaControl
              id="card-prelude"
              className="properties-textarea"
              value={cardFields.prelude}
              onInput={onFieldInput<HTMLTextAreaElement>("prelude", stripMarkdownLinks) as any}
              rows={3}
            />
          </Field>
        )}
        <Field label="Описание">
          <TextAreaControl
            id="card-description"
            className="card-content-textarea"
            value={cardFields.description}
            onInput={onFieldInput<HTMLTextAreaElement>("description", stripMarkdownLinks) as any}
            rows={isSubclass ? 12 : 14}
          />
        </Field>
        <Field label="Размер текста карточки">
          <SelectControl
            id="card-body-font-size"
            value={cardFields.bodyFontSize}
            onChange={onFieldInput<HTMLSelectElement>("bodyFontSize") as any}
          >
            {fontSizeOptions.map((option) => (
              <option key={option.value || "default"} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </Field>
        {renderFeatureOptions()}
        {typeConfig.supportsTier && (
          <Field label="Уровень (для подкласса)">
            <Input
              id="card-tier"
              value={cardFields.subclassTier}
              onInput={onFieldInput<HTMLInputElement>("subclassTier")}
            />
          </Field>
        )}
        {typeConfig.supportsSpellcast && (
          <Field label="Заклинатель (Spellcast)">
            <Input
              id="card-spellcast"
              value={cardFields.spellcast}
              onInput={onFieldInput<HTMLInputElement>("spellcast", stripMarkdownLinks)}
            />
          </Field>
        )}
        <Field label="Источник">
          <Input
            id="card-source"
            value={cardFields.source}
            onInput={onFieldInput<HTMLInputElement>("source")}
          />
        </Field>
        <Field label="Художник">
          <Input
            id="card-attribution"
            value={cardFields.attribution}
            onInput={onFieldInput<HTMLInputElement>("attribution")}
          />
        </Field>
      </div>

      <div className="properties-section">
        <h3>Обложка</h3>
        <div className="properties-field">
          <Button variant="secondary" onClick={onRequestImageUpload}>
            Загрузить обложку
          </Button>
        </div>
        {renderDomainSelectors()}
        {typeConfig.supportsBanner && (
          <Field label="Текст баннера">
            <Input
              id="card-banner-text"
              value={cardFields.bannerText}
              onInput={onFieldInput<HTMLInputElement>("bannerText")}
            />
          </Field>
        )}
        {typeConfig.supportsStress && (
          <>
            <Field label="Иконка стресса">
              <Input
                id="card-stress-image"
                value={cardFields.stressImage}
                onInput={onFieldInput<HTMLInputElement>("stressImage")}
              />
            </Field>
            <Field label="Стоимость">
              <Input
                id="card-stress-text"
                value={cardFields.stressText}
                onInput={onFieldInput<HTMLInputElement>("stressText")}
              />
            </Field>
          </>
        )}
      </div>

      <Button className="export-button" onClick={onExport} disabled={isExporting}>
        {isExporting ? "Экспортируем…" : "Экспорт PNG"}
      </Button>
      {exportError && <p className="export-error">{exportError}</p>}
    </aside>
  );
}
