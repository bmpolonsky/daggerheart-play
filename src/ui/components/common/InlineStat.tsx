type UiNode = any;

export interface InlineStatProps {
  label: string;
  value: UiNode;
  hint?: UiNode;
}

export function InlineStat({ label, value, hint }: InlineStatProps) {
  return (
    <div className="inline-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
