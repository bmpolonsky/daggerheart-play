/** @jsxImportSource preact */
import { useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AdversaryCard } from "@combat/components/adversaries/AdversaryCard";
import {
  IconClose,
  IconDownload,
  IconMenu,
  IconPlus,
  IconUpload,
} from "@combat/components/icons";
import { useStream } from "../../../../core/hooks/useStream";
import { adversariesService } from "@combat/services/adversariesService";
import { encounterService } from "@combat/services/encounterService";
import { customAdversaryEditorService } from "@combat/services/customAdversaryEditorService";
import { Button } from "../../../../ui/components/common/Button";
import { EmptyState } from "../../../../ui/components/common/EmptyState";
import { IconButton } from "../../../../ui/components/common/IconButton";
import { Notice } from "../../../../ui/components/common/Notice";
import { SearchField } from "../../../../ui/components/common/SearchField";
import { SelectControl } from "../../../../ui/components/common/Field";

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
      <header className="combat-browser-header z-10 flex shrink-0 flex-col items-center justify-between gap-4 border-b border-slate-700 bg-dagger-dark p-4 shadow-md md:flex-row">
        <div className="combat-browser-controls flex w-full flex-wrap items-center gap-3 md:flex-nowrap">
          <div className="combat-browser-create flex w-full items-center gap-2 md:w-auto">
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
          </div>

          <div className="combat-browser-search w-full flex-grow md:w-64 md:flex-grow-0">
            <SearchField
              placeholder="Поиск..."
              value={searchTerm}
              onInput={(event: any) => adversariesService.setSearchTerm(event.currentTarget.value)}
            />
          </div>

          <div className="combat-browser-filters flex w-full items-center gap-2 md:w-auto">
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

          <div className="combat-browser-actions flex w-full items-center justify-end gap-2 md:ml-auto md:w-auto">
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
            <IconButton
              type="button"
              className="combat-sidebar-toggle"
              variant="secondary"
              size="lg"
              onClick={() => encounterService.setSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Закрыть бой" : "Открыть бой"}
              title={isSidebarOpen ? "Закрыть бой" : "Открыть бой"}
            >
              {isSidebarOpen ? <IconClose size={20} aria-hidden="true" /> : <IconMenu size={20} aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-900/50 p-4 md:p-6">
        {catalogNotice && (
          <Notice className="mb-4" tone={catalogNotice.tone === "error" ? "error" : "info"}>
            {catalogNotice.message}
          </Notice>
        )}
        {error && !isLoading && items.length > 0 && (
          <Notice className="mb-4" tone="warning">
            API недоступен: {error}
          </Notice>
        )}
        <div className="combat-adversary-grid grid grid-cols-2 gap-3 pb-20 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {isLoading && items.length === 0 && (
            <EmptyState
              className="col-span-full py-20"
              size="md"
              title="Загружаем противников..."
            />
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
            <EmptyState
              className="col-span-full py-20"
              size="md"
              title="Ничего не найдено"
              body="Противники, соответствующие критериям, не найдены."
            />
          )}
        </div>
      </div>
    </main>
  );
}
