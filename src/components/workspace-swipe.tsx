import { useRef, useState, type PointerEvent } from "react";
import { toast } from "sonner";
import { ConfirmDelete, DeleteIconButton } from "@/components/confirm-delete";
import { workspaceKindLabel } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/types";

const REVEAL = 108;

export function WorkspaceSwipeRow({
  workspace,
  active,
  onSelect,
  onDelete,
}: {
  workspace: Workspace;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [x, setX] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const origin = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const press = useRef<number>(0);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    origin.current = x;
    axis.current = null;
    press.current = window.setTimeout(() => {
      setX(-REVEAL);
    }, 420);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!axis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      window.clearTimeout(press.current);
    }
    if (axis.current !== "h") return;
    const next = Math.min(0, Math.max(-REVEAL, origin.current + dx));
    setX(next);
  }

  function onPointerUp() {
    window.clearTimeout(press.current);
    if (axis.current === "v") {
      axis.current = null;
      return;
    }
    setX((cur) => (cur < -REVEAL / 2 ? -REVEAL : 0));
    axis.current = null;
  }

  const kind = workspaceKindLabel(workspace.kind);

  return (
    <li className="overflow-hidden rounded-lg">
      <div className="relative flex min-w-0">
        <button
          type="button"
          className="absolute inset-y-0 right-11 flex w-[108px] items-center justify-center bg-danger text-sm font-semibold text-danger-fg"
          onClick={() => setConfirm(true)}
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={() => {
            if (x < -40) {
              setX(0);
              return;
            }
            onSelect();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ transform: `translate3d(${x}px,0,0)` }}
          className={cn(
            "relative z-10 min-h-11 min-w-0 flex-1 items-center justify-between px-3 text-left text-sm transition-transform duration-150 ease-out",
            "flex",
            active ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg shadow-[var(--shadow-border)]",
          )}
        >
          <span className="min-w-0 truncate">{workspace.name}</span>
          <span className="shrink-0 text-xs opacity-80">{active ? "Actif · " : ""}{kind}</span>
        </button>
        <div className="relative z-20 shrink-0 bg-surface-2">
          <DeleteIconButton
            label={`Supprimer l'espace ${workspace.name}`}
            title={`Retirer « ${workspace.name} » de cet appareil ?`}
            description="L'espace disparaît ici. Le cloud et le code restent valables. Confirmez pour continuer."
            confirmLabel="Oui, retirer"
            onConfirm={() => {
              onDelete();
              setX(0);
              toast.message(`Espace « ${workspace.name} » retiré de cet appareil.`);
            }}
          />
        </div>
      </div>
      <ConfirmDelete
        open={confirm}
        onOpenChange={setConfirm}
        title={`Retirer « ${workspace.name} » de cet appareil ?`}
        description="L'espace disparaît ici. Le cloud et le code restent valables. Confirmez pour continuer."
        confirmLabel="Oui, retirer"
        onConfirm={() => {
          onDelete();
          setX(0);
          toast.message(`Espace « ${workspace.name} » retiré de cet appareil.`);
        }}
      />
    </li>
  );
}
