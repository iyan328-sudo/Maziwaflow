import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Droplets } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SyncMenu } from "@/components/StageTools";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AppShell({
  title,
  subtitle,
  back = true,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string | undefined;
  back?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  const width = wide ? "max-w-md sm:max-w-3xl" : "max-w-md sm:max-w-lg";
  const router = useRouterState();
  const context = (
    router.location.state as { __TSR_context?: { user?: { id?: string } } } | undefined
  )?.__TSR_context;
  const userId = context?.user?.id;
  return (
    <div className="flex min-h-dvh flex-col bg-milk">
      <header className="sticky top-0 z-20 bg-maziwa-blue text-white shadow-lg shadow-maziwa-blue/30">
        <div
          className={`mx-auto flex min-h-18 w-full ${width} items-center gap-3 px-4 py-3 sm:px-5`}
        >
          {back ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground"
            >
              <Link to="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Droplets className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg leading-tight font-extrabold">{title}</h1>
            <p className="truncate text-xs font-medium text-white/70">
              {subtitle ?? "Maziwaflow Mobile"}
            </p>
          </div>
          {userId && <NotificationBell userId={userId} />}
          <SyncMenu />
        </div>
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 pt-6 pb-24 sm:px-5 sm:pt-8`}>
        {children}
      </main>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            aria-label="Help"
            className="fab-help fixed right-5 bottom-5 z-30 sm:right-8 sm:bottom-8"
          >
            ?
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick help</DialogTitle>
            <DialogDescription>Find your way around Maziwaflow Mobile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Dashboard:</strong> choose an action to record
              milk, browse collections, or open other tools available to your account.
            </p>
            <p>
              <strong className="text-foreground">Offline work:</strong> unsynced collection entries
              are saved on this device and sync when you reconnect.
            </p>
            <p>
              <strong className="text-foreground">Need access?</strong> Contact an administrator for
              account or staff-role assistance.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ShellCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-lg bg-card px-5 py-6 shadow-xl shadow-maziwa-blue/10 ring-1 ring-border sm:px-7 sm:py-7">
      {children}
    </section>
  );
}

export const fieldClass =
  "h-12 w-full rounded-lg border border-input bg-background px-4 text-sm font-medium outline-none transition focus:border-maziwa-blue focus:ring-2 focus:ring-maziwa-blue/20";
export const labelClass =
  "mb-1.5 block text-xs font-bold tracking-wide text-muted-foreground uppercase";
