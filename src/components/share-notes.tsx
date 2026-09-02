import { useState } from "react";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { useSipr } from "@/lib/store";
import { formatStamp } from "@/lib/format";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";

/**
 * Fil de « notes de partage » signées d'un dossier ou d'un constat. Les deux
 * parties d'un aller-retour écrivent ici ; rien n'est écrasé, chaque note porte
 * son auteur. Affiché seulement quand l'élément a circulé par un partage.
 */
export function ShareNotes({ scope, id }: { scope: "visit" | "anomaly"; id: string }) {
  const record = useSipr((s) =>
    scope === "visit" ? s.visits.find((v) => v.id === id) : s.anomalies.find((a) => a.id === id),
  );
  const addShareNote = useSipr((s) => s.addShareNote);
  const [text, setText] = useState("");

  if (!record) return null;
  const shared = Boolean(record.sharedThreadId || record.shareOriginId);
  const notes = record.shareNotes ?? [];
  if (!shared && notes.length === 0) return null;

  function add() {
    const t = text.trim();
    if (!t) return;
    addShareNote(scope, id, t);
    setText("");
    toast.success("Note ajoutée.");
  }

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <MessagesSquare className="size-4 text-accent" />
        Notes de partage
      </h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted">
          Échangez ici avec {record.sharedFrom || "le collègue"} sans toucher au contenu du
          {scope === "visit" ? " dossier" : " constat"}.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-subtle">
                {n.author} · {stampOf(n.at)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter une note pour le collègue…"
          rows={2}
        />
        <Button size="sm" onClick={add} disabled={!text.trim()}>
          Ajouter la note
        </Button>
      </div>
    </section>
  );
}

function stampOf(iso: string): string {
  try {
    return formatStamp(new Date(iso));
  } catch {
    return iso;
  }
}
