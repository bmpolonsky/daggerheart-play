/** @jsxImportSource preact */
import type { RefObject } from "preact";
import type { TemplateCard } from "@cards/lib/api";
import type { CardFields, CardTypeConfig } from "@cards/lib/cardTypes";
import { IconUpload } from "@cards/components/icons";
import type { TargetedEvent, JSX } from "preact";
import { stripInlineMarkers } from "@cards/lib/text";
import { publicAssetUrl } from "../../../../domain/content/publicAssets";

interface CardPreviewProps {
  cardRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  cardFields: CardFields;
  typeConfig: CardTypeConfig;
  cardLabel: string;
  cardImage: string | null;
  customImage: string | null;
  selectedCard: TemplateCard | null;
  onImageUpload: (event: TargetedEvent<HTMLInputElement, Event>) => void;
  onRequestImageUpload: () => void;
  preludeHtml: string;
  descriptionHtml: string;
  spellcastHtml: string;
}

export function CardPreview({
  cardRef,
  fileInputRef,
  cardFields,
  typeConfig,
  cardLabel,
  cardImage,
  customImage,
  selectedCard,
  onImageUpload,
  onRequestImageUpload,
  preludeHtml,
  descriptionHtml,
  spellcastHtml,
}: CardPreviewProps) {
  const displayTitle = stripInlineMarkers(cardFields.title) || "Без названия";
  const displayLabel = stripInlineMarkers(cardLabel);
  const displaySubclassTier = stripInlineMarkers(cardFields.subclassTier);
  const displayBannerText = stripInlineMarkers(cardFields.bannerText);
  const displayStressText = stripInlineMarkers(cardFields.stressText);
  const displayAttribution = stripInlineMarkers(cardFields.attribution);
  const displaySource = stripInlineMarkers(cardFields.source);
  const imageAlt = stripInlineMarkers(
    customImage ? "Пользовательское изображение" : selectedCard?.name ?? "Изображение"
  );
  const bodyFontSize = cardFields.bodyFontSize.trim();
  const bodyFontStyle = bodyFontSize
    ? ({ "--card-body-font-size": bodyFontSize } as JSX.CSSProperties)
    : undefined;

  return (
    <div className="card-preview card-preview-scope">
      <div className="card_holder print">
        <div
          ref={cardRef}
          key={cardFields.slug || cardFields.title || "card"}
          id={cardFields.slug || undefined}
          className={[
            "card",
            ...typeConfig.baseClasses,
            cardFields.customClasses && cardFields.customClasses,
          ]
            .filter(Boolean)
            .join(" ")}
          style={bodyFontStyle}
          {...(cardFields.dataSource && { "data-source": cardFields.dataSource })}
          {...(typeConfig.supportsDataClass && cardFields.dataClass && {
            "data-class": cardFields.dataClass,
          })}
          {...(typeConfig.supportsTier && cardFields.subclassTier && {
            "data-subclass-tier": cardFields.subclassTier,
          })}
          {...(typeConfig.supportsDataDomain && cardFields.dataDomain && {
            "data-domain": cardFields.dataDomain,
          })}
        >
          <a
            href={cardFields.buttonHref || undefined}
            className="button"
            aria-label="Открыть оригинал"
            style={{ pointerEvents: "none" }}
          />
          <div
            className="image card-preview__image"
            role="button"
            tabIndex={0}
            onClick={onRequestImageUpload}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRequestImageUpload();
              }
            }}
          >
            {cardImage ? (
              <img
                src={publicAssetUrl(cardImage)}
                alt={
                  imageAlt
                }
                className="card_image"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="card-preview__image-placeholder">
                <div className="card-preview__upload-icon">
                  <IconUpload width={24} height={24} stroke="#4b5563" />
                </div>
                <p>Загрузить изображение</p>
              </div>
            )}
          </div>

          {typeConfig.supportsStress && cardFields.stressImage && (
            <img className="stress_image" src={cardFields.stressImage} alt="" loading="lazy" decoding="async" />
          )}
          {typeConfig.supportsStress && cardFields.stressText && (
            <p className="stress_text">{displayStressText}</p>
          )}
          {typeConfig.supportsBanner && cardFields.bannerImage && (
            cardFields.bannerImage.trim().startsWith("<svg") ? (
              <div
                className="banner_image"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: cardFields.bannerImage }}
              />
            ) : (
              <img className="banner_image" src={cardFields.bannerImage} alt="" loading="lazy" decoding="async" />
            )
          )}
          {typeConfig.supportsBanner && cardFields.bannerText && (
            <p className="banner_text">{displayBannerText}</p>
          )}
          <p className="attribution">{displayAttribution}</p>
          <p className="source">{displaySource}</p>

          <div className="flex">
            <div className="display">
              <div className="background" />
              <div className="text">
                <p className="title">{displayTitle}</p>
                {typeConfig.supportsTier && cardFields.subclassTier && (
                  <p className="subclass_tier">{displaySubclassTier}</p>
                )}
                {typeConfig.supportsSpellcast && cardFields.spellcast && (
                  <p className="spellcast" dangerouslySetInnerHTML={{ __html: spellcastHtml }} />
                )}
                {typeConfig.supportsPrelude && cardFields.prelude.trim() && (
                  <div className="prelude" dangerouslySetInnerHTML={{ __html: preludeHtml }} />
                )}
                {cardFields.description.trim() && (
                  <div
                    className="description"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                )}
              </div>
            </div>
            {cardFields.dividerImage ? (
              cardFields.dividerImage.trim().startsWith("<svg") ? (
                <div
                  className="divider"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: cardFields.dividerImage }}
                />
              ) : (
                <img className="divider" src={cardFields.dividerImage} alt="" loading="lazy" decoding="async" />
              )
            ) : (
              <div className="card-preview__divider-placeholder" />
            )}
            <p className="label">{displayLabel}</p>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onImageUpload}
        hidden
      />
    </div>
  );
}
