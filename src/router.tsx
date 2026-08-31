import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function PendingScreen() {
  return (
    <div className="grid min-h-[40vh] place-items-center px-6 text-sm text-muted">
      Chargement…
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultPendingComponent: PendingScreen,
    defaultPendingMs: 120,
    defaultPendingMinMs: 0,
  });
}
