import { Outlet, createFileRoute } from "@tanstack/react-router";

type Search = { visitId?: string };

export const Route = createFileRoute("/fds")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    visitId: typeof s.visitId === "string" ? s.visitId : undefined,
  }),
  component: FdsLayout,
});

function FdsLayout() {
  return <Outlet />;
}
