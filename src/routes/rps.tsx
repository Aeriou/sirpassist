import { Outlet, createFileRoute } from "@tanstack/react-router";

type Search = { visitId?: string };

export const Route = createFileRoute("/rps")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    visitId: typeof s.visitId === "string" ? s.visitId : undefined,
  }),
  component: RpsLayout,
});

function RpsLayout() {
  return <Outlet />;
}
