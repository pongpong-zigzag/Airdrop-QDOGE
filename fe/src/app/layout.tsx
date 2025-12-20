"use client";

import "@/app/globals.css";
import "@/app/theme.css";
import { QubicConnectProvider } from "@/components/connect/QubicConnectContext"; 
import { WalletConnectProvider } from "@/components/connect/WalletConnectContext";
import { UserProvider} from "@/contexts/UserContext"
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

import {useEffect} from "react";
import { settingsAtom, DEFAULT_SETTINGS } from "@/store/settings";
import { THEME_LIST } from "@/constants";
import { useAtom } from "jotai";
import { Toaster } from "react-hot-toast";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useAtom(settingsAtom);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      // ignore corrupted storage
    }
  }, [setSettings]);

  useEffect(() => {
    document.documentElement.classList.forEach((className) => {
      if (THEME_LIST.some((theme) => theme.value === className)) {
        document.documentElement.classList.remove(className);
      }
    });

    if (settings.theme !== "default") {
      document.documentElement.classList.add(settings.theme);
    }

    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.theme, settings.darkMode]);

  return (
    <html lang="en" className="dark text-foreground">
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <WalletConnectProvider>
          <QubicConnectProvider>
            <UserProvider>
              <Header />

              {/* This is what changes per route */}
              <main className="flex-1">
                {children}
              </main>

              <Footer />
              <Toaster position="top-right" />
            </UserProvider>
          </QubicConnectProvider>
        </WalletConnectProvider>
      </body>
    </html>
  );
}
