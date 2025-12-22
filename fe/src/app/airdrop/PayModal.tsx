"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import toast from "react-hot-toast";
import { useUser } from "@/contexts/UserContext";

const MIN_PAYMENT = 100;
const MAX_PAYMENT = 10000000000;

export type FundPayload = {
  amount: number;
};

type PayModalProps = {
  open: boolean;
  onClose: () => void;
};

export const PayModal: React.FC<PayModalProps> = ({ open, onClose }) => {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { connected, wallet } = useQubicConnect();
  const { user } = useUser();

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const amountValid = useMemo(
    () => {
      if (user?.access_info === 0) {
        return true;
      }
      return !Number.isNaN(parsedAmount) && parsedAmount >= MIN_PAYMENT && parsedAmount <= MAX_PAYMENT
    },
    [parsedAmount, user?.access_info],
  );

  const formDisabled = isSubmitting || !amountValid;

  const resetState = useCallback(() => {
    setAmount("");
    setFeedback(null);
    setIsSubmitting(false);
  }, []);

  const closeAndReset = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    const handlePayResult = (event: Event) => {
      const customEvent = event as CustomEvent<{ status: "success" | "error"; message?: string }>;
      setIsSubmitting(false);
      closeAndReset();

      if (customEvent.detail?.status === "error" && customEvent.detail.message) {
        toast.error(customEvent.detail.message);
      }
    };

    window.addEventListener("payFundResult", handlePayResult as EventListener);
    window.addEventListener("payAccessResult", handlePayResult as EventListener);
    return () => {
      window.removeEventListener("payFundResult", handlePayResult as EventListener);
      window.removeEventListener("payAccessResult", handlePayResult as EventListener);
    };
  }, [closeAndReset]);

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(event.target.value);
  };

  const handlePay = async (accessInfo?: 0 | 1) => {
    if (typeof accessInfo !== "number") {
      toast.error("Unable to determine payment type. Please try again.");
      return;
    }

    if (!connected || !wallet) {
      toast.error("Please connect your wallet first");
      return;
    }


    const payload: FundPayload = { amount: parsedAmount };
    const payEvent = new CustomEvent(accessInfo === 0 ? "payAccess" : "payFund", { detail: payload });
    setIsSubmitting(true);
    setFeedback(null);
    window.dispatchEvent(payEvent);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAndReset()}>
      <DialogContent className="max-w-md p-0">
        <form className="flex flex-col gap-6 p-6">
          <DialogHeader>
            <DialogTitle>Fund QU payment</DialogTitle>
            <DialogDescription>
              {
                user?.access_info === 0 
                ? "Send 100 QU to the address below to register for the airdrop" 
                : "Send qubic tokens to the address below to join the airdrop. Minimum payment is 100 QU"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            {user?.access_info === 1 && <div className="space-y-2">
              <Label htmlFor="amount">QU amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={MIN_PAYMENT}
                step="0.0001"
                placeholder="Enter QU amount"
                value={amount}
                onChange={handleAmountChange}
              />
              {!amountValid && amount.length > 0 && (
                <p className="text-xs text-destructive">
                  Amount must be greater than {MIN_PAYMENT.toLocaleString()} QU.
                </p>
              )}
            </div>}
          </div>

          {feedback && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                feedback.type === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {feedback.message}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-4">
            <Button type="button" variant="outline" onClick={closeAndReset} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => handlePay(user?.access_info)} disabled={formDisabled}>
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

