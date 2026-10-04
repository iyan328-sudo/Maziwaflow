import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => ({
    meta: [
      { title: "Change Password — Maziwaflow Mobile" },
      { name: "description", content: "Update your Maziwaflow staff account password." },
      { property: "og:title", content: "Change Password — Maziwaflow Mobile" },
      { property: "og:description", content: "Update your Maziwaflow staff account password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePassword,
});

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "New password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "New passwords do not match" })
  .refine((d) => d.next !== d.current, { message: "New password must differ from current" });

function ChangePassword() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    if (!user.email) return void toast.error("Your account email is unavailable");
    setBusy(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: p.data.current,
    });
    if (authErr) {
      setBusy(false);
      return void toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: p.data.next });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Password updated successfully");
    navigate({ to: "/dashboard" });
  }

  const field = (k: keyof typeof f, label: string, ac: string) => (
    <div>
      <label className={labelClass} htmlFor={k}>
        {label}
      </label>
      <input
        id={k}
        type="password"
        autoComplete={ac}
        className={fieldClass}
        value={f[k]}
        onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <AppShell title="Change Password" subtitle={user.email ?? undefined}>
      <ShellCard>
        <form onSubmit={submit} className="space-y-5">
          {field("current", "Current Password", "current-password")}
          {field("next", "New Password", "new-password")}
          {field("confirm", "Confirm New Password", "new-password")}
          <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          <Button
            type="submit"
            disabled={busy}
            className="pill-action h-auto justify-center bg-maziwa-purple hover:bg-maziwa-purple/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Update Password
          </Button>
        </form>
      </ShellCard>
    </AppShell>
  );
}
