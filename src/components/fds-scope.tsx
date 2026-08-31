import { BookOpen, FolderOpen } from "lucide-react";
import { VisitPicker } from "@/components/visit-picker";
import type { Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

export type FdsScopeMode = "info" | "dossier";

export function FdsScope({
  mode,
  onModeChange,
  visits,
  visitName,
  onVisitNameChange,
  workspaceName,
  dossierLabel,
  linkLabel,
}: {
  mode: FdsScopeMode;
  onModeChange: (mode: FdsScopeMode) => void;
  visits: Visit[];
  visitName: string;
  onVisitNameChange: (name: string) => void;
  workspaceName?: string;
  dossierLabel: string;
  linkLabel: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <header>
        <h2 className="font-display text-lg font-semibold">Rattachement</h2>
        <p className="text-sm text-muted">
          Notice informative dans la bibliothèque, ou liée à {dossierLabel}.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={mode === "info"}
          onClick={() => onModeChange("info")}
          className={cn(
            "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150",
            mode === "info"
              ? "bg-accent-dim text-accent shadow-[var(--shadow-border)]"
              : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg",
          )}
        >
          <BookOpen className="size-5 shrink-0" />
          <span>
            <span className="block font-medium text-fg">Informative</span>
            <span className="block text-xs">Bibliothèque uniquement</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={mode === "dossier"}
          onClick={() => onModeChange("dossier")}
          className={cn(
            "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150",
            mode === "dossier"
              ? "bg-accent-dim text-accent shadow-[var(--shadow-border)]"
              : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg",
          )}
        >
          <FolderOpen className="size-5 shrink-0" />
          <span>
            <span className="block font-medium text-fg">{linkLabel}</span>
            <span className="block text-xs">Même PGP, même dossier</span>
          </span>
        </button>
      </div>
      {mode === "dossier" ? (
        <VisitPicker
          visits={visits}
          name={visitName}
          onNameChange={onVisitNameChange}
          workspaceName={workspaceName}
        />
      ) : (
        <p className="text-xs text-muted">
          La notice reste consultable dans FDS, sans apparaître dans un dossier client.
        </p>
      )}
    </section>
  );
}
