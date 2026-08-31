import { useMemo, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { matchVisitByName, normalizeVisitName, visitLabel } from "@/lib/workspace";
import type { Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VisitPicker({
  visits,
  name,
  onNameChange,
  workspaceName,
}: {
  visits: Visit[];
  name: string;
  onNameChange: (name: string) => void;
  workspaceName?: string;
}) {
  const [open, setOpen] = useState(false);
  const matched = matchVisitByName(visits, name);
  const q = normalizeVisitName(name);
  const suggestions = useMemo(() => {
    const list = q
      ? visits.filter((v) => {
          const hay = `${visitLabel(v)} ${v.site} ${v.company}`.toLocaleLowerCase("fr");
          return hay.includes(q);
        })
      : visits.filter((v) => v.status === "en_cours");
    return list.slice(0, 8);
  }, [visits, q]);

  return (
    <div className="space-y-2">
      <Field label="Visite (nom libre)">
        <Input
          value={name}
          autoComplete="off"
          placeholder="Ex. Atelier 3 Charleroi"
          onChange={(e) => {
            onNameChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        />
      </Field>
      {matched ? (
        <p className="text-xs text-accent">
          Rejoint la visite « {visitLabel(matched)} » — même dossier, même PGP
          {workspaceName ? ` (${workspaceName})` : ""}.
        </p>
      ) : name.trim() ? (
        <p className="text-xs text-muted">
          Nouvelle visite « {name.trim()} ». Tout constat du même nom rejoindra ce dossier et le PGP
          de l'espace{workspaceName ? ` « ${workspaceName} »` : ""}.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Tapez un nom : identique = même visite. Un nom nouveau crée la visite à l'enregistrement.
        </p>
      )}
      {open && suggestions.length > 0 ? (
        <ul className="overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-border)]">
          {suggestions.map((v) => {
            const active = matched?.id === v.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-12 w-full flex-col items-start px-3 py-2 text-left text-sm",
                    active ? "bg-accent-dim text-accent" : "text-fg hover:bg-surface-3",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onNameChange(visitLabel(v));
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{visitLabel(v)}</span>
                  <span className="text-xs text-muted">
                    {v.site || v.company}
                    {v.status === "en_cours" ? " · en cours" : " · terminée"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
