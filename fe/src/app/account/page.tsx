"use client";

import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FiBell, FiSettings, FiX } from "react-icons/fi";
import { BiHistory } from "react-icons/bi";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import AccountStatus from "./AccountStatus";
import SettingPanel from "./SettingPannel";

const Account: React.FC = () => {
  const [activeTab, setActiveTab] = useState("settings");
  const { wallet } = useQubicConnect();

  const address = wallet?.publicKey;

  return (
    <div className="container mx-auto min-h-screen px-4 py-2">
      <Card className="mx-auto w-full max-w-4xl border-0 shadow-lg">
        <div className="p-4">
          <CardHeader className="space-y-2 rounded-t-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <CardTitle className="text-2xl font-bold">Account</CardTitle>
            <AccountStatus address={address || ""} />
          </CardHeader>
        </div>

        <CardContent className="p-4">
          <Tabs defaultValue="settings" onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-8 grid w-full grid-cols-2 gap-2 rounded-lg p-1">
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <FiSettings className="h-4 w-4" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex items-center gap-2">
                <BiHistory className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="space-y-8">
              <Card className="overflow-hidden border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2 text-lg font-medium">
                    <FiBell className="h-5 w-5 text-blue-600" />
                    Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <SettingPanel />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Account;
