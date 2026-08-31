import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Catch-all mount for this app's own Better Auth at `/api/auth/*`
 * (sign-up, sign-in, get-session, sign-out, …). Every auth request is handled
 * server-side against the database in `DATABASE_URL`.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
