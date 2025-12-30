"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";

const REGISTRATION_FEE = 1_000_000; // 100,000,000 QU

type Props = {
  open: boolean;
  onClose: () => void;
};

export const RegisterModal: React.FC<Props> = ({ open, onClose }) => {
  const { connected, wallet } = useQubicConnect();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = useCallback(() => {
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ status: "success" | "error"; message?: string }>;
      setIsSubmitting(false);
      close();
      if (custom.detail?.status === "error" && custom.detail.message) {
        toast.error(custom.detail.message);
      }
    };

    window.addEventListener("payAccessResult", handle as EventListener);
    return () => window.removeEventListener("payAccessResult", handle as EventListener);
  }, [close]);

  const handleRegister = async () => {
    if (!connected || !wallet) {
      toast.error("Please connect your wallet first");
      return;
    }
    setIsSubmitting(true);
    window.dispatchEvent(new CustomEvent("payAccess"));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md p-0">
        <div className="flex flex-col gap-6 p-6">
          <DialogHeader>
            <DialogTitle>Register for airdrop</DialogTitle>
            <DialogDescription>
              Registration is allowed once per wallet. The fee is {REGISTRATION_FEE.toLocaleString()} QU.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            When you click <b>Register</b>, your wallet will prompt you to send exactly {REGISTRATION_FEE.toLocaleString()} QU
            to the registration address.
          </div>

          <DialogFooter className="gap-2 sm:gap-4">
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRegister} disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Register"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
