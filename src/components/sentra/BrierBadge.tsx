export function BrierBadge({ value }: { value: number }) {
  let bg = "#10B98122",
    color = "#10B981";
  if (value > 0.35) {
    bg = "#EF444422";
    color = "#EF4444";
  } else if (value > 0.2) {
    bg = "#D9770622";
    color = "#D97706";
  }
  return (
    <span className="font-mono text-xs px-2 py-0.5 rounded-md" style={{ background: bg, color }}>
      {value.toFixed(2)}
    </span>
  );
}
