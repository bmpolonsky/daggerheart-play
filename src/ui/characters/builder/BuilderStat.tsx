export function BuilderStat({ label, value }: { label: string; value: string | number }) {
  return <div className="dh-stat"><span className="dh-stat-label">{label}</span><strong className="dh-stat-value">{value}</strong></div>;
}
