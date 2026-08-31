import { EXPOSURE, GRAVITY, LEVEL_META, PROBABILITY, buildKinney } from "@/lib/kinney";
import type { KinneyJustification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./risk-badge";

function OptionRow({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly { value: number; label: string; hint: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium tracking-wide text-muted">{title}</legend>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "min-h-11 rounded-lg px-2.5 py-2 text-left transition-[background-color,box-shadow,color] duration-150",
                active
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:bg-surface-3",
              )}
            >
              <span className="block font-display text-sm font-semibold tabular leading-none">
                {o.value}
              </span>
              <span className={cn("mt-1 block text-xs leading-snug", active ? "text-accent-fg/80" : "text-muted")}>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function KinneyCalculator({
  P,
  E,
  G,
  onChange,
  justification,
}: {
  P: number;
  E: number;
  G: number;
  onChange: (next: { P: number; E: number; G: number }) => void;
  justification?: KinneyJustification;
}) {
  const k = buildKinney(P, E, G);
  const meta = LEVEL_META[k.level];
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium tracking-wide text-muted">Score Kinney P × E × G</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-display text-4xl font-semibold tabular tracking-tight">{k.score}</p>
          <RiskBadge level={k.level} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {P} × {E} × {G} — {meta.action}
        </p>
      </div>
      {justification ? (
        <div className="space-y-1.5 rounded-xl bg-surface p-3 text-sm shadow-[var(--shadow-border)]">
          <p className="text-xs font-medium tracking-wide text-accent">Suggestion IA — à valider</p>
          <p className="text-muted">{justification.Pwhy}</p>
          <p className="text-muted">{justification.Ewhy}</p>
          <p className="text-muted">{justification.Gwhy}</p>
          <p className="text-xs text-subtle">{justification.legal}</p>
        </div>
      ) : null}
      <OptionRow
        title="Probabilité (P)"
        options={PROBABILITY}
        value={P}
        onChange={(v) => onChange({ P: v, E, G })}
      />
      <OptionRow
        title="Exposition (E)"
        options={EXPOSURE}
        value={E}
        onChange={(v) => onChange({ P, E: v, G })}
      />
      <OptionRow
        title="Gravité (G)"
        options={GRAVITY}
        value={G}
        onChange={(v) => onChange({ P, E, G: v })}
      />
    </div>
  );
}
