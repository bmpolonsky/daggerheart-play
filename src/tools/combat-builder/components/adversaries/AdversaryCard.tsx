/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import type { JSX } from "preact";
import type { Adversary } from "@combat/lib/api";
import { calculateAdversaryCost } from "@combat/lib/mechanics";
import { IconEdit, IconPlus } from "@combat/components/icons";
import { IconButton } from "../../../../ui/components/common/IconButton";

interface AdversaryCardProps {
  adversary: Adversary;
  onAdd: () => void;
  onViewDetails: () => void;
  onEdit?: () => void;
}

export function AdversaryCard({
  adversary,
  onAdd,
  onViewDetails,
  onEdit,
}: AdversaryCardProps) {
  const cost = calculateAdversaryCost(adversary.roleId);
  const [imageError, setImageError] = useState(false);
  const imageUrl = adversary.image && !imageError ? adversary.image : null;
  const handleCardKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onViewDetails();
  };

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-dagger-panel shadow-lg transition-all duration-200 hover:border-dagger-gold hover:shadow-xl hover:shadow-black/40">
      <div
        role="button"
        tabIndex={0}
        className="relative flex flex-grow cursor-pointer flex-col text-left"
        onClick={onViewDetails}
        onKeyDown={handleCardKeyDown}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-800">
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-dagger-panel via-transparent to-transparent opacity-80" />

          {imageUrl ? (
            <img
              src={imageUrl}
              alt={adversary.name}
              className="h-full w-full object-contain object-bottom opacity-90 transition-all duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="combat-missing-art">
              <span>{adversary.name.slice(0, 2).toUpperCase()}</span>
              <small>{adversary.roleName || 'Противник'}</small>
            </div>
          )}

          <IconButton
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
            className="absolute right-2 top-2 z-20"
            variant="primary"
            size="sm"
            title="Добавить в бой"
            aria-label="Добавить в бой"
          >
            <IconPlus size={14} aria-hidden="true" />
          </IconButton>

          {adversary.isCustom && onEdit && (
            <IconButton
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="absolute right-2 top-12 z-20"
              variant="secondary"
              size="sm"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <IconEdit size={14} aria-hidden="true" />
            </IconButton>
          )}

          <div
            className="absolute left-2 top-2 z-20"
            title={`Стоимость: ${cost} очков (Роль: ${adversary.roleName})`}
          >
            <div
              className="flex h-8 w-8 cursor-help items-center justify-center rounded border border-white/20 bg-dagger-gold text-base font-bold text-dagger-dark shadow-lg"
              style={
                {
                  clipPath:
                    "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
                } as JSX.CSSProperties
              }
            >
              {cost}
            </div>
          </div>

        </div>

        <div className="relative z-20 flex flex-grow flex-col gap-2 bg-dagger-panel px-3 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-dagger-gold/20 bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-dagger-gold shadow-sm backdrop-blur-sm">
              Ранг {adversary.tier}
            </span>
            <span className="rounded border border-dagger-gold/20 bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-dagger-gold shadow-sm backdrop-blur-sm">
              {adversary.roleName}
            </span>
            {adversary.isCustom && (
              <span className="rounded border border-blue-300/20 bg-blue-950/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-200 shadow-sm backdrop-blur-sm">
                Кастом
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-bold leading-tight text-white">
              {adversary.name}
            </h3>
          </div>

          <div className="min-h-[3em] flex-1">
            <p className="line-clamp-3 text-xs italic leading-relaxed text-slate-400">
              {adversary.summary}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
