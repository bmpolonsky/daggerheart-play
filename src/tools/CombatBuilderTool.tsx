/** @jsxImportSource preact */
import CombatBuilderApp from '@combat/App';
import '@combat/tailwind.css';
import '@combat/index.css';

export function CombatBuilderTool() {
  return (
    <div className="tool-viewport tool-viewport--combat">
      <CombatBuilderApp />
    </div>
  );
}
