import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { SessionBridge } from "@/components/session-bridge";
import { UserStoreHost } from "@/components/user-store-host";
import { ChunkReloadGuard } from "@/components/chunk-reload-guard";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "SiprAssist";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0c1218" },
      {
        name: "permissions-policy",
        content: "camera=(self), microphone=(self), geolocation=(self)",
      },
      {
        name: "description",
        content:
          "Assistant SIPP de terrain : signalement photo et dictée, calcul Kinney, PGP et notices FDS.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Sora:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="fr" suppressHydrationWarning className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <ChunkReloadGuard />
        <AuthProvider>
          <SessionBridge />
          <UserStoreHost />
          <AppShell>
            <Outlet />
          </AppShell>
          <Toaster theme="dark" position="top-center" richColors={false} />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
