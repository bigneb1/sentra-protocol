import { useEffect, useState } from "react";
import { getArcStatus, ARC_EXPLORER } from "@/lib/arcTestnet";
import { ExternalLink } from "lucide-react";

export function ArcStatus({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<{ blockNumber: number; gasPriceMicroUsdc: number } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await getArcStatus();
        if (alive) {
          setS(data);
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
        <span
          className={`w-1.5 h-1.5 rounded-full ${err ? "bg-[#EF4444]" : "bg-[#10B981] dot-pulse"}`}
        />
        {err ? "RPC down" : s ? `#${s.blockNumber.toLocaleString()}` : "…"}
      </div>
    );
  }

  return (
    <div className="sentra-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Arc Testnet · Live
        </div>
        <a
          href={ARC_EXPLORER}
          target="_blank"
          rel="noreferrer"
          className="text-primary-light hover:text-primary text-xs inline-flex items-center gap-1"
        >
          Explorer <ExternalLink size={11} />
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Status</div>
          <div className="font-mono text-sm mt-1 flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${err ? "bg-[#EF4444]" : "bg-[#10B981] dot-pulse"}`}
            />
            {err ? "Down" : "Healthy"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Block</div>
          <div className="font-mono text-sm mt-1">
            {s ? `#${s.blockNumber.toLocaleString()}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Gas (uUSDC)</div>
          <div className="font-mono text-sm mt-1">{s ? s.gasPriceMicroUsdc.toFixed(2) : "—"}</div>
        </div>
      </div>
    </div>
  );
}
