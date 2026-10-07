import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Droplets, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign In — Maziwaflow Mobile" },
      { name: "description", content: "Sign in or create a farmer account for Maziwaflow." },
      { property: "og:title", content: "Sign In — Maziwaflow Mobile" },
      { property: "og:description", content: "Sign in or create a farmer account for Maziwaflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
const signUpSchema = signInSchema.extend({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });

  useEffect(() => {
    const isEmailConfirmation = new URLSearchParams(window.location.search).get("verified") === "1";
    if (!isEmailConfirmation) return;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
        session?.user.email_confirmed_at
      ) {
        toast.success("Email verified successfully.");
        navigate({ to: "/dashboard" });
      }
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const p = signInSchema.safeParse(form);
        if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
        const { error } = await supabase.auth.signInWithPassword(p.data);
        if (error) return void toast.error(error.message);
        navigate({ to: "/dashboard" });
      } else {
        const p = signUpSchema.safeParse(form);
        if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
        const { data, error } = await supabase.auth.signUp({
          email: p.data.email,
          password: p.data.password,
          options: {
            emailRedirectTo: new URL(
              "/auth?verified=1",
              import.meta.env["VITE_APP_URL"]?.trim() || window.location.origin,
            ).toString(),
            data: {
              full_name: p.data.full_name,
            },
          },
        });
        if (error) return void toast.error(error.message);
        if (data.session) navigate({ to: "/dashboard" });
        else {
          toast.success("Account created — check your email to confirm, then sign in.");
          setMode("signin");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-milk">
      <header className="bg-maziwa-blue px-5 pt-10 pb-18 text-center text-primary-foreground sm:pt-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-foreground/15">
          <Droplets className="size-7" />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold">Maziwaflow Mobile</h1>
        <p className="text-sm text-primary-foreground/70">Dairy Collection System</p>
      </header>
      <main className="mx-auto -mt-12 w-full max-w-md flex-1 px-4 pb-16">
        <div className="space-y-5 rounded-lg bg-card px-5 py-6 shadow-xl shadow-maziwa-blue/10 ring-1 ring-border sm:px-7 sm:py-7">
          <h2 className="text-center text-lg font-extrabold">
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h2>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className={labelClass} htmlFor="full_name">
                    Full Name
                  </label>
                  <input
                    id="full_name"
                    className={fieldClass}
                    value={form.full_name}
                    onChange={set("full_name")}
                    placeholder="e.g. Grace Chepkemoi"
                  />
                </div>
                <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  New accounts are registered as farmers. Staff accounts must be created by an
                  admin.
                </p>
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={fieldClass}
                value={form.email}
                onChange={set("email")}
                placeholder="you@maziwaflow.co.ke"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className={fieldClass}
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="pill-action h-auto justify-center bg-maziwa-blue hover:bg-maziwa-blue/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>
          <Button
            type="button"
            variant="link"
            onClick={toggleMode}
            className="h-auto w-full whitespace-normal text-center text-sm font-semibold text-maziwa-blue"
          >
            {mode === "signin" ? "New user? Create an account" : "Already have an account? Sign in"}
          </Button>
        </div>
      </main>
    </div>
  );
}
