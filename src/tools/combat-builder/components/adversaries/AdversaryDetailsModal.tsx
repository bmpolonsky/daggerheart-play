/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import type { Adversary } from "@combat/lib/api";
import { REMOTE_BASE_URL } from "@combat/lib/constants";
import { formatDamageRoll } from "@combat/lib/utils";
import {
  IconClose,
  IconCopy,
  IconEdit,
  IconHeart,
  IconInfo,
  IconShield,
  IconSword,
  IconZap,
} from "@combat/components/icons";

interface AdversaryDetailsModalProps {
  adversary: Adversary;
  onClose: () => void;
  onAdd: () => void;
  onEdit?: () => void;
  onDuplicate: () => void;
}

function renderLegacyMarkdown(text: string) {
  if (!text) return "";

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      const fullUrl = url.startsWith("http") ? url : `${REMOTE_BASE_URL}${url}`;
      return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="text-dagger-gold hover:underline decoration-dagger-gold/50 cursor-pointer transition-colors">${label}</a>`;
    })
    .replace(/^- (.*)$/gm, '<li class="ml-4 list-disc marker:text-dagger-gold">$1</li>')
    .replace(/\n/g, "<br />");
}

function shortDamageTypeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "physical") return "физ";
  if (normalized === "magical") return "маг";
  if (normalized === "any") return "var";
  return normalized || "—";
}

function attackRangeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");
  if (!normalized) return "";
  if (compact === "melee") return "Вплотную";
  if (compact === "veryclose") return "Близко";
  if (compact === "close") return "Средне";
  if (compact === "far") return "Далеко";
  if (compact === "veryfar") return "Очень Далеко";
  if (compact === "any") return "Любая";
  return value;
}

export function AdversaryDetailsModal({
  adversary,
  onClose,
  onAdd,
  onEdit,
  onDuplicate,
}: AdversaryDetailsModalProps) {
  const [imageError, setImageError] = useState(false);
  const onCloseRef = useRef(onClose);
  const imageUrl = adversary.image && !imageError ? adversary.image : null;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <aside
      className="pointer-events-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border-r border-dagger-gold bg-dagger-panel shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative shrink-0 overflow-hidden bg-slate-900">
        {imageUrl && (
          <div className="absolute inset-0">
            <img
              src={imageUrl}
              alt={adversary.name}
              className="h-full w-full object-cover opacity-40 blur-[2px]"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/60 to-dagger-panel" />
          </div>
        )}

        <div className="relative z-20 px-5 pb-3 pt-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <h2 className="font-display text-[1.45rem] font-bold leading-[0.92] text-white drop-shadow-md shadow-black md:text-[1.7rem]">
                    {adversary.name}
                  </h2>
                  <span className="rounded-sm border border-dagger-gold/20 bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-dagger-gold shadow-xs backdrop-blur-xs">
                    Ранг {adversary.tier}
                  </span>
                  <span className="rounded-sm border border-dagger-gold/20 bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-dagger-gold shadow-xs backdrop-blur-xs">
                    {adversary.roleName}
                  </span>
                </div>
              </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {adversary.isCustom && onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-sm bg-black/20 p-2 text-blue-200 transition-colors hover:bg-black/40 hover:text-blue-100 backdrop-blur-xs"
                  title="Редактировать"
                  aria-label="Редактировать"
                >
                  <IconEdit size={19} />
                </button>
              )}
              <button
                type="button"
                onClick={onDuplicate}
                className="rounded-sm bg-black/20 p-2 text-dagger-gold transition-colors hover:bg-black/40 hover:text-yellow-300 backdrop-blur-xs"
                title="Создать копию"
                aria-label="Создать копию"
              >
                <IconCopy size={19} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-black/20 p-2 text-slate-400 transition-colors hover:bg-black/40 hover:text-white backdrop-blur-xs"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <IconClose size={24} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_11rem] gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="min-w-0">
              <div className="text-[0.88rem] italic leading-[1.55] text-slate-300 drop-shadow-xs">
                <span
                  dangerouslySetInnerHTML={{ __html: renderLegacyMarkdown(adversary.summary) }}
                />
              </div>

              <div className="mt-4 space-y-1.5">
                {adversary.motives && (
                  <div className="text-[0.88rem] leading-relaxed text-slate-300">
                    <span className="font-bold text-slate-100">Мотивы и тактика:</span>{" "}
                    {adversary.motives}
                  </div>
                )}

                {adversary.experiences && (
                  <div className="text-[0.88rem] leading-relaxed text-slate-300">
                    <span className="font-bold text-slate-100">Опыт:</span>{" "}
                    {adversary.experiences}
                  </div>
                )}
              </div>
            </div>

            {imageUrl ? (
              <div className="pointer-events-none flex min-h-[9rem] items-end justify-end md:min-h-[10.5rem]">
                <img
                  src={imageUrl}
                  alt=""
                  className="max-h-[10.5rem] w-full object-contain object-bottom drop-shadow-xl md:max-h-[12rem]"
                />
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto bg-dagger-panel px-5 py-4">
        <div className="space-y-1 pb-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.88rem]">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <IconShield size={13} className="text-blue-400" /> Сложность
              </span>
              <span className="font-mono font-bold text-white">{adversary.difficulty}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-400">Пороги</span>
              <span className="font-mono font-bold text-white">
                {adversary.damageThresholds
                  ? `${adversary.damageThresholds[0]} / ${adversary.damageThresholds[1]}`
                  : "Нет"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <IconHeart size={13} className="text-red-400" /> Раны
              </span>
              <span className="font-mono font-bold text-white">{adversary.hp}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <IconZap size={13} className="text-yellow-400" /> Стресс
              </span>
              <span className="font-mono font-bold text-white">{adversary.stress}</span>
            </div>

            <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-700/60 pt-2">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <IconSword size={13} className="text-orange-400" /> ATK{" "}
                <span className="font-mono text-white">
                  {adversary.attackBonus.startsWith("-")
                    ? adversary.attackBonus
                    : `+${adversary.attackBonus}`}
                </span>
              </span>
              {adversary.weaponName && (
                <span className="text-slate-300">{adversary.weaponName}</span>
              )}
              {adversary.attackRange && (
                <span className="text-slate-400">{attackRangeLabel(adversary.attackRange)}</span>
              )}
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-slate-300">Урон</span>
                <span className="font-mono font-bold text-white">{formatDamageRoll(adversary)}</span>
                {adversary.damageType && (
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                    {shortDamageTypeLabel(adversary.damageType)}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1">
            <h3 className="font-display text-base font-bold text-dagger-gold">Свойства</h3>
          </div>

          {adversary.features.length > 0 ? (
            <div className="space-y-3">
              {adversary.features.map((feature) => (
                <div
                  key={feature.id}
                  className="border-b border-slate-700/50 pb-3 last:border-b-0 last:pb-0"
                >
                  <h4 className="mb-1 text-[0.9rem] font-bold text-white">{feature.name}</h4>
                  <div
                    className="text-[0.88rem] leading-[1.6] text-slate-300"
                    dangerouslySetInnerHTML={{ __html: renderLegacyMarkdown(feature.text) }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-sm border border-dashed border-slate-800 bg-slate-800/30 py-4 italic text-slate-500">
              <IconInfo size={16} /> Свойства не указаны.
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-700 bg-slate-900 p-4">
        <div className="flex w-full gap-3 md:w-auto">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-sm border border-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white md:flex-none"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={() => {
              onAdd();
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-dagger-gold px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-dagger-dark shadow-lg transition-all hover:bg-yellow-500 hover:shadow-dagger-gold/20 md:flex-none"
          >
            <IconSword size={16} />
            Добавить в бой
          </button>
        </div>
      </div>
    </aside>
  );
}
