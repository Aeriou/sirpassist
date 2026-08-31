import type { KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const STORAGE = "sipr-pgp-vue";

export type PgpVue = "recap" | "actions";

export function rememberPgpVue(vue: PgpVue) {
  try {
    sessionStorage.setItem(STORAGE, vue);
  } catch {
    /* private mode */
  }
}

export function readPgpVue(): PgpVue {
  try {
    return sessionStorage.getItem(STORAGE) === "actions" ? "actions" : "recap";
  } catch {
    return "recap";
  }
}

export function PgpTabs({
  vue,
  ligne,
  sticky = true,
}: {
  vue: PgpVue;
  ligne?: string;
  sticky?: boolean;
}) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const next: PgpVue =
      e.key === "Home" ? "recap" : e.key === "End" ? "actions" : vue === "recap" ? "actions" : "recap";
    document.getElementById(`pgp-tab-${next}`)?.click();
  }

  return (
    <div
      role="tablist"
      aria-label="Plan annuel"
      onKeyDown={onKey}
      className={cn(
        "grid grid-cols-2 rounded-xl bg-surface p-1 shadow-[var(--shadow-border)]",
        sticky && "sticky top-14 z-20 md:top-4",
      )}
    >
      <Tab to="recap" active={vue === "recap"} />
      <Tab to="actions" active={vue === "actions"} ligne={ligne} />
    </div>
  );
}

function Tab({
  to,
  active,
  ligne,
}: {
  to: PgpVue;
  active: boolean;
  ligne?: string;
}) {
  return (
    <Link
      id={`pgp-tab-${to}`}
      role="tab"
      to="/pgp"
      search={to === "actions" ? { vue: "actions", ligne } : { vue: "recap" }}
      aria-selected={active}
      aria-controls={`pgp-panel-${to}`}
      tabIndex={active ? 0 : -1}
      resetScroll={to === "recap" || !ligne}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-lg px-3 text-center text-sm font-medium",
        active ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
      )}
    >
      {to === "recap" ? "Tableau récapitulatif" : "Actions du PAA"}
    </Link>
  );
}
