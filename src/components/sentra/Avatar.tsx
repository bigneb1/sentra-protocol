export function AgentAvatar({
  name,
  color,
  size = 40,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-mono font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color}80)`,
        fontSize: size * 0.4,
      }}
    >
      {name.charAt(0)}
    </div>
  );
}
