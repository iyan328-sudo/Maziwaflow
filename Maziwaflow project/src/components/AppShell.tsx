import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Droplets,
  LayoutDashboard,
  Milk,
  ClipboardList,
  CalendarDays,
  Users,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Wallet,
  CreditCard,
  Bell,
  MessageCircleQuestion,
  KeyRound,
  LogOut,
  HelpCircle,
  CheckCircle2,
  WifiOff,
  RotateCw,
  User as UserIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import { useOptionalRole, type Role } from "@/components/RoleViewContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  getTotalPendingCount,
  syncAllPending,
  onQueueUpdate,
} from "@/lib/offline-queue";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "clerk", "farmer"],
  },
  {
    label: "Receive Milk",
    to: "/receive-milk",
    icon: Milk,
    roles: ["admin", "clerk"],
  },
  {
    label: "Collections",
    to: "/collections",
    icon: ClipboardList,
    roles: ["admin", "clerk", "farmer"],
  },
  {
    label: "Daily Summary",
    to: "/daily-summary",
    icon: CalendarDays,
    roles: ["admin", "clerk"],
  },
  {
    label: "Farmer Directory",
    to: "/farmers",
    icon: Users,
    roles: ["admin", "clerk"],
  },
  {
    label: "Admin Overview",
    to: "/admin-dashboard",
    icon: BarChart3,
    roles: ["admin"],
  },
  {
    label: "Milk Prices",
    to: "/milk-prices",
    icon: TrendingUp,
    roles: ["admin"],
  },
  {
    label: "Staff Accounts",
    to: "/staff",
    icon: ShieldCheck,
    roles: ["admin"],
  },
  {
    label: "My Deliveries",
    to: "/farmer-dashboard",
    icon: BarChart3,
    roles: ["farmer"],
  },
  {
    label: "Payments",
    to: "/payments",
    icon: Wallet,
    roles: ["admin", "farmer"],
  },
  {
    label: "Lipa Pole Pole",
    to: "/lipa-pole-pole",
    icon: CreditCard,
    roles: ["admin", "farmer"],
  },
  {
    label: "Enquiries",
    to: "/enquiries",
    icon: MessageCircleQuestion,
    roles: ["admin", "clerk", "farmer"],
  },
  {
    label: "Notifications",
    to: "/notifications",
    icon: Bell,
    roles: ["admin", "clerk", "farmer"],
  },
];

const ROLE_BADGE_STYLES: Record<Role, { label: string; bg: string }> = {
  admin: { label: "Administrator", bg: "bg-maziwa-blue/15 text-maziwa-blue border-maziwa-blue/30" },
  clerk: { label: "Field Clerk", bg: "bg-maziwa-green/15 text-maziwa-green-deep border-maziwa-green/30" },
  farmer: { label: "Dairy Member", bg: "bg-maziwa-brown/15 text-maziwa-brown-deep border-maziwa-brown/30" },
};

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
  const router = useRouterState();
  const navigate = useNavigate();
  const currentPath = router.location.pathname;
  const role = useOptionalRole() || "admin";
  const online = useOnlineStatus();

  const [pendingCount, setPendingCount] = useState(getTotalPendingCount());
  const [syncing, setSyncing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string; email: string } | null>(null);

  const context = (
    router.location.state as { __TSR_context?: { user?: { id?: string; email?: string } } } | undefined
  )?.__TSR_context;
  const effectiveUserId = profile?.id || context?.user?.id;

  useEffect(() => {
    return onQueueUpdate(() => setPendingCount(getTotalPendingCount()));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const u = data.user;
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle()
          .then(({ data: p }) => {
            setProfile({
              id: u.id,
              email: u.email || "",
              name: p?.full_name || u.email?.split("@")[0] || "User",
            });
          });
      }
    });
  }, []);

  async function handleDesktopSync() {
    if (!online) {
      toast.error("Cannot sync while offline. Reconnect to the internet and retry.");
      return;
    }
    setSyncing(true);
    try {
      const summary = await syncAllPending();
      const total = summary.farmersSynced + summary.collectionsSynced;
      if (total > 0) {
        toast.success(`Synced ${total} pending records to cloud!`);
      } else {
        toast.info("All records are already up to date.");
      }
      setPendingCount(getTotalPendingCount());
    } catch {
      toast.error("Sync failed. Check connection.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const safeRole: Role =
    role === "clerk" || role === "farmer" || role === "admin" ? role : "admin";
  const roleInfo = ROLE_BADGE_STYLES[safeRole] || ROLE_BADGE_STYLES.admin;
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(safeRole));

  return (
    <div className="min-h-dvh bg-slate-50/60 dark:bg-background text-foreground antialiased flex flex-col lg:flex-row">
      {/* =========================================================================
          1. MOBILE TOP HEADER (< lg viewports)
          ========================================================================= */}
      <header className="sticky top-0 z-20 bg-maziwa-blue text-white shadow-lg shadow-maziwa-blue/30 lg:hidden">
        <div className="mx-auto flex min-h-16 w-full items-center gap-3 px-4 py-2.5 sm:px-5">
          {back ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-full bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground"
            >
              <Link to="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="size-4.5" />
              </Link>
            </Button>
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Droplets className="size-4.5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-extrabold">{title}</h1>
            <p className="truncate text-[11px] font-medium text-white/70">
              {subtitle ?? "Maziwaflow Mobile"}
            </p>
          </div>
          {effectiveUserId && <NotificationBell userId={effectiveUserId} />}
          <SyncMenu />
        </div>
      </header>

      {/* =========================================================================
          2. MAIN CONTENT AREA (Left of Desktop Right-Side Sidebar)
          ========================================================================= */}
      <div className="flex-1 min-h-dvh flex flex-col lg:mr-72 xl:mr-80 transition-all">
        {/* Desktop Sleek Top Bar (lg+ viewports) */}
        <div className="hidden lg:flex items-center justify-between px-8 py-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {back ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="size-8.5 rounded-lg border-border/80 hover:bg-accent"
              >
                <Link to="/dashboard" aria-label="Back to dashboard">
                  <ArrowLeft className="size-4 text-muted-foreground" />
                </Link>
              </Button>
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                  MaziwaFlow
                </span>
                <span className="text-muted-foreground/40 text-xs">/</span>
                <h1 className="text-base font-extrabold truncate text-foreground">{title}</h1>
              </div>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Network Status Indicator */}
            <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-muted/60 text-xs font-semibold ring-1 ring-border/50">
              <span
                className={`size-2 rounded-full ${
                  online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              <span className="text-[11px] text-muted-foreground">
                {online ? "Cloud Connected" : "Offline Mode"}
              </span>
            </div>

            {effectiveUserId && (
              <div className="bg-card rounded-full p-1 ring-1 ring-border/60">
                <NotificationBell userId={effectiveUserId} />
              </div>
            )}
            <SyncMenu />
          </div>
        </div>

        {/* Inner Content Canvas */}
        <main
          className={`mx-auto w-full flex-1 px-4 pt-5 pb-24 sm:px-6 sm:pt-6 lg:p-8 ${
            wide ? "max-w-5xl xl:max-w-6xl" : "max-w-3xl xl:max-w-4xl"
          }`}
        >
          {children}
        </main>
      </div>

      {/* =========================================================================
          3. GORGEOUS RIGHT-SIDE DESKTOP SIDEBAR (Fixed right on lg+ viewports)
          ========================================================================= */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:right-0 lg:top-0 lg:bottom-0 lg:w-72 xl:w-80 lg:border-l lg:border-border/60 lg:bg-card/95 lg:backdrop-blur-md lg:shadow-xl lg:z-30">
        {/* Brand Header */}
        <div className="p-5 border-b border-border/50 bg-gradient-to-br from-card to-muted/30">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-maziwa-blue flex items-center justify-center text-white shadow-md shadow-maziwa-blue/20 ring-2 ring-maziwa-blue/20">
              <Droplets className="size-5" />
            </div>
            <div className="min-w-0">
              <span className="font-black text-base tracking-tight text-foreground flex items-center gap-1.5">
                MaziwaFlow
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-maziwa-blue/10 text-maziwa-blue">
                  v2.0
                </span>
              </span>
              <p className="text-[11px] font-medium text-muted-foreground truncate">
                Dairy Operations Platform
              </p>
            </div>
          </div>

          {/* User Profile Card */}
          <div className="mt-4 rounded-xl bg-background/80 p-3 ring-1 ring-border/50 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="size-8.5 rounded-full bg-maziwa-blue/10 text-maziwa-blue flex items-center justify-center font-bold text-xs ring-1 ring-maziwa-blue/20 shrink-0">
                {profile?.name ? profile.name.charAt(0).toUpperCase() : <UserIcon className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">
                  {profile?.name || "Authenticated User"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {profile?.email || "Signed in"}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                Role
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${roleInfo.bg}`}
              >
                {roleInfo.label}
              </span>
            </div>
          </div>

          {/* Offline Sync Widget */}
          {pendingCount > 0 && (
            <div className="mt-3 rounded-lg bg-maziwa-orange/10 p-2.5 border border-maziwa-orange/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <WifiOff className="size-3.5 text-maziwa-orange-deep shrink-0" />
                <span className="text-[11px] font-bold text-maziwa-orange-deep truncate">
                  {pendingCount} offline {pendingCount === 1 ? "entry" : "entries"}
                </span>
              </div>
              {online && (
                <Button
                  size="sm"
                  onClick={handleDesktopSync}
                  disabled={syncing}
                  className="h-6 rounded-md bg-maziwa-orange-deep hover:bg-maziwa-orange-deep/90 text-[10px] font-bold px-2 text-white shrink-0"
                >
                  {syncing ? <RotateCw className="size-3 animate-spin" /> : "Sync"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-black tracking-wider text-muted-foreground/80 uppercase">
            Navigation Menu
          </p>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const isActive = currentPath === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-maziwa-blue text-white shadow-md shadow-maziwa-blue/25 font-bold"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`size-4 transition-transform group-hover:scale-110 ${
                      isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="truncate flex-1">{item.label}</span>
                  {isActive && (
                    <span className="size-1.5 rounded-full bg-white animate-pulse shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Settings & Sign Out */}
        <div className="p-3.5 border-t border-border/50 bg-background/50 space-y-1">
          <Link
            to="/change-password"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
          >
            <KeyRound className="size-4" />
            <span>Change Password</span>
          </Link>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition text-left cursor-pointer"
          >
            <HelpCircle className="size-4" />
            <span>Help & Documentation</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 transition text-left cursor-pointer mt-1"
          >
            <LogOut className="size-4" />
            <span>Sign Out</span>
          </button>

          <p className="pt-2 text-center text-[10px] text-muted-foreground/60 font-medium">
            MaziwaFlow · Secure Dairy Cloud
          </p>
        </div>
      </aside>

      {/* =========================================================================
          4. QUICK HELP DIALOG
          ========================================================================= */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="size-5 text-maziwa-blue" />
              Quick Help & Guide
            </DialogTitle>
            <DialogDescription>
              Everything you need to navigate MaziwaFlow effectively.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 text-xs text-muted-foreground pt-2">
            <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/40">
              <strong className="text-foreground block mb-0.5">Navigation & Menu</strong>
              Use the fixed right-side navigation on desktop or the top bar on mobile to access
              all operations tailored to your permissions.
            </div>
            <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/40">
              <strong className="text-foreground block mb-0.5">Offline-First Delivery</strong>
              Collections and farmer registrations entered during network loss are securely
              stored on your device and sync automatically upon reconnection.
            </div>
            <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/40">
              <strong className="text-foreground block mb-0.5">Clerk Earnings</strong>
              Field clerks earn a flat commission per liter configured by administrators,
              tracked live in the Clerk Dashboard.
            </div>
            <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/40">
              <strong className="text-foreground block mb-0.5">Receipts & SMS</strong>
              Milk collections automatically generate printable delivery slips and dispatch
              instant SMS confirmation alerts to farmers.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Floating Action Button (FAB) for Help (< lg viewports) */}
      <Button
        type="button"
        aria-label="Help"
        onClick={() => setHelpOpen(true)}
        className="fab-help fixed right-5 bottom-5 z-30 lg:hidden shadow-lg"
      >
        ?
      </Button>
    </div>
  );
}

export function ShellCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-card px-5 py-6 shadow-xl shadow-maziwa-blue/5 ring-1 ring-border/80 sm:px-7 sm:py-7 ${className}`}
    >
      {children}
    </section>
  );
}

export const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-sm font-medium outline-none transition focus:border-maziwa-blue focus:ring-2 focus:ring-maziwa-blue/20";
export const labelClass =
  "mb-1.5 block text-xs font-bold tracking-wide text-muted-foreground uppercase";
