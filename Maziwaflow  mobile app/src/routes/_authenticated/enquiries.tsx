import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MessageCircleQuestion, Plus, Search, Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/enquiries")({
  head: () => ({
    meta: [
      { title: "Enquiries — Maziwaflow Mobile" },
      { name: "description", content: "Log and respond to farmer questions and support tickets." },
      { property: "og:title", content: "Enquiries — Maziwaflow Mobile" },
      {
        property: "og:description",
        content: "Log and respond to farmer questions and support tickets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Enquiries,
});

type Enquiry = {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  farmer_code: string | null;
  created_by: string | null;
  reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
  farmers: { full_name: string } | null;
  creator: { full_name: string | null } | null;
};

const CATEGORIES = ["General", "Payment", "Quality", "Delivery", "Account"] as const;
const STATUS_STYLE: Record<string, string> = {
  Open: "bg-maziwa-orange/15 text-maziwa-orange-deep",
  Answered: "bg-maziwa-green/15 text-maziwa-green-deep",
  Closed: "bg-muted text-muted-foreground",
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });

const newSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(200),
  message: z.string().trim().min(5, "Message must be at least 5 characters").max(2000),
  category: z.enum(CATEGORIES),
  farmer_code: z.string().optional(),
});

const replySchema = z.object({
  reply: z.string().trim().min(1, "Reply cannot be empty").max(2000),
});

function Enquiries() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [farmers, setFarmers] = useState<{ farmer_code: string; full_name: string }[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"All" | "Open" | "Answered" | "Closed">("All");
  const [showNew, setShowNew] = useState(false);
  const [replyTo, setReplyTo] = useState<Enquiry | null>(null);
  const [busy, setBusy] = useState(false);
  const [newForm, setNewForm] = useState({
    subject: "",
    message: "",
    category: "General" as (typeof CATEGORIES)[number],
    farmer_code: "",
  });
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    supabase
      .from("farmers")
      .select("farmer_code, full_name")
      .order("farmer_code")
      .then(({ data }) => setFarmers(data ?? []));
    loadEnquiries();
  }, []);

  function loadEnquiries() {
    supabase
      .from("enquiries")
      .select(
        "id, subject, message, category, status, farmer_code, created_by, reply, replied_by, replied_at, created_at, farmers(full_name), creator:profiles!enquiries_created_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as Enquiry[]) ?? []));
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter !== "All" && r.status !== filter) return false;
      if (!s) return true;
      return (
        r.subject.toLowerCase().includes(s) ||
        r.message.toLowerCase().includes(s) ||
        r.farmers?.full_name.toLowerCase().includes(s) ||
        r.category.toLowerCase().includes(s)
      );
    });
  }, [rows, q, filter]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    const p = newSchema.safeParse(newForm);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    const { error } = await supabase.from("enquiries").insert({
      subject: p.data.subject,
      message: p.data.message,
      category: p.data.category,
      farmer_code: p.data.farmer_code || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) return void toast.error("Could not create enquiry. Please try again.");
    toast.success("Enquiry logged successfully");
    setShowNew(false);
    setNewForm({ subject: "", message: "", category: "General", farmer_code: "" });
    loadEnquiries();
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyTo) return;
    const p = replySchema.safeParse({ reply: replyText });
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    const { error } = await supabase
      .from("enquiries")
      .update({
        reply: p.data.reply,
        replied_by: user.id,
        replied_at: new Date().toISOString(),
        status: "Answered",
      })
      .eq("id", replyTo.id);
    setBusy(false);
    if (error) return void toast.error("Could not post reply. Please try again.");
    toast.success("Reply posted");
    setReplyTo(null);
    setReplyText("");
    loadEnquiries();
  }

  async function closeEnquiry(id: string) {
    const { error } = await supabase.from("enquiries").update({ status: "Closed" }).eq("id", id);
    if (error) return void toast.error("Could not close enquiry.");
    toast.success("Enquiry closed");
    loadEnquiries();
  }

  const counts = useMemo(() => {
    const base = rows ?? [];
    return {
      total: base.length,
      open: base.filter((r) => r.status === "Open").length,
      answered: base.filter((r) => r.status === "Answered").length,
    };
  }, [rows]);

  return (
    <AppShell title="Enquiries" subtitle="Farmer questions & support tickets" wide>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Total</p>
          <p className="text-2xl font-extrabold">{counts.total}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Open</p>
          <p className="text-2xl font-extrabold text-maziwa-orange-deep">{counts.open}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Answered</p>
          <p className="text-2xl font-extrabold text-maziwa-green-deep">{counts.answered}</p>
        </div>
      </div>

      <ShellCard>
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-10`}
              placeholder="Search subject, message, farmer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            size="icon"
            className="size-12 shrink-0 rounded-lg bg-maziwa-orange text-primary-foreground hover:bg-maziwa-orange-deep"
            onClick={() => setShowNew(true)}
            aria-label="New enquiry"
          >
            <Plus className="size-5" />
          </Button>
        </div>

        <div className="mb-4 flex gap-2">
          {(["All", "Open", "Answered", "Closed"] as const).map((f) => (
            <Button
              key={f}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 text-xs font-bold ${
                filter === f
                  ? "bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f}
            </Button>
          ))}
        </div>

        {rows === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <MessageCircleQuestion className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No enquiries found.</p>
            <Button
              type="button"
              variant="link"
              className="mt-2 text-sm font-semibold text-maziwa-blue"
              onClick={() => setShowNew(true)}
            >
              Log the first enquiry
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="rounded-lg bg-muted/40 p-4 ring-1 ring-border/60 transition hover:ring-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? ""}`}
                      >
                        {r.status}
                      </span>
                      <span className="rounded-full bg-maziwa-blue/10 px-2.5 py-0.5 text-xs font-bold text-maziwa-blue">
                        {r.category}
                      </span>
                    </div>
                    <p className="mt-2 font-bold">{r.subject}</p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {r.farmers?.full_name && <span>Farmer: {r.farmers.full_name}</span>}
                      {r.creator?.full_name && <span>By: {r.creator.full_name}</span>}
                      <span>
                        {fmtDate(r.created_at)} · {fmtTime(r.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setReplyTo(r);
                        setReplyText(r.reply ?? "");
                      }}
                    >
                      <Send className="size-3.5" /> Reply
                    </Button>
                    {r.status !== "Closed" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => closeEnquiry(r.id)}
                      >
                        Close
                      </Button>
                    )}
                  </div>
                </div>
                {r.reply && (
                  <div className="mt-3 rounded-md bg-maziwa-green/8 p-3 ring-1 ring-maziwa-green/15">
                    <p className="text-xs font-bold text-maziwa-green-deep uppercase">Reply</p>
                    <p className="mt-1 text-sm text-foreground">{r.reply}</p>
                    {r.replied_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDate(r.replied_at)} · {fmtTime(r.replied_at)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </ShellCard>

      {/* New enquiry dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log New Enquiry</DialogTitle>
            <DialogDescription>
              Record a farmer question, complaint, or support request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNew} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="subject">
                Subject
              </label>
              <input
                id="subject"
                className={fieldClass}
                value={newForm.subject}
                onChange={(e) => setNewForm((s) => ({ ...s, subject: e.target.value }))}
                placeholder="e.g. Delayed payment for last week"
              />
            </div>
            <div>
              <span className={labelClass}>Category</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewForm((s) => ({ ...s, category: c }))}
                    className={`rounded-full px-3.5 text-xs font-bold ${
                      newForm.category === c
                        ? "bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="farmer_enq">
                Related Farmer (optional)
              </label>
              <select
                id="farmer_enq"
                className={fieldClass}
                value={newForm.farmer_code}
                onChange={(e) => setNewForm((s) => ({ ...s, farmer_code: e.target.value }))}
              >
                <option value="">No specific farmer…</option>
                {farmers.map((f) => (
                  <option key={f.farmer_code} value={f.farmer_code}>
                    {f.farmer_code} — {f.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="message">
                Message
              </label>
              <Textarea
                id="message"
                className="min-h-[100px] resize-y"
                value={newForm.message}
                onChange={(e) => setNewForm((s) => ({ ...s, message: e.target.value }))}
                placeholder="Describe the question or issue in detail…"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="pill-action h-auto justify-center bg-maziwa-orange hover:bg-maziwa-orange-deep disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Log Enquiry
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reply dialog */}
      <Dialog open={!!replyTo} onOpenChange={(open) => !open && setReplyTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Enquiry</DialogTitle>
            <DialogDescription>{replyTo?.subject}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">{replyTo?.message}</p>
          </div>
          <form onSubmit={submitReply} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="reply_text">
                Your Reply
              </label>
              <Textarea
                id="reply_text"
                className="min-h-[100px] resize-y"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your response…"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="pill-action h-auto justify-center bg-maziwa-green hover:bg-maziwa-green-deep disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Post Reply
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
