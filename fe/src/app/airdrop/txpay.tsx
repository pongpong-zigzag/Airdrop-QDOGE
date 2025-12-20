"use client";

import React, { useCallback, useState } from 'react';
import { useQubicConnect } from '@/components/connect/QubicConnectContext';
import { fetchBalance, broadcastTx } from '@/services/rpc.service';
import { toast } from 'react-hot-toast';
import { createQubicTx } from '@/lib/transfer';
import { recordTransaction } from '@/lib/api';

interface BuyGamesTransactionProps {
  onPurchaseComplete?: () => void;
}

const ACCESS_PRICE = 100; // 100 QU for airdrop access
const QU_MIN_BALANCE = 10000;
const RECIPIENT_ADDRESS = 'KZFJRTYKJXVNPAYXQXUKMPKAHWWBWVWGLSFMEFOKPFJFWEDDXMCZVSPEOOZE'; // QU recipient address
type TransferEventName = 'payFundResult' | 'payAccessResult';

const TxPay: React.FC<BuyGamesTransactionProps> = ({ onPurchaseComplete }) => {
  const { connected, wallet, getSignedTx } = useQubicConnect();
  // const { sendQubic } = useWalletConnect();
  const [, setIsProcessing] = useState(false);

  const emitResult = useCallback((event: TransferEventName, status: 'success' | 'error', message?: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(event, { detail: { status, message } }));
  }, []);

  const runTransfer = useCallback(
    async (amount: number, eventName: TransferEventName, enforceReserve: boolean) => {
      if (!connected || !wallet) {
        toast.error('Please connect your wallet first');
        emitResult(eventName, 'error', 'Wallet not connected');
        return;
      }

      setIsProcessing(true);

      try {
        toast.loading('Checking balance...', { id: 'balance-check' });
        const balanceData = await fetchBalance(wallet.publicKey);
        const availableBalance = balanceData.balance;
        toast.dismiss('balance-check');

        if (availableBalance < amount) {
          const message = `Insufficient balance. You have ${availableBalance} QU, but need ${amount} QU.`;
          toast.error(message);
          emitResult(eventName, 'error', message);
          return;
        }

        if (enforceReserve && availableBalance - amount < QU_MIN_BALANCE) {
          const message = `You need to keep at least ${QU_MIN_BALANCE} QU in your wallet.`;
          toast.error(message);
          emitResult(eventName, 'error', message);
          return;
        }

        toast.success(`Balance: ${availableBalance} QU`, { duration: 2000 });

        const sourceAddress = wallet.publicKey?.toUpperCase().trim();
        const destAddress = RECIPIENT_ADDRESS.toUpperCase().trim();

        toast.loading('Confirm QU transfer in your wallet...', { id: 'signing' });

        const tx = await createQubicTx({ from: sourceAddress, to: destAddress, amount });

        const connectType = wallet.connectType?.toLowerCase();
        let signedTx: Uint8Array;

        if (connectType === 'walletconnect' || connectType === 'mmsnap') {
          const signed = await getSignedTx(tx);
          signedTx = signed.tx;
        } else if (connectType === 'privatekey') {
          if (!wallet.privateKey) {
            throw new Error('Private key required to sign this transaction.');
          }
          signedTx = await tx.build(wallet.privateKey);
        } else {
          throw new Error(`Unsupported wallet type: ${wallet.connectType ?? 'unknown'}`);
        }

        await broadcastTx(signedTx);

        const txId = tx.getId();
        await recordTransaction({
          sender: sourceAddress,
          recipient: destAddress,
          tx_hash: txId,
        });

        toast.dismiss('signing');

        emitResult(eventName, 'success');
        onPurchaseComplete?.();
      } catch (error: unknown) {
        toast.dismiss('balance-check');
        toast.dismiss('signing');
        const message =
          error instanceof Error ? `Transaction failed: ${error.message}` : 'Transaction failed: Unknown error';
        toast.error(message);
        emitResult(eventName, 'error', message);
      } finally {
        setIsProcessing(false);
      }
    },
    [connected, wallet, emitResult, onPurchaseComplete, getSignedTx],
  );

  const handlePayAccess = useCallback(async () => {
    await runTransfer(ACCESS_PRICE, 'payAccessResult', false);
  }, [runTransfer]);

  const handlePayFund = useCallback(async (amount: number) => {
    await runTransfer(amount, 'payFundResult', true);
  }, [runTransfer]);

  // This component listens for buy games requests and leaderboard payment requests
  React.useEffect(() => {
    const handlePayAccessRequest = async () => {
      if (!connected || !wallet) {
        toast.error('Please connect your wallet first');
        emitResult('payAccessResult', 'error', 'Wallet not connected');
        return;
      }
      await handlePayAccess();
    };

    const handlePayFundRequest = async (event: Event) => {
      const customEvent = event as CustomEvent<{ amount: number }>;
      const requestedAmount = customEvent.detail?.amount ?? 0;

      if (!connected || !wallet || requestedAmount === 0) {
        toast.error('Please connect your wallet first');
        emitResult('payFundResult', 'error', 'Wallet not connected');
        return;
      }
      await handlePayFund(requestedAmount);
    };

    

    window.addEventListener('payAccess', handlePayAccessRequest as EventListener);
    window.addEventListener('payFund', handlePayFundRequest as EventListener);
    return () => {
      window.removeEventListener('payAccess', handlePayAccessRequest as EventListener);
      window.removeEventListener('payFund', handlePayFundRequest as EventListener);
    };
  }, [connected, wallet, handlePayFund, handlePayAccess, emitResult]);

  // This component doesn't render anything, it just handles transactions
  return null;
};

export default TxPay;

