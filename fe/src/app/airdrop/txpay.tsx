"use client";

import React, { useCallback, useState } from "react";
import { toast } from "react-hot-toast";

import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import { fetchBalance, broadcastTx } from "@/services/rpc.service";
import { createQubicTx } from "@/lib/transfer";
import { confirmRegistration } from "@/lib/api";
import { useUser } from "@/contexts/UserContext";

interface TxPayProps {
  onPurchaseComplete?: () => void;
}

const REGISTRATION_FEE = 1_000_000; // 100,000,000 QU

const REGISTRATION_ADDRESS =
  process.env.NEXT_PUBLIC_REGISTRATION_ADDRESS ||
  "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE";

type TransferResult = { ok: true; txId: string } | { ok: false; message: string };

const TxPay: React.FC<TxPayProps> = ({ onPurchaseComplete }) => {
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const { refreshUser } = useUser();
  const [, setIsProcessing] = useState(false);

  const emitResult = useCallback((status: "success" | "error", message?: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("payAccessResult", { detail: { status, message } }));
  }, []);

  const runTransfer = useCallback(async (): Promise<TransferResult> => {
    if (!connected || !wallet) {
      const message = "Wallet not connected";
      toast.error(message);
      emitResult("error", message);
      return { ok: false, message };
    }

    setIsProcessing(true);
    try {
      toast.loading("Checking balance...", { id: "balance-check" });
      const balanceData = await fetchBalance(wallet.publicKey);
      toast.dismiss("balance-check");

      const availableBalance = Number(balanceData.balance ?? 0);
      if (availableBalance < REGISTRATION_FEE) {
        const message = `Insufficient balance. You have ${availableBalance} QU, need ${REGISTRATION_FEE} QU.`;
        toast.error(message);
        emitResult("error", message);
        return { ok: false, message };
      }

      toast.loading("Confirm QU transfer in your wallet...", { id: "sign" });
      const tx = await createQubicTx({
        from: wallet.publicKey.toUpperCase().trim(),
        to: REGISTRATION_ADDRESS.toUpperCase().trim(),
        amount: REGISTRATION_FEE,
      });
      const signed = await getSignedTx(tx);
      const broadcastResult = await broadcastTx(signed.tx);
      toast.dismiss("sign");
      toast.success("Transaction broadcasted");

      return { ok: true, txId: broadcastResult.transactionId };
    } catch (error: any) {
      toast.dismiss("balance-check");
      toast.dismiss("sign");
      const message = error instanceof Error ? error.message : "Transaction failed";
      toast.error(message);
      emitResult("error", message);
      return { ok: false, message };
    } finally {
      setIsProcessing(false);
    }
  }, [connected, wallet, emitResult, getSignedTx]);

  const handlePayAccess = useCallback(async () => {
    if (!wallet?.publicKey) return;

    const transfer = await runTransfer();
    if (!transfer.ok) return;

    try {
      toast.loading("Confirming registration on-chain...", { id: "confirm" });
      await confirmRegistration(wallet.publicKey, transfer.txId);
      toast.dismiss("confirm");
      await refreshUser();
      onPurchaseComplete?.();
      emitResult("success");
      toast.success("Registered!");
    } catch (error: any) {
      toast.dismiss("confirm");
      const message = error instanceof Error ? error.message : "Failed to confirm registration";
      toast.error(message);
      emitResult("error", message);
    }
  }, [runTransfer, wallet?.publicKey, refreshUser, emitResult, onPurchaseComplete]);

  React.useEffect(() => {
    const handlePayAccessRequest = async () => {
      await handlePayAccess();
    };

    window.addEventListener("payAccess", handlePayAccessRequest as EventListener);
    return () => {
      window.removeEventListener("payAccess", handlePayAccessRequest as EventListener);
    };
  }, [handlePayAccess]);

  return null;
};

export default TxPay;
