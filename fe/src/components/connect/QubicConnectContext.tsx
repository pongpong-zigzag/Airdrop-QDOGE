"use client";

import React, { createContext, useContext, useState } from "react";
import { QubicHelper } from "@qubic-lib/qubic-ts-library/dist/qubicHelper";
import Crypto, { SIGNATURE_LENGTH } from "@qubic-lib/qubic-ts-library/dist/crypto";
import { MetamaskActions, MetaMaskContext, MetaMaskProvider } from "./MetamaskContext";
import { connectTypes, defaultSnapOrigin } from "./config";
import { useWalletConnect } from "./WalletConnectContext";
import { QubicTransaction } from "@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction";
import { base64ToUint8Array, decodeUint8ArrayTx, uint8ArrayToBase64 } from "@/utils";
import { DEFAULT_TX_SIZE } from "@/constants";
import { toast } from "react-hot-toast";
import { getSnap } from "./utils/snap";
import { connectSnap } from "./utils/snap";
// @ts-expect-error: qubic vault library does not ship types
import { QubicVault } from "@qubic-lib/qubic-ts-vault-library";


const WALLET_STORAGE_KEY = "wallet";

interface Wallet {
  connectType: string;
  publicKey: string;
  alias?: string;
  privateKey?: string;
}

interface QubicConnectContextType {
  connected: boolean;
  wallet: Wallet | null;
  showConnectModal: boolean;
  connect: (wallet: Wallet) => void;
  disconnect: () => void;
  toggleConnectModal: () => void;
  getMetaMaskPublicId: (accountIdx?: number, confirm?: boolean) => Promise<string>;
  getSignedTx: (tx: Uint8Array | QubicTransaction) => Promise<{ tx: Uint8Array }>;
  mmSnapConnect: () => Promise<void>;
  privateKeyConnect: (privateSeed: string) => Promise<void>;
  vaultFileConnect: (selectedFile: File, password: string) => Promise<QubicVault>;
}

const QubicConnectContext = createContext<QubicConnectContextType | undefined>(undefined);

interface QubicConnectProviderProps {
  children: React.ReactNode;
}

export function QubicConnectProvider({ children }: QubicConnectProviderProps) {
  const [connected, setConnected] = useState<boolean>(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const { signTransaction, disconnect: disconnectWalletConnect } = useWalletConnect();
  const [state, dispatch] = useContext(MetaMaskContext);
  // const [, setBalances] = useAtom(balancesAtom);

  const qHelper = new QubicHelper();

  const connect = (wallet: Wallet): void => {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
    setWallet(wallet);
    setConnected(true);
  };

  const disconnect = (): void => {
    const connectType = wallet?.connectType;
    localStorage.removeItem(WALLET_STORAGE_KEY);
    setWallet(null);
    setConnected(false);
    if (connectType === "walletconnect") {
      disconnectWalletConnect().catch((error) =>
        console.error("Failed to disconnect WalletConnect session", error),
      );
    }
    // setBalances([]);
  };

  const toggleConnectModal = (): void => {
    setShowConnectModal(!showConnectModal);
  };

  // Hydrate persisted wallet on mount to avoid forcing a reconnection after refresh.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(WALLET_STORAGE_KEY);
      if (!raw) return;
      const parsed: Wallet = JSON.parse(raw);
      if (!parsed?.publicKey || !connectTypes.includes(parsed.connectType)) {
        localStorage.removeItem(WALLET_STORAGE_KEY);
        return;
      }
      setWallet(parsed);
      setConnected(true);
    } catch (error) {
      console.error("Failed to restore wallet from storage", error);
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
  }, []);

  const getMetaMaskPublicId = async (accountIdx: number = 0, confirm: boolean = false): Promise<string> => {
    return await window.ethereum.request({
      method: "wallet_invokeSnap",
      params: {
        snapId: defaultSnapOrigin,
        request: {
          method: "getPublicId",
          params: {
            accountIdx,
            confirm,
          },
        },
      },
    });
  };

  const getMetaMaskSignedTx = async (tx: Uint8Array, offset: number, accountIdx: number = 0) => {
    const base64Tx = btoa(String.fromCharCode(...Array.from(tx)));

    return await window.ethereum.request({
      method: "wallet_invokeSnap",
      params: {
        snapId: defaultSnapOrigin,
        request: {
          method: "signTransaction",
          params: {
            base64Tx,
            accountIdx,
            offset,
          },
        },
      },
    });
  };

  const getSignedTx = async (tx: Uint8Array | QubicTransaction): Promise<{ tx: Uint8Array }> => {
    if (!wallet || !connectTypes.includes(wallet.connectType)) {
      throw new Error(`Unsupported connectType: ${wallet?.connectType}`);
    }

    const processedTx = tx instanceof QubicTransaction ? await tx.build("0".repeat(55)) : tx;

    switch (wallet.connectType) {
      case "mmSnap": {
        const mmResult = await getMetaMaskSignedTx(processedTx, processedTx.length - SIGNATURE_LENGTH);
        const binaryTx = atob(mmResult.signedTx);
        const signature = new Uint8Array(binaryTx.length);
        for (let i = 0; i < binaryTx.length; i++) {
          signature[i] = binaryTx.charCodeAt(i);
        }
        processedTx.set(signature, processedTx.length - SIGNATURE_LENGTH);
        return { tx: processedTx };
      }

      case "walletconnect": {
        const decodedTx = processedTx instanceof Uint8Array ? decodeUint8ArrayTx(processedTx) : processedTx;
        const [from, to] = await Promise.all([
          qHelper.getIdentity(decodedTx.sourcePublicKey.getIdentity()),
          qHelper.getIdentity(decodedTx.destinationPublicKey.getIdentity()),
        ]);
        const payloadBase64 = uint8ArrayToBase64(decodedTx.payload.getPackageData());
        if (wallet?.connectType == "walletconnect") {
          toast("Sign the transaction in your wallet", {
            icon: "🔑",
          });
        }
        const wcResult = await signTransaction({
          from,
          to,
          amount: Number(decodedTx.amount.getNumber()),
          tick: decodedTx.tick,
          inputType: decodedTx.inputType,
          payload: payloadBase64 == "" ? null : payloadBase64,
        });
        return { tx: base64ToUint8Array(wcResult.signedTransaction) };
      }

      default: {
        if (!wallet.privateKey) throw new Error("Private key required");
        const qCrypto = await Crypto;
        const idPackage = await qHelper.createIdPackage(wallet.privateKey);
        const digest = new Uint8Array(SIGNATURE_LENGTH);
        const toSign = processedTx.slice(0, processedTx.length - SIGNATURE_LENGTH);

        qCrypto.K12(toSign, digest, SIGNATURE_LENGTH);
        const signedTx =
          tx instanceof QubicTransaction
            ? await tx.build(wallet.privateKey)
            : qCrypto.schnorrq.sign(idPackage.privateKey, idPackage.publicKey, digest);
        return { tx: signedTx || new Uint8Array(DEFAULT_TX_SIZE) };
      }
    }
  };

  const mmSnapConnect = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      const notFoundError = new Error("MetaMask extension not detected. Install MetaMask and try again.");
      toast.error(notFoundError.message);
      dispatch({
        type: MetamaskActions.SetError,
        payload: notFoundError,
      });
      return;
    }
    try {
      await connectSnap(!state.isFlask ? "npm:@qubic-lib/qubic-mm-snap" : undefined);
      const installedSnap = await getSnap();
      // get publicId from snap
      const publicKey = await getMetaMaskPublicId(0);
      const wallet = {
        connectType: "mmSnap",
        publicKey,
      };
      connect(wallet);
      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to MetaMask.");
      dispatch({
        type: MetamaskActions.SetError,
        payload: error,
      });
    }
  };

  const privateKeyConnect = async (privateSeed: string) => {
    if (privateSeed.trim() === "") {
      throw new Error("Private seed cannot be empty");
    }
    if (privateSeed.length !== 55) {
      throw new Error("Private seed must be 55 characters long");
    }
    if (privateSeed.match(/[^a-z]/)) {
      throw new Error("Private seed must contain only lowercase letters");
    }
    const idPackage = await new QubicHelper().createIdPackage(privateSeed);
    connect({
      connectType: "privateKey",
      privateKey: privateSeed,
      publicKey: idPackage.publicId,
    });
  };

  const vaultFileConnect = async (selectedFile: File, password: string): Promise<QubicVault> => {
    if (!selectedFile || !password) {
      throw new Error("Vault file and password are required.");
    }

    const vault = new QubicVault();
    try {
      await vault.importAndUnlock(
        true, // selectedFileIsVaultFile
        password,
        null, // selectedConfigFile
        selectedFile,
        true, // unlock
      );
      return vault;
    } catch (error) {
      console.error("Error unlocking vault:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to unlock the vault. Please check your password and try again.");
    }
  };

  const contextValue: QubicConnectContextType = {
    connected,
    wallet,
    showConnectModal,
    connect,
    disconnect,
    toggleConnectModal,
    getMetaMaskPublicId,
    getSignedTx,
    mmSnapConnect,
    privateKeyConnect,
    vaultFileConnect,
  };

  return (
    <MetaMaskProvider>
      <QubicConnectContext.Provider value={contextValue}>{children}</QubicConnectContext.Provider>
    </MetaMaskProvider>
  );
}

export function useQubicConnect(): QubicConnectContextType {
  const context = useContext(QubicConnectContext);
  if (context === undefined) {
    throw new Error("useQubicConnect() hook must be used within a <QubicConnectProvider>");
  }
  return context;
}
