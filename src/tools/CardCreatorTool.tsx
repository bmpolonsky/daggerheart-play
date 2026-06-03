/** @jsxImportSource preact */
import CardCreatorApp from '@cards/App';
import '@cards/index.css';
import '@cards/card-site-base.css';
import '@cards/card-source.css';

export function CardCreatorTool() {
  return (
    <div className="tool-viewport tool-viewport--cards">
      <CardCreatorApp />
    </div>
  );
}
