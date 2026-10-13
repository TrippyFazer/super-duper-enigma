export function MacroRing({ value, target, label, size = 104 }: { value: number; target: number; label: string; size?: number }) {
  const pct = Math.min(1, target ? value / target : 0);
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const over = target > 0 && value > target * 1.1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.45)" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={over ? "#e6b45c" : "url(#ringGold)"} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease" }} />
        <defs>
          <linearGradient id="ringGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8a7137" />
            <stop offset="1" stopColor="#f0cf7e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular display text-[20px] font-semibold leading-none">{Math.round(value).toLocaleString()}</span>
        <span className="text-[10px] text-muted">
          / {target.toLocaleString()} {label}
        </span>
      </div>
    </div>
  );
}
