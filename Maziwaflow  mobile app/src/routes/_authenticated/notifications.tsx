import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Maziwaflow Mobile" },
      { name: "description", content: "Your collection alerts and notifications." },
      { property: "og:title", content: "Notifications — Maziwaflow Mobile" },
      { property: "og:description", content: "Your collection alerts and notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Notifications,
});

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });

const TYPE_STYLE: Record<string, string> = {
  collection: "bg-maziwa-green/15 text-maziwa-green-deep",
  lipa_pole_pole: "bg-maziwa-purple/15 text-maziwa-purple",
  general: "bg-maziwa-blue/15 text-maziwa-blue",
};

function Notifications() {
  const { user } = Route.useRouteContext();
  const [items, setItems] = useState<Notification[] | null>(null);

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, type, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }, [user.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAllRead() {
    const unread = (items ?? []).filter((i) => !i.is_read);
    if (unread.length === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in(
        "id",
        unread.map((i) => i.id),
      );
    loadNotifications();
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    loadNotifications();
  }

  const unreadCount = (items ?? []).filter((i) => !i.is_read).length;

  return (
    <AppShell title="Notifications" subtitle={`${unreadCount} unread`} wide>
      {items !== null && unreadCount > 0 && (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-sm"
            onClick={markAllRead}
          >
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        </div>
      )}

      <ShellCard>
        {items === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg p-4 ring-1 transition ${
                  n.is_read ? "bg-muted/30 ring-border/40" : "bg-card ring-maziwa-blue/20 shadow-sm"
                }`}
                onClick={() => !n.is_read && markRead(n.id)}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                      TYPE_STYLE[n.type] ?? TYPE_STYLE["general"]
                    }`}
                  >
                    <Bell className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold">{n.title}</p>
                      {!n.is_read && (
                        <span className="size-2 shrink-0 rounded-full bg-maziwa-blue" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDate(n.created_at)} · {fmtTime(n.created_at)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ShellCard>
    </AppShell>
  );
}
