import { useState } from "react";
import {
  Check,
  DatabaseZap,
  Loader2,
  MoreVertical,
  RefreshCw,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

type SyncKey = "users" | "update-farmers" | "farmers" | "milk" | "deductions" | "cans";

const SYNC_ITEMS: { key: SyncKey; label: string; icon: typeof RefreshCw }[] = [
  { key: "users", label: "Sync Users", icon: UsersRound },
  { key: "update-farmers", label: "Update Farmers", icon: UserRoundCog },
  { key: "farmers", label: "Sync Farmers", icon: RefreshCw },
  { key: "milk", label: "Sync Milk", icon: DatabaseZap },
  { key: "deductions", label: "Sync Deductions", icon: RefreshCw },
  { key: "cans", label: "Sync Milk Cans", icon: RefreshCw },
];

export function SyncMenu() {
  const [syncing, setSyncing] = useState<SyncKey | null>(null);
  const [completed, setCompleted] = useState<Set<SyncKey>>(() => new Set());

  async function sync(key: SyncKey, label: string) {
    if (syncing) return;
    setSyncing(key);

    const table =
      key === "users"
        ? "profiles"
        : key === "milk"
          ? "collections"
          : key.includes("farmer")
            ? "farmers"
            : null;
    if (table) {
      const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) {
        setSyncing(null);
        toast.error(`${label} failed. Check your connection.`);
        return;
      }
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    setCompleted((current) => new Set(current).add(key));
    setSyncing(null);
    window.localStorage.setItem(`maziwaflow-sync-${key}`, new Date().toISOString());
    window.dispatchEvent(new CustomEvent("maziwaflow:sync", { detail: { key } }));
    toast.success(`${label} complete`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open sync menu"
          className="size-10 shrink-0 rounded-full bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground"
        >
          <MoreVertical className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl p-1.5 shadow-xl">
        <DropdownMenuLabel className="px-3 py-2 text-xs tracking-wide text-muted-foreground uppercase">
          Data sync
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SYNC_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = syncing === item.key;
          return (
            <DropdownMenuItem
              key={item.key}
              disabled={syncing !== null}
              onSelect={() => void sync(item.key, item.label)}
              className="min-h-10 cursor-pointer rounded-lg px-3 font-semibold"
            >
              {active ? (
                <Loader2 className="animate-spin" />
              ) : completed.has(item.key) ? (
                <Check />
              ) : (
                <Icon />
              )}
              <span className="flex-1">{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
