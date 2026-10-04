import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({ userId }: { userId: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    function loadCount() {
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .then(({ count }) => setUnread(count ?? 0));
    }
    loadCount();

    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadCount(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadCount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground transition hover:bg-primary-foreground/25"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-maziwa-pink text-[10px] font-bold text-white ring-2 ring-maziwa-blue">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
