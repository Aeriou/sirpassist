import { ClipboardList, FileText, HardHat, Shield, Tags, Wind } from "lucide-react";
import { Field, Textarea } from "@/components/ui/input";
import { FDS_REALITY_QUESTIONS, FDS_REALITY_THEMES } from "@/lib/fds-reality";
import type { FdsReality, FdsRealityTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

const THEME_ICONS = {
  fds: FileText,
  etiquettes_clp: Tags,
  ventilation: Wind,
  epi: HardHat,
  protection_collective: Shield,
} as const;

export function FdsRealityForm({
  value,
  onChange,
}: {
  value: FdsReality;
  onChange: (next: FdsReality) => void;
}) {
  const themes = value.themes ?? [];

  function patch(partial: Partial<FdsReality>) {
    onChange({ ...value, ...partial });
  }

  function toggleTheme(id: FdsRealityTheme) {
    const next = themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id];
    patch({ themes: next });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <header className="flex gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-dim text-accent">
          <ClipboardList className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">La réalité — questions à poser</h2>
          <p className="text-sm text-muted">
            Facultatif. Sur le poste, pas seulement sur l'étiquette. Laissez vide ce que vous
            ne savez pas encore.
          </p>
        </div>
      </header>

      <ol className="space-y-3">
        {FDS_REALITY_QUESTIONS.map((q, i) => (
          <li key={q.key}>
            <Field label={`${i + 1}. ${q.label}`}>
              <Textarea
                className="min-h-20"
                value={value[q.key] ?? ""}
                placeholder={q.hint}
                onChange={(e) => patch({ [q.key]: e.target.value })}
              />
            </Field>
          </li>
        ))}
      </ol>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted">
          Points à considérer sur le poste
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FDS_REALITY_THEMES.map((t) => {
            const Icon = THEME_ICONS[t.id];
            const on = themes.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  title={t.hint}
                  onClick={() => toggleTheme(t.id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150",
                    on
                      ? "bg-accent-dim text-accent shadow-[var(--shadow-border)]"
                      : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="font-medium">{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function FdsRealityRead({ value }: { value: FdsReality }) {
  const themes = value.themes ?? [];
  return (
    <section className="space-y-4 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <header className="flex gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-dim text-accent">
          <ClipboardList className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">La réalité</h2>
          <p className="text-sm text-muted">Analyse de poste — questions posées sur le terrain.</p>
        </div>
      </header>
      <dl className="space-y-3">
        {FDS_REALITY_QUESTIONS.map((q) => {
          const answer = (value[q.key] ?? "").trim();
          if (!answer) return null;
          return (
            <div key={q.key}>
              <dt className="text-xs font-medium tracking-wide text-muted">{q.label}</dt>
              <dd className="mt-1 text-sm">{answer}</dd>
            </div>
          );
        })}
      </dl>
      {themes.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {FDS_REALITY_THEMES.filter((t) => themes.includes(t.id)).map((t) => {
            const Icon = THEME_ICONS[t.id];
            return (
              <li
                key={t.id}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-dim px-3 text-xs font-medium text-accent"
              >
                <Icon className="size-3.5" />
                {t.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
