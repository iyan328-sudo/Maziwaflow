import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, Shield, User, KeyRound, Pencil, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff Accounts — Maziwaflow Mobile" },
      { name: "description", content: "Manage clerk and admin staff accounts." },
      { property: "og:title", content: "Staff Accounts — Maziwaflow Mobile" },
      { property: "og:description", content: "Manage clerk and admin staff accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Staff,
});

type StaffMember = {
  id: string;
  full_name: string | null;
  collection_centre: string | null;
  role: string;
  created_at: string;
};

const ROLE_STYLE: Record<string, string> = {
  admin: "bg-maziwa-blue/15 text-maziwa-blue",
  clerk: "bg-maziwa-green/15 text-maziwa-green-deep",
  farmer: "bg-muted text-muted-foreground",
};

const STAFF_ROLES = ["clerk", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function Staff() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<StaffMember[] | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [roleTarget, setRoleTarget] = useState<StaffMember | null>(null);
  const [newRole, setNewRole] = useState<StaffRole>("clerk");
  const [pwdTarget, setPwdTarget] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    collection_centre: "",
    role: "clerk" as StaffRole,
    password: "",
  });
  const [pwdForm, setPwdForm] = useState("");

  const loadStaff = useCallback(() => {
    supabase
      .from("profiles")
      .select("id, full_name, collection_centre, role, created_at")
      .in("role", ["admin", "clerk"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as StaffMember[]) ?? []));
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        !s ||
        r.full_name?.toLowerCase().includes(s) ||
        r.collection_centre?.toLowerCase().includes(s),
    );
  }, [rows, q]);

  const adminCount = (rows ?? []).filter((r) => r.role === "admin").length;
  const clerkCount = (rows ?? []).filter((r) => r.role === "clerk").length;

  async function callStaffApi(body: Record<string, unknown>) {
    const { data: session } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token ?? ""}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email || !createForm.password || !createForm.full_name) {
      return void toast.error("All fields are required");
    }
    if (createForm.password.length < 8) {
      return void toast.error("Password must be at least 8 characters");
    }
    setBusy(true);
    try {
      await callStaffApi({
        action: "create",
        email: createForm.email,
        password: createForm.password,
        full_name: createForm.full_name,
        collection_centre: createForm.collection_centre || undefined,
        role: createForm.role,
      });
      toast.success(
        `${createForm.role === "admin" ? "Admin" : "Clerk"} account created for ${createForm.full_name}`,
      );
      setShowCreate(false);
      setCreateForm({
        full_name: "",
        email: "",
        collection_centre: "",
        role: "clerk",
        password: "",
      });
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  function openRoleChange(m: StaffMember) {
    setRoleTarget(m);
    setNewRole(m.role === "admin" ? "admin" : "clerk");
  }

  async function confirmRoleChange() {
    if (!roleTarget) return;
    if (roleTarget.id === user.id) return void toast.error("You cannot change your own role.");
    setBusy(true);
    try {
      await callStaffApi({
        action: "update_role",
        user_id: roleTarget.id,
        role: newRole,
      });
      toast.success(`${roleTarget.full_name ?? "Staff"} is now ${newRole}`);
      setRoleTarget(null);
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update role");
    } finally {
      setBusy(false);
    }
  }

  async function confirmResetPassword() {
    if (!pwdTarget || !pwdForm) return;
    if (pwdForm.length < 8) return void toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      await callStaffApi({
        action: "reset_password",
        user_id: pwdTarget.id,
        password: pwdForm,
      });
      toast.success(`Password reset for ${pwdTarget.full_name ?? "staff member"}`);
      setPwdTarget(null);
      setPwdForm("");
      setShowPwd(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Staff Accounts" subtitle="Manage clerk and admin users" wide>
      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-maziwa-blue" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Admins</p>
          </div>
          <p className="text-2xl font-extrabold">{adminCount}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <User className="size-4 text-maziwa-green-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Clerks</p>
          </div>
          <p className="text-2xl font-extrabold">{clerkCount}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Total</p>
          </div>
          <p className="text-2xl font-extrabold">{rows?.length ?? "—"}</p>
        </div>
      </div>

      <ShellCard>
        {/* Search + Add */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-10`}
              placeholder="Search by name or centre"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            size="icon"
            className="size-12 shrink-0 rounded-lg bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
            onClick={() => setShowCreate(true)}
            aria-label="Add staff"
          >
            <Plus className="size-5" />
          </Button>
        </div>

        {rows === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Shield className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No staff accounts found.</p>
            <Button
              type="button"
              variant="link"
              className="mt-2 text-sm font-semibold text-maziwa-blue"
              onClick={() => setShowCreate(true)}
            >
              Add the first staff member
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2.5 sm:hidden">
              {filtered.map((m) => (
                <li key={m.id} className="rounded-lg bg-muted/50 p-3.5 ring-1 ring-border/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{m.full_name ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.collection_centre ?? "No centre"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Joined{" "}
                        {new Date(m.created_at).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${ROLE_STYLE[m.role] ?? ""}`}
                    >
                      {m.role}
                    </span>
                  </div>
                  {m.id !== user.id && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openRoleChange(m)}
                      >
                        <Pencil className="size-3" /> Role
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setPwdTarget(m);
                          setPwdForm("");
                          setShowPwd(false);
                        }}
                      >
                        <KeyRound className="size-3" /> Password
                      </Button>
                    </div>
                  )}
                  {m.id === user.id && (
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      This is your account
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-2">Name</th>
                  <th className="pr-2">Collection Centre</th>
                  <th className="pr-2">Role</th>
                  <th className="pr-2">Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-2 font-semibold">
                      {m.full_name ?? "Unnamed"}
                      {m.id === user.id && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="pr-2 text-muted-foreground">{m.collection_centre ?? "—"}</td>
                    <td className="pr-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${ROLE_STYLE[m.role] ?? ""}`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="pr-2 text-muted-foreground whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="text-right">
                      {m.id !== user.id ? (
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openRoleChange(m)}
                            title="Change role"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setPwdTarget(m);
                              setPwdForm("");
                              setShowPwd(false);
                            }}
                            title="Reset password"
                          >
                            <KeyRound className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </ShellCard>

      {/* Create staff dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Account</DialogTitle>
            <DialogDescription>
              Create a new clerk or admin account. The person can sign in immediately with the email
              and password you set.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="sf_name">
                Full Name
              </label>
              <input
                id="sf_name"
                className={fieldClass}
                value={createForm.full_name}
                onChange={(e) => setCreateForm((s) => ({ ...s, full_name: e.target.value }))}
                placeholder="e.g. John Mwangi"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="sf_email">
                Email Address
              </label>
              <input
                id="sf_email"
                type="email"
                className={fieldClass}
                value={createForm.email}
                onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
                placeholder="e.g. john@maziwaflow.co.ke"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="sf_centre">
                Collection Centre (optional)
              </label>
              <input
                id="sf_centre"
                className={fieldClass}
                value={createForm.collection_centre}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, collection_centre: e.target.value }))
                }
                placeholder="e.g. Kapsabet Cooler"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="sf_role">
                Role
              </label>
              <select
                id="sf_role"
                className={fieldClass}
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, role: e.target.value as StaffRole }))
                }
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="sf_pwd">
                Temporary Password
              </label>
              <input
                id="sf_pwd"
                type="password"
                className={fieldClass}
                value={createForm.password}
                onChange={(e) => setCreateForm((s) => ({ ...s, password: e.target.value }))}
                placeholder="At least 8 characters"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Share this with the staff member. They can change it after signing in.
              </p>
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="pill-action h-auto justify-center bg-maziwa-blue hover:bg-maziwa-blue/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Create Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change role dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {roleTarget?.full_name ?? "this staff member"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="role_select">
                New Role
              </label>
              <select
                id="role_select"
                className={fieldClass}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as StaffRole)}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={confirmRoleChange}
              className="pill-action h-auto justify-center bg-maziwa-blue hover:bg-maziwa-blue/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Confirm Role Change
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <AlertDialog
        open={!!pwdTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPwdTarget(null);
            setShowPwd(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new password for {pwdTarget?.full_name ?? "this staff member"}. They will need
              to use this new password to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <label className={labelClass} htmlFor="new_pwd">
                New Password
              </label>
              <input
                id="new_pwd"
                type={showPwd ? "text" : "password"}
                className={`${fieldClass} pr-12`}
                value={pwdForm}
                onChange={(e) => setPwdForm(e.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute top-9 right-3 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetPassword}
              disabled={busy || pwdForm.length < 8}
              className="bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
