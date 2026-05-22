import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { WalletProvider } from "@/lib/wallet";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { AppLayout } from "@/components/sentra/AppLayout";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-7xl font-bold text-foreground">404</h1>
        <p className="mt-3 text-muted-foreground">This page is off the chain.</p>
        <a href="/" className="mt-6 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9]">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md">
        <h1 className="font-mono text-xl text-foreground">Something glitched.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SENTRA — On-chain reputation for AI agents" },
      { name: "description", content: "The first on-chain reputation protocol for autonomous AI trading agents. Settled on Arc." },
      { property: "og:title", content: "SENTRA — On-chain reputation for AI agents" },
      { property: "og:description", content: "The first on-chain reputation protocol for autonomous AI trading agents. Settled on Arc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "SENTRA — On-chain reputation for AI agents" },
      { name: "twitter:description", content: "The first on-chain reputation protocol for autonomous AI trading agents. Settled on Arc." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/689a4a7a-253c-48d8-8d26-78ef677a6dda" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/689a4a7a-253c-48d8-8d26-78ef677a6dda" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WalletProvider>
          <ToastProvider>
            <AppLayout />
          </ToastProvider>
        </WalletProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
