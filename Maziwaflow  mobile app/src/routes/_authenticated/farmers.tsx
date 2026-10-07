import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Link2,
  Unlink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/farmers")({
  head: () => ({
    meta: [
      { title: "Farmer Directory — Maziwaflow Mobile" },
      { name: "description", content: "Manage the dairy farmer directory." },
      { property: "og:title", content: "Farmer Directory — Maziwaflow Mobile" },
      { property: "og:description", content: "Manage the dairy farmer directory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Farmers,
});

type Farmer = {
  farmer_code: string;
  full_name: string;
  location: string | null;
  phone: string | null;
  linked_user_id: string | null;
  created_at: string;
};

type FarmerAccount = {
  id: string;
  full_name: string;
  role: string;
};

const formSchema = z.object({
  farmer_code: z
    .string()
    .trim()
    .min(3, "Farmer ID must be at least 3 characters")
    .max(20, "Farmer ID too long")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and hyphens only"),
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  location: z.string().trim().max(100).optional(),
});

function Farmers() {
  const [rows, setRows] = useState<Farmer[] | null>(null);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [deleting, setDeleting] = useState<Farmer | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ farmer_code: "", full_name: "", location: "", phone: "" });
  const [accounts, setAccounts] = useState<FarmerAccount[]>([]);
  const [linkTarget, setLinkTarget] = useState<Farmer | null>(null);
  const [linkAccount, setLinkAccount] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<Farmer | null>(null);

  useEffect(() => {
    loadFarmers();
    loadAccounts();
  }, []);

  function loadFarmers() {
    supabase
      .from("farmers")
      .select("farmer_code, full_name, location, phone, linked_user_id, created_at")
      .order("farmer_code")
      .then(({ data }) => setRows((data as Farmer[]) ?? []));
  }

  function loadAccounts() {
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", "farmer")
      .order("full_name")
      .then(({ data }) => setAccounts((data as FarmerAccount[]) ?? []));
  }

  const linkedAccountIds = new Set((rows ?? []).map((r) => r.linked_user_id).filter(Boolean));
  const unlinkedAccounts = accounts.filter((a) => !linkedAccountIds.has(a.id));
  const linkedAccountMap = new Map(accounts.map((a) => [a.id, a]));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        !s ||
        r.farmer_code.toLowerCase().includes(s) ||
        r.full_name.toLowerCase().includes(s) ||
        r.location?.toLowerCase().includes(s),
    );
  }, [rows, q]);

  function openNew() {
    setEditing(null);
    setForm({ farmer_code: "", full_name: "", location: "", phone: "" });
    setShowForm(true);
  }

  function openEdit(f: Farmer) {
    setEditing(f);
    setForm({
      farmer_code: f.farmer_code,
      full_name: f.full_name,
      location: f.location ?? "",
      phone: f.phone ?? "",
    });
    setShowForm(true);
  }

  function openLink(f: Farmer) {
    setLinkTarget(f);
    setLinkAccount("");
  }

  async function confirmLink() {
    if (!linkTarget || !linkAccount) return void toast.error("Select an account to link.");
    setBusy(true);
    const { error } = await supabase
      .from("farmers")
      .update({ linked_user_id: linkAccount })
      .eq("farmer_code", linkTarget.farmer_code);
    setBusy(false);
    if (error) return void toast.error("Could not link account: " + error.message);
    toast.success("Account linked successfully. The farmer can now sign in and see their data.");
    setLinkTarget(null);
    setLinkAccount("");
    loadFarmers();
  }

  async function confirmUnlink() {
    if (!unlinkTarget) return;
    setBusy(true);
    const { error } = await supabase
      .from("farmers")
      .update({ linked_user_id: null })
      .eq("farmer_code", unlinkTarget.farmer_code);
    setBusy(false);
    if (error) return void toast.error("Could not unlink account: " + error.message);
    toast.success("Account unlinked. The farmer will no longer see their data on sign-in.");
    setUnlinkTarget(null);
    loadFarmers();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = formSchema.safeParse(form);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("farmers")
        .update({
          full_name: p.data.full_name,
          location: p.data.location || null,
          phone: form.phone || null,
        })
        .eq("farmer_code", editing.farmer_code);
      setBusy(false);
      if (error) return void toast.error("Could not update farmer. Please try again.");
      toast.success("Farmer updated successfully");
    } else {
      const { error } = await supabase.from("farmers").insert({
        farmer_code: p.data.farmer_code,
        full_name: p.data.full_name,
        location: p.data.location || null,
        phone: form.phone || null,
      });
      setBusy(false);
      if (error) {
        if (error.code === "23505")
          return void toast.error("A farmer with that ID already exists.");
        return void toast.error("Could not add farmer. Please try again.");
      }
      toast.success("Farmer added successfully");
    }
    setShowForm(false);
    loadFarmers();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase
      .from("farmers")
      .delete()
      .eq("farmer_code", deleting.farmer_code);
    setBusy(false);
    if (error)
      return void toast.error("Could not delete farmer. They may have existing collections.");
    toast.success("Farmer removed");
    setDeleting(null);
    loadFarmers();
  }

  return (
    <AppShell title="Farmer Directory" subtitle="Manage registered dairy farmers" wide>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Total Farmers</p>
          <p className="text-2xl font-extrabold">{rows?.length ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Linked</p>
          <p className="text-2xl font-extrabold text-maziwa-green-deep">
            {rows?.filter((r) => r.linked_user_id).length ?? "—"}
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Unlinked</p>
          <p className="text-2xl font-extrabold text-maziwa-orange-deep">
            {rows?.filter((r) => !r.linked_user_id).length ?? "—"}
          </p>
        </div>
      </div>

      <ShellCard>
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-10`}
              placeholder="Search by name, ID, or location"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            size="icon"
            className="size-12 shrink-0 rounded-lg bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
            onClick={openNew}
            aria-label="Add farmer"
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
            <Users className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No farmers found.</p>
            <Button
              type="button"
              variant="link"
              className="mt-2 text-sm font-semibold text-maziwa-blue"
              onClick={openNew}
            >
              Add the first farmer
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2.5 sm:hidden">
              {filtered.map((f) => (
                <li
                  key={f.farmer_code}
                  className="rounded-lg bg-muted/50 p-3.5 ring-1 ring-border/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{f.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.farmer_code} · {f.location ?? "No location"}
                      </p>
                      {f.linked_user_id ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-maziwa-green-deep">
                          <CheckCircle2 className="size-3" />{" "}
                          {linkedAccountMap.get(f.linked_user_id)?.full_name ?? "Linked"}
                        </p>
                      ) : (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-maziwa-orange-deep">
                          <AlertCircle className="size-3" /> No account linked
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openLink(f)}
                        aria-label={`Link account for ${f.full_name}`}
                      >
                        <Link2 className="size-4" />
                      </Button>
                      {f.linked_user_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setUnlinkTarget(f)}
                          aria-label={`Unlink account for ${f.full_name}`}
                        >
                          <Unlink className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(f)}
                        aria-label={`Edit ${f.full_name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(f)}
                        aria-label={`Delete ${f.full_name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-2">Farmer ID</th>
                  <th className="pr-2">Full Name</th>
                  <th className="pr-2">Location</th>
                  <th className="pr-2">Linked Account</th>
                  <th className="pr-2">Registered</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.farmer_code} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-2 font-mono font-semibold">{f.farmer_code}</td>
                    <td className="pr-2 font-semibold">{f.full_name}</td>
                    <td className="pr-2 text-muted-foreground">{f.location ?? "—"}</td>
                    <td className="pr-2">
                      {f.linked_user_id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-maziwa-green-deep">
                          <CheckCircle2 className="size-3.5" />
                          {linkedAccountMap.get(f.linked_user_id)?.full_name ?? "Linked"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-maziwa-orange-deep">
                          <AlertCircle className="size-3.5" /> Unlinked
                        </span>
                      )}
                    </td>
                    <td className="pr-2 text-muted-foreground whitespace-nowrap">
                      {new Date(f.created_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openLink(f)}
                          aria-label={`Link account for ${f.full_name}`}
                          title="Link account"
                        >
                          <Link2 className="size-4" />
                        </Button>
                        {f.linked_user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setUnlinkTarget(f)}
                            aria-label={`Unlink account for ${f.full_name}`}
                            title="Unlink account"
                          >
                            <Unlink className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(f)}
                          aria-label={`Edit ${f.full_name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(f)}
                          aria-label={`Delete ${f.full_name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </ShellCard>

      {/* Add/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Farmer" : "Add New Farmer"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update farmer details. The Farmer ID cannot be changed."
                : "Register a new dairy farmer in the directory."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="f_code">
                Farmer ID
              </label>
              <input
                id="f_code"
                className={fieldClass}
                value={form.farmer_code}
                onChange={(e) => setForm((s) => ({ ...s, farmer_code: e.target.value }))}
                placeholder="e.g. MF-1009"
                disabled={!!editing}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="f_name">
                Full Name
              </label>
              <input
                id="f_name"
                className={fieldClass}
                value={form.full_name}
                onChange={(e) => setForm((s) => ({ ...s, full_name: e.target.value }))}
                placeholder="e.g. Joyce Wanjiku"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="f_loc">
                Location (optional)
              </label>
              <input
                id="f_loc"
                className={fieldClass}
                value={form.location}
                onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
                placeholder="e.g. Nakuru"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="f_phone">
                Phone (optional)
              </label>
              <input
                id="f_phone"
                className={fieldClass}
                value={form.phone}
                onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                placeholder="e.g. 0712345678"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="pill-action h-auto justify-center bg-maziwa-blue hover:bg-maziwa-blue/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Farmer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link account dialog */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Farmer Account</DialogTitle>
            <DialogDescription>
              Link {linkTarget?.full_name} ({linkTarget?.farmer_code}) to a farmer sign-in account.
              This lets the farmer log in and see their deliveries, payments, and notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {unlinkedAccounts.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <AlertCircle className="mx-auto size-8 text-maziwa-orange-deep" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No unlinked farmer accounts found. The farmer needs to sign up first (creating an
                  account with role "farmer") before you can link them here.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass} htmlFor="link_select">
                    Select account
                  </label>
                  <select
                    id="link_select"
                    className={fieldClass}
                    value={linkAccount}
                    onChange={(e) => setLinkAccount(e.target.value)}
                  >
                    <option value="">Choose a farmer account…</option>
                    {unlinkedAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  disabled={busy || !linkAccount}
                  onClick={confirmLink}
                  className="pill-action h-auto justify-center bg-maziwa-green hover:bg-maziwa-green-deep disabled:opacity-60"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />} Link Account
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlink confirmation */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => !open && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Farmer Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect {unlinkTarget?.full_name} ({unlinkTarget?.farmer_code}) from
              their sign-in account. The farmer will no longer be able to see their deliveries or
              notifications on login. This does not delete the account or the farmer record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlink}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Farmer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleting?.full_name} ({deleting?.farmer_code}) from the directory.
              This cannot be undone. Farmers with existing collections cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
