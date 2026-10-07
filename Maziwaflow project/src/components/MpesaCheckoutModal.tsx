import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type MpesaStatus = "idle" | "sending" | "waiting" | "success" | "failed" | "cancelled" | "timeout";
type MpesaFlow = "b2c" | "stk_push";

type Props = {
  open: boolean;
  onClose: () => void;
  farmerCode: string;
  farmerName: string;
  defaultPhone: string;
  amount: number;
  paymentId?: string;
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
  onSuccess,
}: Props) {
  const [phone, setPhone] = useState(defaultPhone);
  const [status, setStatus] = useState<MpesaStatus>("idle");
  const [flow, setFlow] = useState<MpesaFlow>("b2c");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPhone(defaultPhone);
    setStatus("idle");
    setFlow("b2c");
    setResultMsg("");
    setTransactionId(null);
  }, [open, defaultPhone]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
    (id: string) => {
      stopPolling();
      let attempts = 0;
      let inFlight = false;
      pollRef.current = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        attempts += 1;
        try {
          const { data, error } = await supabase
            .from("mpesa_transactions")
            .select("status, mpesa_receipt_number, result_desc")
            .eq("id", id)
            .maybeSingle();

          if (error) {
            setResultMsg(
              "Status check failed temporarily. The transaction may still be processing.",
            );
          } else if (data?.status === "completed") {
            handleSuccess(data.mpesa_receipt_number);
          } else if (data?.status === "failed") {
            setStatus("failed");
            setResultMsg(data.result_desc ?? "Payment failed.");
            stopPolling();
          } else if (data?.status === "cancelled") {
            setStatus("cancelled");
            setResultMsg(data.result_desc ?? "Payment was cancelled.");
            stopPolling();
          } else if (attempts >= 120) {
            setStatus("timeout");
            setResultMsg(
              "This transaction is still processing. Check the payment record again shortly.",
            );
            stopPolling();
          }
        } catch {
          setResultMsg("Status check failed temporarily. The transaction may still be processing.");
        } finally {
          inFlight = false;
        }
      }, 5000);
    },
    [handleSuccess, stopPolling],
  );

  async function startPayment(e: React.FormEvent) {
    e.preventDefault();
    if (flow === "stk_push" && !phone.trim()) return void toast.error("Enter a phone number");
    if (flow === "stk_push" && (!Number.isFinite(amount) || amount < 1)) {
      return void toast.error("Amount must be at least KSh 1");
    }
    if (flow === "b2c" && !paymentId) {
      return void toast.error("A payment record is required for a farmer payout");
    }

    setStatus("sending");
    setResultMsg("");
    try {
      const { data, error } = await supabase.functions.invoke(
        flow === "b2c" ? "mpesa-b2c-payout" : "mpesa-stk-push",
        {
          body:
            flow === "b2c"
              ? { payment_id: paymentId }
              : { phone: phone.trim(), amount, farmer_code: farmerCode },
        },
      );

      if (error || data?.error) {
        setStatus("failed");
        setResultMsg(data?.error ?? error.message ?? "Could not initiate M-Pesa transaction.");
        return;
      }
      if (typeof data?.transaction_id !== "string") {
        setStatus("failed");
        setResultMsg("The provider response did not include a transaction reference.");
        return;
      }

      setTransactionId(data.transaction_id);
      setStatus("waiting");
      pollStatus(data.transaction_id);
    } catch (error) {
      setStatus("failed");
      setResultMsg(error instanceof Error ? error.message : "Network error. Please try again.");
    }
  }

  function handleClose() {
    if (status === "sending") return;
    stopPolling();
    if (status === "waiting" || status === "timeout") {
      toast.info("M-Pesa transaction may still be processing. Check its status before retrying.");
    }
    onClose();
  }

  if (!open) return null;

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
              <h2 className="font-bold">M-Pesa Transaction</h2>
              <p className="text-xs text-muted-foreground">
                {farmerName} ({farmerCode})
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close M-Pesa dialog">
            <X className="size-5" />
          </button>
        </div>

        {status === "idle" && (
          <form onSubmit={startPayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={flow === "b2c" ? "default" : "outline"}
                onClick={() => setFlow("b2c")}
                className="h-auto min-h-11 whitespace-normal text-xs"
              >
                Send farmer payout
              </Button>
              <Button
                type="button"
                variant={flow === "stk_push" ? "default" : "outline"}
                onClick={() => setFlow("stk_push")}
                className="h-auto min-h-11 whitespace-normal text-xs"
              >
                Request payment
              </Button>
            </div>
            <div className="rounded-lg bg-muted/40 p-4 text-center ring-1 ring-border/60">
              <p className="text-xs font-bold text-muted-foreground uppercase">Amount</p>
              <p className="text-3xl font-extrabold text-maziwa-green-deep">
                KSh {Math.floor(Number(amount)).toLocaleString("en-KE")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                M-Pesa transactions use whole shillings; any fractional shilling is excluded.
              </p>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase"
                htmlFor="mpesa-phone"
              >
                {flow === "b2c" ? "Registered farmer phone" : "Phone to charge"}
              </label>
              <input
                id="mpesa-phone"
                type="tel"
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-maziwa-green/40 disabled:opacity-70"
                placeholder="07XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={flow === "b2c"}
                readOnly={flow === "b2c"}
                required={flow === "stk_push"}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {flow === "b2c"
                  ? "Payouts are sent to the farmer's registered number."
                  : "An STK prompt will ask this phone to pay the configured business shortcode."}
              </p>
            </div>
            <Button
              type="submit"
              className="h-11 w-full justify-center rounded-lg bg-maziwa-green text-sm font-bold hover:bg-maziwa-green-deep"
            >
              {flow === "b2c" ? "Send B2C payout" : "Send STK Push"}
            </Button>
          </form>
        )}

        {status === "sending" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="size-8 animate-spin text-maziwa-green-deep" />
            <p className="mt-4 text-sm font-semibold">
              {flow === "b2c" ? "Submitting farmer payout…" : "Sending STK prompt…"}
            </p>
          </div>
        )}

        {(status === "waiting" || status === "timeout") && (
          <div className="flex flex-col items-center py-8">
            <div className="relative flex size-16 items-center justify-center">
              {status === "waiting" && (
                <div className="absolute inset-0 animate-ping rounded-full bg-maziwa-green/20" />
              )}
              <Smartphone className="size-8 text-maziwa-green-deep" />
            </div>
            <p className="mt-4 text-center text-sm font-bold">
              {flow === "b2c"
                ? "Waiting for payout confirmation from M-Pesa."
                : "Check the phone for the M-Pesa prompt."}
            </p>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {resultMsg || "Waiting for provider confirmation…"}
            </p>
            {transactionId && (
              <p className="mt-2 text-[10px] text-muted-foreground">Reference: {transactionId}</p>
            )}
            {status === "timeout" && (
              <Button onClick={handleClose} variant="outline" className="mt-5">
                Close
              </Button>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center py-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-maziwa-green/10">
              <CheckCircle2 className="size-8 text-maziwa-green-deep" />
            </div>
            <p className="mt-4 text-sm font-bold text-maziwa-green-deep">
              {flow === "b2c" ? "Payout Successful" : "Payment Successful"}
            </p>
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
              <p className="mt-1.5 max-w-xs text-center text-xs text-muted-foreground">
                {resultMsg}
              </p>
            )}
            <Button
              onClick={() => {
                setStatus("idle");
                setResultMsg("");
                setTransactionId(null);
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
