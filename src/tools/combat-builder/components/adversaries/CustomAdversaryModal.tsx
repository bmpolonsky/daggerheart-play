/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import type { Adversary, AdversaryFeature } from "@combat/lib/api";
import { ADVERSARY_ROLE_OPTIONS } from "@combat/lib/customAdversaries";
import { IconClose, IconMinus, IconPlus, IconTrash } from "@combat/components/icons";
import { ImageFilePicker } from "../../../../ui/components/common/ImageFilePicker";
import { readFileAsDataUrl } from "../../../../ui/vtt/playerView/sharedTools/readFileAsDataUrl";

interface CustomAdversaryModalProps {
  adversary?: Adversary | null;
  mode?: "create" | "edit";
  onClose: () => void;
  onSave: (payload: Partial<Adversary>) => void;
  onDelete?: (id: number) => void;
}

interface FeatureDraft {
  id: number | string;
  name: string;
  text: string;
}

interface FormState {
  name: string;
  tier: string;
  roleId: string;
  summary: string;
  image: string;
  difficulty: string;
  hp: string;
  stress: string;
  thresholdMinor: string;
  thresholdMajor: string;
  attackBonus: string;
  attackRange: string;
  damageType: string;
  damageDieCount: string;
  damageDieSize: string;
  damageBonus: string;
  weaponName: string;
  motives: string;
  experiences: string;
  mainBody: string;
  features: FeatureDraft[];
}

const ATTACK_RANGE_OPTIONS = [
  { id: "", name: "Не указано" },
  { id: "melee", name: "Вплотную" },
  { id: "very-close", name: "Близко" },
  { id: "close", name: "Средне" },
  { id: "far", name: "Далеко" },
  { id: "very-far", name: "Очень далеко" },
  { id: "any", name: "Любая" },
];

const DAMAGE_TYPE_OPTIONS = [
  { id: "", name: "Не указан" },
  { id: "physical", name: "Физический" },
  { id: "magical", name: "Магический" },
  { id: "any", name: "Любой" },
];

function createFeatureId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toFormState(adversary?: Adversary | null): FormState {
  return {
    name: adversary?.name ?? "",
    tier: String(adversary?.tier ?? 1),
    roleId: adversary?.roleId ?? "standard",
    summary: adversary?.summary ?? "",
    image: adversary?.image ?? "",
    difficulty: String(adversary?.difficulty ?? 10),
    hp: String(adversary?.hp ?? 3),
    stress: String(adversary?.stress ?? 2),
    thresholdMinor: String(adversary?.damageThresholds?.[0] ?? ""),
    thresholdMajor: String(adversary?.damageThresholds?.[1] ?? ""),
    attackBonus: adversary?.attackBonus ?? "0",
    attackRange: adversary?.attackRange ?? "",
    damageType: adversary?.damageType ?? "",
    damageDieCount: String(adversary?.damageDieCount ?? 1),
    damageDieSize: String(adversary?.damageDieSize ?? 8),
    damageBonus: String(adversary?.damageBonus ?? 0),
    weaponName: adversary?.weaponName ?? "",
    motives: adversary?.motives ?? "",
    experiences: adversary?.experiences ?? "",
    mainBody: adversary?.mainBody ?? "",
    features:
      adversary?.features.map((feature) => ({
        id: feature.id,
        name: feature.name,
        text: feature.text,
      })) ?? [],
  };
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimFeature(feature: FeatureDraft): AdversaryFeature | null {
  const name = feature.name.trim();
  const text = feature.text.trim();
  if (!name && !text) return null;
  return {
    id: feature.id,
    name: name || "Без названия",
    text,
  };
}

function buildPayload(state: FormState): Partial<Adversary> {
  const minor = numberOrZero(state.thresholdMinor);
  const major = numberOrZero(state.thresholdMajor);
  const role = ADVERSARY_ROLE_OPTIONS.find((item) => item.id === state.roleId);

  return {
    name: state.name.trim(),
    tier: numberOrZero(state.tier),
    roleId: state.roleId,
    roleName: role?.name ?? "Рядовой",
    summary: state.summary.trim(),
    image: state.image.trim() || null,
    difficulty: numberOrZero(state.difficulty),
    hp: numberOrZero(state.hp),
    stress: numberOrZero(state.stress),
    damageThresholds: minor > 0 && major > 0 ? [minor, major] : null,
    attackBonus: state.attackBonus.trim() || "0",
    attackRange: state.attackRange,
    damageType: state.damageType,
    damageDieCount: numberOrZero(state.damageDieCount),
    damageDieSize: numberOrZero(state.damageDieSize),
    damageBonus: numberOrZero(state.damageBonus),
    weaponName: state.weaponName.trim(),
    motives: state.motives.trim(),
    experiences: state.experiences.trim(),
    mainBody: state.mainBody.trim(),
    features: state.features
      .map(trimFeature)
      .filter((feature): feature is AdversaryFeature => Boolean(feature)),
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ComponentChildren;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-sm border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-hidden transition-colors placeholder:text-slate-600 focus:border-dagger-gold focus:ring-1 focus:ring-dagger-gold";
const textareaClass = `${inputClass} min-h-[5.5rem] resize-y leading-relaxed`;

export function CustomAdversaryModal({
  adversary,
  mode,
  onClose,
  onSave,
  onDelete,
}: CustomAdversaryModalProps) {
  const [state, setState] = useState(() => toFormState(adversary));
  const [error, setError] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  const isEditing = mode ? mode === "edit" : Boolean(adversary);
  const isTemplateCreate = !isEditing && Boolean(adversary);

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
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const updateField =
    <K extends keyof FormState>(key: K) =>
    (event: JSX.TargetedEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setState((current) => ({ ...current, [key]: event.currentTarget.value }));
    };

  const updateFeature = (id: number | string, patch: Partial<FeatureDraft>) => {
    setState((current) => ({
      ...current,
      features: current.features.map((feature) =>
        feature.id === id ? { ...feature, ...patch } : feature
      ),
    }));
  };

  const addFeature = () => {
    setState((current) => ({
      ...current,
      features: [...current.features, { id: createFeatureId(), name: "", text: "" }],
    }));
  };

  const removeFeature = (id: number | string) => {
    setState((current) => ({
      ...current,
      features: current.features.filter((feature) => feature.id !== id),
    }));
  };

  const handleSubmit = (event: JSX.TargetedEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.name.trim()) {
      setError("Введите название противника");
      return;
    }

    setError(null);
    try {
      onSave(buildPayload(state));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить противника");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-dagger-gold/40 bg-dagger-panel shadow-2xl"
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700 bg-slate-900 px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {isEditing
                ? "Редактировать противника"
                : isTemplateCreate
                  ? "Новый противник из шаблона"
                  : "Кастомный противник"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Заполните только то, что нужно для карточки и боя.
            </p>
          </div>
          <button
            type="button"
            className="rounded-sm p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <IconClose size={22} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem_13rem]">
            <Field label="Название">
              <input
                className={inputClass}
                value={state.name}
                onInput={updateField("name")}
                placeholder="Например, Кровавый культист"
                autoFocus
              />
            </Field>
            <Field label="Ранг">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={4}
                value={state.tier}
                onInput={updateField("tier")}
              />
            </Field>
            <Field label="Роль">
              <select className={inputClass} value={state.roleId} onChange={updateField("roleId")}>
                {ADVERSARY_ROLE_OPTIONS.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Field label="Краткое описание">
              <textarea
                className={textareaClass}
                value={state.summary}
                onInput={updateField("summary")}
                placeholder="Одна-две строки, которые видны на карточке."
              />
            </Field>
            <ImageFilePicker
              className="combat-image-picker"
              label="Изображение"
              imageUrl={state.image}
              aspectRatio="4 / 3"
              onFileSelect={async (file) => {
                const image = await readFileAsDataUrl(file);
                setState((current) => ({ ...current, image }));
              }}
              onClear={() => setState((current) => ({ ...current, image: "" }))}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Сложность">
              <input
                className={inputClass}
                type="number"
                value={state.difficulty}
                onInput={updateField("difficulty")}
              />
            </Field>
            <Field label="Раны">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={state.hp}
                onInput={updateField("hp")}
              />
            </Field>
            <Field label="Стресс">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={state.stress}
                onInput={updateField("stress")}
              />
            </Field>
            <Field label="Порог 1">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={state.thresholdMinor}
                onInput={updateField("thresholdMinor")}
              />
            </Field>
            <Field label="Порог 2">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={state.thresholdMajor}
                onInput={updateField("thresholdMajor")}
              />
            </Field>
            <Field label="ATK">
              <input
                className={inputClass}
                value={state.attackBonus}
                onInput={updateField("attackBonus")}
              />
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Field label="Оружие" className="lg:col-span-2">
              <input
                className={inputClass}
                value={state.weaponName}
                onInput={updateField("weaponName")}
              />
            </Field>
            <Field label="Дистанция">
              <select
                className={inputClass}
                value={state.attackRange}
                onChange={updateField("attackRange")}
              >
                {ATTACK_RANGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тип урона">
              <select
                className={inputClass}
                value={state.damageType}
                onChange={updateField("damageType")}
              >
                {DAMAGE_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Кости">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={state.damageDieCount}
                  onInput={updateField("damageDieCount")}
                />
                <span className="text-sm text-slate-500">d</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={state.damageDieSize}
                  onInput={updateField("damageDieSize")}
                />
              </div>
            </Field>
            <Field label="Бонус">
              <input
                className={inputClass}
                type="number"
                value={state.damageBonus}
                onInput={updateField("damageBonus")}
              />
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Мотивы и тактика">
              <textarea
                className={textareaClass}
                value={state.motives}
                onInput={updateField("motives")}
              />
            </Field>
            <Field label="Опыт">
              <textarea
                className={textareaClass}
                value={state.experiences}
                onInput={updateField("experiences")}
              />
            </Field>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-dagger-gold">Свойства</h3>
              <button
                type="button"
                className="flex items-center gap-2 rounded-sm border border-dagger-gold/30 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-dagger-gold transition-colors hover:border-dagger-gold/60"
                onClick={addFeature}
              >
                <IconPlus size={13} />
                Добавить
              </button>
            </div>

            {state.features.length === 0 ? (
              <div className="rounded-sm border border-dashed border-slate-700 bg-slate-900/40 px-4 py-6 text-center text-sm italic text-slate-500">
                Свойства не указаны.
              </div>
            ) : (
              <div className="space-y-3">
                {state.features.map((feature) => (
                  <div key={feature.id} className="rounded-sm border border-slate-700 bg-slate-900/50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <input
                        className={inputClass}
                        value={feature.name}
                        placeholder="Название свойства"
                        onInput={(event) =>
                          updateFeature(feature.id, { name: event.currentTarget.value })
                        }
                      />
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-slate-700 text-slate-400 transition-colors hover:border-red-500/50 hover:text-red-300"
                        onClick={() => removeFeature(feature.id)}
                        title="Удалить свойство"
                      >
                        <IconMinus size={14} />
                      </button>
                    </div>
                    <textarea
                      className={textareaClass}
                      value={feature.text}
                      placeholder="Текст свойства. Поддерживается базовый markdown."
                      onInput={(event) =>
                        updateFeature(feature.id, { text: event.currentTarget.value })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <Field label="Основной текст">
            <textarea
              className={textareaClass}
              value={state.mainBody}
              onInput={updateField("mainBody")}
            />
          </Field>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-700 bg-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {isEditing && adversary && onDelete && (
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-sm border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/50"
                onClick={() => onDelete(adversary.id)}
              >
                <IconTrash size={15} />
                Удалить
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-sm border border-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="rounded-sm bg-dagger-gold px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-dagger-dark transition-colors hover:bg-yellow-500"
            >
              {isEditing ? "Сохранить" : isTemplateCreate ? "Создать копию" : "Создать"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
