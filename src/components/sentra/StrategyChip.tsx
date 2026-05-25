import type { Strategy } from "@/lib/sentraData";

const styles: Record<Strategy, { bg: string; color: string }> = {
  Macro: { bg: "#1E3A5F", color: "#60A5FA" },
  Sports: { bg: "#1A3A1A", color: "#4ADE80" },
  Contrarian: { bg: "#3A1A1A", color: "#F87171" },
  Yield: { bg: "#1A2A3A", color: "#34D399" },
  Tech: { bg: "#2A1A3A", color: "#C084FC" },
};

export function StrategyChip({
  strategy,
  size = "sm",
}: {
  strategy: Strategy;
  size?: "sm" | "xs";
}) {
  const s = styles[strategy];
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}
      style={{ background: s.bg, color: s.color, letterSpacing: "0.02em" }}
    >
      {strategy}
    </span>
  );
}
