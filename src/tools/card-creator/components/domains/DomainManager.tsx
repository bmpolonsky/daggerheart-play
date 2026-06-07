/** @jsxImportSource preact */
import { Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { useStream } from "../../../../core/hooks/useStream";
import type { DomainTheme } from "@cards/stores/domains";
import { domainService } from "@cards/services/domainService";
import { Button } from "@cards/components/ui/button";
import { Input } from "@cards/components/ui/input";
import { IconButton } from "../../../../ui/components/common";

interface DomainManagerProps {
  onClose: () => void;
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function DomainManager({ onClose }: DomainManagerProps) {
  const { domains } = useStream(domainService.domains$);
  const [filter, setFilter] = useState("");
  const [showCustomOnly, setShowCustomOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");
  const [newIcon, setNewIcon] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredDomains = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return domains
      .filter((domain) => (showCustomOnly ? domain.source === "custom" : true))
      .filter((domain) =>
        normalized
          ? domain.name.toLowerCase().includes(normalized) ||
            domain.id.toLowerCase().includes(normalized)
          : true
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [domains, filter, showCustomOnly]);

  const handleExport = () => {
    const content = domainService.exportDomains();
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "domains.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      domainService.importDomains(text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось импортировать файл");
    } finally {
      event.currentTarget.value = "";
    }
  };

  const handleAddDomain = () => {
    const id = normalizeSlug(newId);
    if (!id) {
      setError("Введите идентификатор домена");
      return;
    }
    if (domains.some((item) => item.id === id)) {
      setError("Домен с таким идентификатором уже существует");
      return;
    }
    domainService.addDomain({
      id,
      name: newName.trim() || id,
      color: newColor,
      icon: newIcon,
    });
    setNewId("");
    setNewName("");
    setNewColor("#6b7280");
    setNewIcon(null);
    setError(null);
  };

  const handleNewIconUpload = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setNewIcon(dataUrl);
  };

  const handleDomainIconUpload = async (
    domain: DomainTheme,
    event: JSX.TargetedEvent<HTMLInputElement, Event>
  ) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    domainService.updateDomain(domain.id, { icon: dataUrl });
  };

  const handleClearIcon = (domain: DomainTheme) => {
    domainService.updateDomain(domain.id, { icon: null });
  };

  return (
    <div className="domain-manager__backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="domain-manager"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="domain-manager__header">
          <div>
            <h2>Домены</h2>
            <p className="domain-manager__subtitle">
              Цвета и иконки влияют на баннеры и разделители.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
            ×
          </Button>
        </div>

        <div className="domain-manager__controls">
          <Input
            placeholder="Фильтр доменов..."
            value={filter}
            onInput={(event) => setFilter(event.currentTarget.value)}
          />
          <label className="domain-manager__checkbox">
            <input
              type="checkbox"
              checked={showCustomOnly}
              onChange={(event) => setShowCustomOnly(event.currentTarget.checked)}
            />
            Только кастомные
          </label>
          <div className="domain-manager__actions">
            <Button variant="secondary" onClick={handleExport}>Экспорт</Button>
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              Импорт
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImport}
              hidden
            />
            <Button variant="ghost" onClick={() => domainService.resetToDefaults()}>
              Сбросить
            </Button>
          </div>
        </div>

        {error && <div className="domain-manager__error">{error}</div>}

        <div className="domain-manager__list">
          {filteredDomains.map((domain) => {
            const isCustom = domain.source === "custom";
            return (
            <div key={domain.id} className="domain-card-editor">
              <div className="domain-card-editor__main">
                <div className="domain-card-editor__meta">
                  <Input
                    value={domain.name}
                    disabled={!isCustom}
                    onInput={(event) =>
                      domainService.updateDomain(domain.id, { name: event.currentTarget.value })
                    }
                  />
                  <span className="domain-card-editor__id">{domain.id}</span>
                </div>
                <div className="domain-card-editor__controls">
                  <input
                    type="color"
                    value={domain.color}
                    disabled={!isCustom}
                    onInput={(event) =>
                      domainService.updateDomain(domain.id, { color: event.currentTarget.value })
                    }
                  />
                  <Input
                    value={domain.color}
                    disabled={!isCustom}
                    onInput={(event) =>
                      domainService.updateDomain(domain.id, { color: event.currentTarget.value })
                    }
                  />
                </div>
              </div>
              <div className="domain-card-editor__icon">
                {domain.icon ? (
                  <img src={domain.icon} alt="" />
                ) : (
                  <div className="domain-card-editor__placeholder">Нет иконки</div>
                )}
                {isCustom && (
                  <div className="domain-card-editor__icon-actions">
                    <label className="domain-card-editor__upload">
                      <input
                        type="file"
                        accept="image/svg+xml,image/png"
                        onChange={(event) => handleDomainIconUpload(domain, event)}
                      />
                      Загрузить
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => handleClearIcon(domain)}>
                      Очистить
                    </Button>
                  </div>
                )}
              </div>
              {isCustom && (
                <IconButton
                  variant="ghost"
                  tone="danger"
                  size="sm"
                  type="button"
                  title="Удалить домен"
                  aria-label={`Удалить домен ${domain.name}`}
                  onClick={() => domainService.removeDomain(domain.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          )})}
        </div>

        <div className="domain-manager__create">
          <h3>Добавить домен</h3>
          <div className="domain-manager__create-grid">
            <Input
              placeholder="id (например, storm)"
              value={newId}
              onInput={(event) => setNewId(event.currentTarget.value)}
            />
            <Input
              placeholder="Название"
              value={newName}
              onInput={(event) => setNewName(event.currentTarget.value)}
            />
            <input
              type="color"
              value={newColor}
              onInput={(event) => setNewColor(event.currentTarget.value)}
            />
            <Input
              placeholder="#6b7280"
              value={newColor}
              onInput={(event) => setNewColor(event.currentTarget.value)}
            />
            <label className="domain-card-editor__upload">
              <input type="file" accept="image/svg+xml,image/png" onChange={handleNewIconUpload} />
              {newIcon ? "Иконка загружена" : "Загрузить иконку"}
            </label>
            <Button variant="secondary" onClick={handleAddDomain}>
              Добавить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
