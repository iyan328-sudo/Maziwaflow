import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Droplets, Loader2, User, Users, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign In — Maziwaflow Mobile" },
      { name: "description", content: "Sign in to Maziwaflow — Clerk, Farmer, or Admin." },
      { property: "og:title", content: "Sign In — Maziwaflow Mobile" },
      { property: "og:description", content: "Sign in to Maziwaflow — Clerk, Farmer, or Admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Role = "clerk" | "farmer" | "admin";

const ROLE_INFO: { id: Role; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "clerk", label: "Clerk", desc: "Record milk collections", icon: User },
  { id: "farmer", label: "Farmer", desc: "Track your deliveries", icon: Users },
];

const SIGNIN_ROLE_INFO: { id: Role; label: string; desc: string; icon: LucideIcon }[] = [
  ...ROLE_INFO,
  { id: "admin", label: "Admin", desc: "Manage the system", icon: Shield },
];

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
const signUpSchema = signInSchema.extend({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  collection_centre: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<Role>("clerk");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    collection_centre: "",
    phone: "",
  });
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
            emailRedirectTo: window.location.origin,
            data: {
              full_name: p.data.full_name,
              collection_centre: p.data.collection_centre || undefined,
              role: selectedRole,
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
    setMode((m) => {
      if (m === "signin") {
        if (selectedRole === "admin") setSelectedRole("clerk");
        return "signup";
      }
      return "signin";
    });
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

          <div>
            <span className={labelClass}>Select your role</span>
            <div className="grid grid-cols-3 gap-2">
              {(mode === "signin" ? SIGNIN_ROLE_INFO : ROLE_INFO).map((r) => {
                const Icon = r.icon;
                const active = selectedRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRole(r.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition ring-1 ${
                      active
                        ? "bg-maziwa-blue text-primary-foreground ring-maziwa-blue shadow-md"
                        : "bg-background text-foreground ring-border hover:ring-maziwa-blue/50"
                    }`}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-bold">{r.label}</span>
                    <span className={`text-[10px] leading-tight ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {r.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className={labelClass} htmlFor="full_name">Full Name</label>
                  <input
                    id="full_name"
                    className={fieldClass}
                    value={form.full_name}
                    onChange={set("full_name")}
                    placeholder="e.g. Grace Chepkemoi"
                  />
                </div>
                {selectedRole !== "farmer" && (
                  <div>
                    <label className={labelClass} htmlFor="centre">Collection Centre</label>
                    <input
                      id="centre"
                      className={fieldClass}
                      value={form.collection_centre}
                      onChange={set("collection_centre")}
                      placeholder="e.g. Kapsabet Cooler"
                    />
                  </div>
                )}
                {selectedRole === "farmer" && (
                  <div>
                    <label className={labelClass} htmlFor="phone">Phone Number</label>
                    <input
                      id="phone"
                      className={fieldClass}
                      value={form.phone}
                      onChange={set("phone")}
                      placeholder="e.g. +254712345678"
                    />
                  </div>
                )}
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="email">Email Address</label>
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
              <label className={labelClass} htmlFor="password">Password</label>
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
              {mode === "signin"
                ? `Sign In as ${SIGNIN_ROLE_INFO.find((r) => r.id === selectedRole)?.label}`
                : "Create Account"}
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
