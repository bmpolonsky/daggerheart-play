/** @jsxImportSource preact */
import "./App.css";
import { useState } from "preact/hooks";
import { SidebarContainer } from "@cards/components/app/SidebarContainer";
import { WorkspaceContainer } from "@cards/components/app/WorkspaceContainer";
import { DomainManager } from "@cards/components/domains/DomainManager";
import { templatesService } from "@cards/services/templatesService";
import { domainService } from "@cards/services/domainService";
import { editorService } from "@cards/services/editorService";
import { customCardsService } from "@cards/services/customCardsService";

export default function App() {
  templatesService.ensureLoaded();
  domainService.ensureLoaded();
  editorService.ensureHashSync();
  customCardsService.list();

  const [showDomainManager, setShowDomainManager] = useState(false);

  return (
    <div className="app-shell russian">
      <SidebarContainer onOpenDomainManager={() => setShowDomainManager(true)} />
      <WorkspaceContainer onOpenDomainManager={() => setShowDomainManager(true)} />
      {showDomainManager && <DomainManager onClose={() => setShowDomainManager(false)} />}
    </div>
  );
}
