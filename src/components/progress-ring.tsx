/** วงแหวนความคืบหน้า 0–100 — ครบ 100 เป็นสีเขียวพร้อมเครื่องหมายถูก */
export function ProgressRing({ value, size = 28 }: { value: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const done = value >= 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-border" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={done ? "stroke-success" : "stroke-primary"}
      />
      {done && <path d={`M${size * 0.32} ${size * 0.52} l${size * 0.12} ${size * 0.12} l${size * 0.22} -${size * 0.26}`} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-success" />}
    </svg>
  );
}
