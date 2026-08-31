import { RPS_DIMENSIONS, RPS_SCALE, type RpsScores } from "@/lib/rps";
import { cn } from "@/lib/utils";

const TONE = ["text-ok bg-ok/15", "text-accent bg-accent-dim", "text-warn bg-warn/15", "text-danger bg-danger/20"] as const;

export function RpsScoreGrid({
  scores,
  onChange,
}: {
  scores: RpsScores;
  onChange: (next: RpsScores) => void;
}) {
  return (
    <ul className="space-y-5">
      {RPS_DIMENSIONS.map((d) => (
        <li key={d.id} className="space-y-2">
          <div>
            <p className="font-medium">{d.label}</p>
            <p className="text-sm text-muted">{d.question}</p>
            <p className="text-xs text-subtle">{d.hint}</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {RPS_SCALE.map((s) => {
              const on = scores[d.id] === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onChange({ ...scores, [d.id]: s.value })}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center rounded-lg px-1 text-center text-xs font-medium",
                    on ? TONE[s.value] : "bg-surface-2 text-muted",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
