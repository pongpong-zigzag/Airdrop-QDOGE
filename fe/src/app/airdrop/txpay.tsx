"use client";

import React, { useCallback, useState } from "react";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import { fetchBalance, broadcastTx } from "@/services/rpc.service";
import { toast } from "react-hot-toast";
import { createQubicTx } from "@/lib/transfer";
import {
  confirmFunding,
  confirmRegistration,
  getInvestBalance,
  recordTransaction,
} from "@/lib/api";
import { useUser } from "@/contexts/UserContext";

interface BuyGamesTransactionProps {
  onPurchaseComplete?: () => void;
}

const ACCESS_PRICE = 100; // 100 QU for registration
const QU_RESERVE_BALANCE = 100_000_000; // must keep 100M QU
const QU_MAX_INVEST = 10_000_000_000;

const REGISTRATION_ADDRESS =
  process.env.NEXT_PUBLIC_REGISTRATION_ADDRESS ||
  "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE";

const FUNDING_ADDRESS =
  process.env.NEXT_PUBLIC_FUNDING_ADDRESS || REGISTRATION_ADDRESS;

type TransferEventName = "payFundResult" | "payAccessResult";

type TransferResult =
  | { ok: true; txId: string; dest: string }
  | { ok: false; message: string };

const TxPay: React.FC<BuyGamesTransactionProps> = ({ onPurchaseComplete }) => {
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [, setIsProcessing] = useState(false);
  const { refreshUser } = useUser();

  const emitResult = useCallback(
    (event: TransferEventName, status: "success" | "error", message?: string) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(event, { detail: { status, message } }));
    },
    [],
  );

  const runTransfer = useCallback(
    async (amount: number, destAddress: string, eventName: TransferEventName, enforceReserve: boolean): Promise<TransferResult> => {
      if (!connected || !wallet) {
        const message = "Wallet not connected";
        toast.error(message);
        emitResult(eventName, "error", message);
        return { ok: false, message };
      }

      setIsProcessing(true);

      try {
        if (eventName === "payFundResult") {
          toast.loading("Checking invest balance...", { id: "invest-check" });
          const investData = await getInvestBalance(wallet.publicKey);
          toast.dismiss("invest-check");

          const currentInvestBalance = investData?.invest_bal ?? 0;
          if (currentInvestBalance + amount > QU_MAX_INVEST) {
            const message = `Investment limit exceeded. Current invest balance is ${currentInvestBalance} QU, cap is ${QU_MAX_INVEST} QU.`;
            toast.error(message);
            emitResult(eventName, "error", message);
            return { ok: false, message };
          }
        }

        toast.loading("Checking balance...", { id: "balance-check" });
        const balanceData = await fetchBalance(wallet.publicKey);
        const availableBalance = balanceData.balance;
        toast.dismiss("balance-check");

        if (availableBalance < amount) {
          const message = `Insufficient balance. You have ${availableBalance} QU, but need ${amount} QU.`;
          toast.error(message);
          emitResult(eventName, "error", message);
          return { ok: false, message };
        }

        if (enforceReserve && availableBalance - amount < QU_RESERVE_BALANCE) {
          const message = `You need to keep at least ${QU_RESERVE_BALANCE} QU in your wallet.`;
          toast.error(message);
          emitResult(eventName, "error", message);
          return { ok: false, message };
        }

        toast.success(`Balance: ${availableBalance} QU`, { duration: 1500 });

        const sourceAddress = wallet.publicKey?.toUpperCase().trim();
        const dest = destAddress.toUpperCase().trim();

        toast.loading("Confirm QU transfer in your wallet...", { id: "signing" });

        const tx = await createQubicTx({ from: sourceAddress, to: dest, amount });

        const signed = await getSignedTx(tx);
        const signedTx = signed.tx;

        const broadcastResult = await broadcastTx(signedTx);
        const txId = broadcastResult.transactionId;

        await recordTransaction({ sender: sourceAddress, recipient: dest, tx_hash: txId });

        toast.dismiss("signing");
        toast.success("Transaction broadcasted");

        return { ok: true, txId, dest };
      } catch (error: unknown) {
        toast.dismiss("balance-check");
        toast.dismiss("invest-check");
        toast.dismiss("signing");
        const message =
          error instanceof Error ? `Transaction failed: ${error.message}` : "Transaction failed: Unknown error";
        toast.error(message);
        emitResult(eventName, "error", message);
        return { ok: false, message };
      } finally {
        setIsProcessing(false);
      }
    },
    [connected, wallet, emitResult, getSignedTx],
  );

  const handlePayAccess = useCallback(async () => {
    if (!wallet?.publicKey) return;

    const transfer = await runTransfer(ACCESS_PRICE, REGISTRATION_ADDRESS, "payAccessResult", false);
    if (!transfer.ok) return;

    try {
      toast.loading("Confirming registration on-chain...", { id: "confirm" });
      await confirmRegistration(wallet.publicKey, transfer.txId);
      toast.dismiss("confirm");

      await refreshUser();
      onPurchaseComplete?.();
      emitResult("payAccessResult", "success");
      toast.success("Registered!");
    } catch (error: unknown) {
      toast.dismiss("confirm");
      const message = error instanceof Error ? error.message : "Failed to confirm registration";
      toast.error(message);
      emitResult("payAccessResult", "error", message);
    }
  }, [runTransfer, wallet?.publicKey, refreshUser, emitResult, onPurchaseComplete]);

  const handlePayFund = useCallback(
    async (amount: number) => {
      if (!wallet?.publicKey) return;

      const transfer = await runTransfer(amount, FUNDING_ADDRESS, "payFundResult", true);
      if (!transfer.ok) return;

      try {
        toast.loading("Confirming funding on-chain...", { id: "confirm" });
        await confirmFunding(wallet.publicKey, transfer.txId);
        toast.dismiss("confirm");

        onPurchaseComplete?.();
        emitResult("payFundResult", "success");
        toast.success("Funding confirmed!");
      } catch (error: unknown) {
        toast.dismiss("confirm");
        const message = error instanceof Error ? error.message : "Failed to confirm funding";
        toast.error(message);
        emitResult("payFundResult", "error", message);
      }
    },
    [runTransfer, wallet?.publicKey, emitResult, onPurchaseComplete],
  );

  React.useEffect(() => {
    const handlePayAccessRequest = async () => {
      if (!connected || !wallet) {
        const message = "Wallet not connected";
        toast.error(message);
        emitResult("payAccessResult", "error", message);
        return;
      }
      await handlePayAccess();
    };

    const handlePayFundRequest = async (event: Event) => {
      const customEvent = event as CustomEvent<{ amount: number }>;
      const requestedAmount = customEvent.detail?.amount ?? 0;

      if (!connected || !wallet || requestedAmount === 0) {
        const message = "Wallet not connected";
        toast.error(message);
        emitResult("payFundResult", "error", message);
        return;
      }
      await handlePayFund(requestedAmount);
    };

    window.addEventListener("payAccess", handlePayAccessRequest as EventListener);
    window.addEventListener("payFund", handlePayFundRequest as EventListener);
    return () => {
      window.removeEventListener("payAccess", handlePayAccessRequest as EventListener);
      window.removeEventListener("payFund", handlePayFundRequest as EventListener);
    };
  }, [connected, wallet, handlePayFund, handlePayAccess, emitResult]);

  return null;
};

export default TxPay;
