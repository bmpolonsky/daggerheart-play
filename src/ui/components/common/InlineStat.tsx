type UiNode = any;

export function InlineStat({ label, value, hint }: { label: string; value: UiNode; hint?: UiNode }) {
  return (
    <div className="inline-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
