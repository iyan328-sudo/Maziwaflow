import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Smartphone, CheckCircle2, XCircle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type MpesaStatus = "idle" | "sending" | "waiting" | "success" | "failed" | "cancelled";

type Props = {
  open: boolean;
  onClose: () => void;
  farmerCode: string;
  farmerName: string;
  defaultPhone: string;
  amount: number;
  paymentId?: string | undefined;
  initiatedBy: string;
  onSuccess?: (receipt: string | null) => void;
};

export function MpesaCheckoutModal({
  open,
  onClose,
  farmerCode,
  farmerName,
  defaultPhone,
  amount,
  paymentId,
  initiatedBy,
  onSuccess,
}: Props) {
  const [phone, setPhone] = useState(defaultPhone);
  const [status, setStatus] = useState<MpesaStatus>("idle");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPhone(defaultPhone);
    setStatus("idle");
    setResultMsg("");
    setCheckoutRequestId(null);
  }, [open, defaultPhone]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleSuccess = useCallback(
    (receipt: string | null) => {
      setStatus("success");
      setResultMsg(receipt ? `M-Pesa receipt: ${receipt}` : "Payment confirmed.");
      stopPolling();
      onSuccess?.(receipt);
    },
    [onSuccess, stopPolling],
  );

  const pollStatus = useCallback(
    (cri: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from("mpesa_transactions")
          .select("status, mpesa_receipt_number, result_desc")
          .eq("checkout_request_id", cri)
          .maybeSingle();

        if (!data) return;

        if (data.status === "completed") {
          handleSuccess(data.mpesa_receipt_number);
        } else if (data.status === "failed") {
          setStatus("failed");
          setResultMsg(data.result_desc ?? "Payment failed.");
          stopPolling();
        } else if (data.status === "cancelled") {
          setStatus("cancelled");
          setResultMsg(data.result_desc ?? "Payment was cancelled.");
          stopPolling();
        }
      }, 5000);
    },
    [handleSuccess, stopPolling],
  );

  const startStkPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return void toast.error("Enter a phone number");
    if (amount < 1) return void toast.error("Amount must be at least KSh 1");

    setStatus("sending");
    setResultMsg("");

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mpesa-stk-push`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          phone: phone.trim(),
          amount,
          farmer_code: farmerCode,
          payment_id: paymentId ?? null,
          initiated_by: initiatedBy,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || data.error) {
        setStatus("failed");
        setResultMsg(data.error ?? "Could not initiate M-Pesa payment.");
        return;
      }

      setCheckoutRequestId(data.checkout_request_id);
      setStatus("waiting");
      pollStatus(data.checkout_request_id);
    } catch {
      setStatus("failed");
      setResultMsg("Network error. Please try again.");
    }
  };

  const handleClose = () => {
    stopPolling();
    if (status === "waiting") {
      toast.info("M-Pesa prompt is still active on the customer's phone.");
    }
    onClose();
  };

  if (!open) return null;

  const phoneInput = (
    <input
      type="tel"
      className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-maziwa-green/40"
      placeholder="07XX XXX XXX"
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
      disabled={status !== "idle"}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-maziwa-green/10">
              <Smartphone className="size-5 text-maziwa-green-deep" />
            </div>
            <div>
              <h2 className="font-bold">M-Pesa Payment</h2>
              <p className="text-xs text-muted-foreground">
                {farmerName} ({farmerCode})
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {status === "idle" && (
          <form onSubmit={startStkPush} className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-4 text-center ring-1 ring-border/60">
              <p className="text-xs font-bold text-muted-foreground uppercase">Amount</p>
              <p className="text-3xl font-extrabold text-maziwa-green-deep">
                KSh {Number(amount).toLocaleString("en-KE")}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">
                Customer Phone
              </label>
              {phoneInput}
              <p className="mt-1.5 text-xs text-muted-foreground">
                An M-Pesa prompt will be sent to this number.
              </p>
            </div>
            <Button
              type="submit"
              className="h-11 w-full justify-center rounded-lg bg-maziwa-green text-sm font-bold hover:bg-maziwa-green-deep"
            >
              Pay with M-Pesa
            </Button>
          </form>
        )}

        {status === "sending" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="size-8 animate-spin text-maziwa-green-deep" />
            <p className="mt-4 text-sm font-semibold">Sending M-Pesa prompt…</p>
          </div>
        )}

        {status === "waiting" && (
          <div className="flex flex-col items-center py-8">
            <div className="relative flex size-16 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-maziwa-green/20" />
              <Smartphone className="size-8 text-maziwa-green-deep" />
            </div>
            <p className="mt-4 text-sm font-bold text-center">
              Check your phone for the M-Pesa prompt and enter your PIN.
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground text-center">
              Waiting for confirmation… This will close automatically when the payment completes.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center py-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-maziwa-green/10">
              <CheckCircle2 className="size-8 text-maziwa-green-deep" />
            </div>
            <p className="mt-4 text-sm font-bold text-maziwa-green-deep">Payment Successful</p>
            {resultMsg && <p className="mt-1.5 text-xs text-muted-foreground">{resultMsg}</p>}
            <Button
              onClick={handleClose}
              className="mt-6 h-10 rounded-lg bg-maziwa-green px-8 text-sm font-bold hover:bg-maziwa-green-deep"
            >
              Done
            </Button>
          </div>
        )}

        {(status === "failed" || status === "cancelled") && (
          <div className="flex flex-col items-center py-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-8 text-destructive" />
            </div>
            <p className="mt-4 text-sm font-bold text-destructive">
              {status === "cancelled" ? "Payment Cancelled" : "Payment Failed"}
            </p>
            {resultMsg && (
              <p className="mt-1.5 text-xs text-muted-foreground text-center max-w-xs">
                {resultMsg}
              </p>
            )}
            <Button
              onClick={() => {
                setStatus("idle");
                setResultMsg("");
                setCheckoutRequestId(null);
              }}
              variant="outline"
              className="mt-6 h-10 rounded-lg px-8 text-sm font-bold"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
