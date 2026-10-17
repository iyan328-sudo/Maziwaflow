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
  WifiOff,
  RotateCw,
  User as UserIcon,
  Search,
  Menu,
  ChevronDown,
  MapPin,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SyncMenu } from "@/components/StageTools";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOptionalRole, type Role } from "@/components/RoleViewContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  getTotalPendingCount,
  syncAllPending,
  onQueueUpdate,
  clearAllPendingRecords,
} from "@/lib/offline-queue";
import { supabase } from "@/integrations/supabase/client";

export type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

const SIDEBAR_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "clerk", "farmer"],
  },
  {
    label: "Farmers",
    to: "/farmers",
    icon: Users,
    roles: ["admin", "clerk"],
  },
  {
    label: "Collection",
    to: "/receive-milk",
    icon: Milk,
    roles: ["admin", "clerk"],
  },
  {
    label: "Payments",
    to: "/payments",
    icon: CreditCard,
    roles: ["admin", "farmer"],
  },
  {
    label: "Routes",
    to: "/collections",
    icon: MapPin,
    roles: ["admin", "clerk", "farmer"],
  },
  {
    label: "Reports",
    to: "/daily-summary",
    icon: BarChart3,
    roles: ["admin", "clerk"],
  },
  {
    label: "Settings",
    to: "/milk-prices",
    icon: Settings,
    roles: ["admin"],
  },
  {
    label: "Support",
    to: "/enquiries",
    icon: HelpCircle,
    roles: ["admin", "clerk", "farmer"],
  },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  clerk: "Clerk",
  farmer: "Farmer",
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{
    id: string;
    name: string;
    email: string;
    centre: string;
  } | null>(null);

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
          .select("full_name, collection_centre")
          .eq("id", u.id)
          .maybeSingle()
          .then(({ data: p }) => {
            setProfile({
              id: u.id,
              email: u.email || "",
              name: p?.full_name || u.email?.split("@")[0] || "Ian koskel",
              centre: p?.collection_centre || "Eldoret Hub",
            });
          })
          .catch(() => {
            setProfile({
              id: u.id,
              email: u.email || "",
              name: u.email?.split("@")[0] || "Ian koskel",
              centre: "Eldoret Hub",
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
  const roleLabel = ROLE_LABELS[safeRole] || "Admin";
  const centreLabel = profile?.centre || "Eldoret Hub";
  const visibleNavItems = SIDEBAR_ITEMS.filter((item) =>
    item.roles.includes(safeRole)
  );

  // Common dark sidebar content component used on both Desktop fixed sidebar and Mobile Drawer
  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full bg-[#0c1524] text-white select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#19273c]">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 group"
        >
          <div className="size-9 rounded-xl bg-white/10 flex items-center justify-center text-white ring-1 ring-white/20 group-hover:bg-white/20 transition">
            <Milk className="size-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
            MaziwaFlow
          </span>
        </Link>

        {/* User Profile Card right under branding */}
        <div className="mt-6 flex items-center gap-3">
          <div className="size-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-blue-400/30 shrink-0">
            <UserIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              Maziwaflow Mobile
            </p>
            <p className="text-xs text-slate-400 font-medium truncate">
              Karibu, {profile?.name || "Ian koskel"}
            </p>
          </div>
        </div>

        {/* Offline Sync pill in sidebar */}
        {pendingCount > 0 && (
          <div className="mt-4 rounded-xl bg-amber-500/15 p-2.5 border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="size-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-amber-300 truncate">
                {pendingCount} offline {pendingCount === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {online && (
                <Button
                  size="sm"
                  onClick={handleDesktopSync}
                  disabled={syncing}
                  className="h-6 rounded-md bg-amber-500 hover:bg-amber-600 text-[10px] font-bold px-2 text-slate-950"
                >
                  {syncing ? <RotateCw className="size-3 animate-spin" /> : "Sync"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => {
                  clearAllPendingRecords();
                  toast.info("Offline sync queue cleared.");
                }}
                title="Clear offline queue"
                className="size-6 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
        <nav className="space-y-1.5">
          {visibleNavItems.map((item) => {
            const isActive = currentPath === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-[#18263a] text-white ring-1 ring-white/10 shadow-sm font-bold"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon
                  className={`size-5 transition-transform ${
                    isActive ? "text-white scale-105" : "text-slate-400"
                  }`}
                />
                <span className="truncate flex-1">{item.label}</span>
                {isActive && (
                  <span className="size-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-4 border-t border-[#19273c] space-y-1 bg-[#09101c]">
        <button
          type="button"
          onClick={() => {
            setHelpOpen(true);
            onNavigate?.();
          }}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white transition cursor-pointer text-left"
        >
          <HelpCircle className="size-4" />
          <span>Help & Support</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition cursor-pointer text-left"
        >
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </button>

        <p className="pt-2 text-center text-[10px] text-slate-500 font-medium">
          MaziwaFlow · Eldoret Hub
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#f4f6fa] dark:bg-background text-foreground antialiased flex flex-col lg:flex-row">
      {/* =========================================================================
          1. MOBILE TOP HEADER (< lg viewports)
          ========================================================================= */}
      <header className="sticky top-0 z-20 bg-maziwa-blue text-white shadow-md lg:hidden">
        <div className="mx-auto flex min-h-16 w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            {/* Mobile Drawer Trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 border-r border-[#19273c] w-72 sm:w-80">
                <SidebarContent onNavigate={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            {back ? (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <Link to="/dashboard" aria-label="Back to dashboard">
                  <ArrowLeft className="size-4.5" />
                </Link>
              </Button>
            ) : null}

            <div className="min-w-0">
              <h1 className="truncate text-base leading-tight font-extrabold">{title}</h1>
              <p className="truncate text-[11px] font-medium text-white/70">
                {subtitle ?? "Maziwaflow Mobile"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {effectiveUserId && <NotificationBell userId={effectiveUserId} />}
            <SyncMenu />
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. GORGEOUS LEFT-SIDE DESKTOP SIDEBAR (Fixed left on lg+ viewports)
          ========================================================================= */}
      <aside className="hidden lg:block lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 xl:w-72 lg:z-30 border-r border-[#19273c] shadow-2xl">
        <SidebarContent />
      </aside>

      {/* =========================================================================
          3. MAIN CONTENT CANVAS (Shifted right by sidebar width on desktop)
          ========================================================================= */}
      <div className="flex-1 min-h-dvh flex flex-col lg:ml-64 xl:ml-72 transition-all">
        {/* Desktop Top Bar (lg+ viewports matching screenshot) */}
        <header className="hidden lg:flex items-center justify-between px-8 py-3.5 border-b border-border/60 bg-background/90 backdrop-blur-md sticky top-0 z-20">
          {/* Left: Hamburger & Search Input */}
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => {}}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/60 transition"
              aria-label="Navigation"
            >
              <Menu className="size-5" />
            </button>

            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-muted/40 border border-border/60 rounded-xl focus:bg-background focus:outline-none focus:ring-2 focus:ring-maziwa-blue/20 transition"
              />
            </div>
          </div>

          {/* Right: Live Connection, Notification Bell, User Dropdown */}
          <div className="flex items-center gap-4">
            {/* Live Network Status Indicator */}
            <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-muted/60 text-xs font-semibold ring-1 ring-border/50">
              <span
                className={`size-2 rounded-full ${
                  online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              <span className="text-[11px] text-muted-foreground">
                {online ? "Connected" : "Offline"}
              </span>
            </div>

            {effectiveUserId && (
              <div className="bg-card rounded-full p-1 ring-1 ring-border/60 relative">
                <NotificationBell userId={effectiveUserId} />
              </div>
            )}

            <SyncMenu />

            {/* User Dropdown matching 'Admin - Eldoret Hub v' in screenshot */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2.5 rounded-full pl-1.5 pr-3 py-1 bg-card hover:bg-accent border border-border/80 transition shadow-xs text-left cursor-pointer"
                >
                  <div className="size-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-blue-400/30">
                    <UserIcon className="size-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {roleLabel} - {centreLabel}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-bold text-foreground">
                      {profile?.name || "Ian koskel"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {profile?.email || "signed in"}
                    </p>
                    <span className="inline-block mt-1 w-fit rounded bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 text-[10px] font-extrabold text-blue-700 dark:text-blue-300">
                      {roleLabel} · {centreLabel}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/change-password" className="cursor-pointer">
                    <KeyRound className="mr-2 size-4" />
                    <span>Change Password</span>
                  </Link>
                </DropdownMenuItem>
                {safeRole === "admin" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/admin-dashboard" className="cursor-pointer">
                        <BarChart3 className="mr-2 size-4" />
                        <span>Admin Overview</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/milk-prices" className="cursor-pointer">
                        <TrendingUp className="mr-2 size-4" />
                        <span>Milk Pricing & Rates</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/staff" className="cursor-pointer">
                        <ShieldCheck className="mr-2 size-4" />
                        <span>Staff Accounts</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => setHelpOpen(true)}
                  className="cursor-pointer"
                >
                  <HelpCircle className="mr-2 size-4" />
                  <span>Help & Guide</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 size-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Inner Content Canvas */}
        <main
          className={`mx-auto w-full flex-1 px-4 pt-5 pb-24 sm:px-6 sm:pt-6 lg:p-8 ${
            wide ? "max-w-7xl" : "max-w-6xl"
          }`}
        >
          {children}
        </main>
      </div>

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
              <strong className="text-foreground block mb-0.5">Desktop Navigation</strong>
              Use the fixed left-side navigation on desktop or the hamburger drawer on mobile
              to access all operations tailored to your permissions.
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
      className={`rounded-2xl bg-card px-5 py-6 shadow-sm ring-1 ring-border/80 sm:px-7 sm:py-7 ${className}`}
    >
      {children}
    </section>
  );
}

export const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-sm font-medium outline-none transition focus:border-maziwa-blue focus:ring-2 focus:ring-maziwa-blue/20";
export const labelClass =
  "mb-1.5 block text-xs font-bold tracking-wide text-muted-foreground uppercase";
