/** @jsxImportSource preact */
import { useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AdversaryCard } from "@combat/components/adversaries/AdversaryCard";
import {
  IconClose,
  IconDownload,
  IconMenu,
  IconPlus,
  IconSearch,
  IconUpload,
} from "@combat/components/icons";
import { useStream } from "../../../../core/hooks/useStream";
import { adversariesService } from "@combat/services/adversariesService";
import { encounterService } from "@combat/services/encounterService";
import { customAdversaryEditorService } from "@combat/services/customAdversaryEditorService";
import { Button } from "../../../../ui/components/common/Button";
import { IconButton } from "../../../../ui/components/common/IconButton";
import { SelectControl, TextControl } from "../../../../ui/components/common/Field";

type CatalogNotice = {
  tone: "info" | "error";
  message: string;
} | null;

export function SidebarContainer() {
  const { searchTerm, tierFilter, roleFilter, items, isLoading, error } = useStream(adversariesService.adversaries$);
  const { isSidebarOpen } = useStream(encounterService.encounter$);
  const [catalogNotice, setCatalogNotice] = useState<CatalogNotice>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { filteredItems, roleOptions } = adversariesService.buildBrowserView();

  const uniqueTiers = useMemo(
    () => Array.from(new Set(items.map((item) => item.tier))).sort((left, right) => left - right),
    [items]
  );

  const customItemsCount = useMemo(() => items.filter((item) => item.isCustom).length, [items]);

  const handleExportCustom = () => {
    try {
      const content = adversariesService.exportCustomAdversaries();
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "custom-adversaries.json";
      link.click();
      URL.revokeObjectURL(url);
      setCatalogNotice(null);
    } catch (err) {
      setCatalogNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Не удалось экспортировать файл",
      });
    }
  };

  const handleImportCustom = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    try {
      const importedCount = adversariesService.importCustomAdversaries(await file.text());
      setCatalogNotice({ tone: "info", message: `Импортировано: ${importedCount}` });
    } catch (err) {
      setCatalogNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Не удалось импортировать файл",
      });
    } finally {
      event.currentTarget.value = "";
    }
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col">
      <header className="z-10 flex shrink-0 flex-col items-center justify-between gap-4 border-b border-slate-700 bg-dagger-dark p-4 shadow-md md:flex-row">
        <div className="flex w-full items-center gap-3 md:w-auto">
          <h1 className="whitespace-nowrap font-display text-2xl font-bold tracking-wide text-dagger-gold">
            Daggerheart Combat
          </h1>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto md:flex-nowrap">
          <div className="flex w-full items-center gap-2 md:w-auto">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                setCatalogNotice(null);
                customAdversaryEditorService.openCreate();
              }}
              title="Создать кастомного противника"
              iconBefore={<IconPlus size={14} aria-hidden="true" />}
            >
              Создать
            </Button>
            <IconButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => importInputRef.current?.click()}
              title="Импорт кастомных противников"
              aria-label="Импорт кастомных противников"
            >
              <IconUpload size={15} aria-hidden="true" />
            </IconButton>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportCustom}
              hidden
            />
            <IconButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleExportCustom}
              disabled={customItemsCount === 0}
              title="Экспорт кастомных противников"
              aria-label="Экспорт кастомных противников"
            >
              <IconDownload size={15} aria-hidden="true" />
            </IconButton>
          </div>

          <div className="relative w-full flex-grow md:w-64 md:flex-grow-0">
            <IconSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={16}
            />
            <TextControl
              type="text"
              placeholder="Поиск..."
              className="combat-search-input"
              value={searchTerm}
              onInput={(event) => adversariesService.setSearchTerm(event.currentTarget.value)}
            />
          </div>

          <div className="flex w-full items-center gap-2 md:w-auto">
            <span className="whitespace-nowrap text-xs text-slate-500 md:mr-1">
              {filteredItems.length} результатов
            </span>
            <SelectControl
              className="combat-filter-select"
              value={String(tierFilter)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                adversariesService.setTierFilter(value === "all" ? "all" : Number(value));
              }}
            >
              <option value="all">Любой ранг</option>
              {uniqueTiers.map((tier) => (
                <option key={tier} value={tier}>
                  Ранг {tier}
                </option>
              ))}
            </SelectControl>

            <SelectControl
              className="combat-filter-select combat-filter-select--role"
              value={roleFilter}
              onChange={(event) => adversariesService.setRoleFilter(event.currentTarget.value)}
            >
              <option value="all">Любая роль</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </SelectControl>
          </div>

          <IconButton
            type="button"
            className="combat-sidebar-toggle"
            variant="secondary"
            size="lg"
            onClick={() => encounterService.setSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? "Закрыть каталог" : "Открыть каталог"}
          >
            {isSidebarOpen ? <IconClose size={20} aria-hidden="true" /> : <IconMenu size={20} aria-hidden="true" />}
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-900/50 p-4 md:p-6">
        {catalogNotice && (
          <div
            className={`mb-4 rounded border px-3 py-2 text-sm ${
              catalogNotice.tone === "error"
                ? "border-red-500/30 bg-red-950/30 text-red-200"
                : "border-dagger-gold/20 bg-slate-800 text-slate-300"
            }`}
          >
            {catalogNotice.message}
          </div>
        )}
        {error && !isLoading && items.length > 0 && (
          <div className="mb-4 rounded border border-orange-500/30 bg-orange-950/30 px-3 py-2 text-sm text-orange-200">
            API недоступен: {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {isLoading && items.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <p className="text-lg text-slate-500">Загружаем противников...</p>
            </div>
          )}
          {error && !isLoading && items.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <p className="text-lg text-red-400">Не удалось загрузить список: {error}</p>
            </div>
          )}
          {(!error || items.length > 0) &&
            filteredItems.map((adversary) => (
              <AdversaryCard
                key={adversary.id}
                adversary={adversary}
                onAdd={() => encounterService.addAdversary(adversary)}
                onViewDetails={() => adversariesService.openDetails(adversary.id)}
                onEdit={
                  adversary.isCustom
                    ? () => customAdversaryEditorService.openEdit(adversary)
                    : undefined
                }
              />
            ))}
          {!isLoading && (!error || items.length > 0) && filteredItems.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <p className="text-lg text-slate-500">
                Противники, соответствующие критериям, не найдены.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
