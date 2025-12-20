"use client";

import React, { useEffect, useState } from "react";
import { CopyPlus } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { PayModal } from "./PayModal";
import { Button } from "@/components/ui/button";
import { Res } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAirdropRes} from "@/lib/api";
import TxPay from "./txpay";

const Airdrop: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const { user, error: userError } = useUser();
  const [resTable, setResTable] = useState<Res[]>([]);
  const [resError, setResError] = useState<string | null>(null);
  const [visilbleFundModel, setVisibleFundModal] = useState(false);

  const refreshResTable = async () => {
    setLoading(true);
    setResError(null);
    try {
      const result = await getAirdropRes();
      setResTable(result.res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load airdrop results.";
      setResError(message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    refreshResTable();
  }, []);

  const totalColumns = user?.role === "admin" ? 5 : 4;
  const tableError = resError ?? userError ?? null;

  return (
    <div className="container mx-auto min-h-screen px-4 py-2">
        <div className="justify-end flex gap-2">
          {
            user && <Button variant={"default"} size={"lg"} onClick={() => setVisibleFundModal(true)}>
              <CopyPlus size={20} />{user.access_info === 0 ? "Register" : "Fund Qubic"}
            </Button>
          }
        </div>

        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Wallet ID</TableHead>
                    {user?.role === "admin" && <TableHead>Qearn Balance</TableHead>}
                    <TableHead>Invest Balance</TableHead>
                    <TableHead>Airdrop</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {resTable.map((res) => (
                <TableRow key={res.no}>
                  <TableCell>{res.no}</TableCell>
                  <TableCell>{res.wallet_id.slice(0, 6)} ... {res.wallet_id.slice(-6)}</TableCell>
                  {user?.role === "admin" && <TableCell>{res.qearn_bal}</TableCell>}
                  <TableCell>{res.invest_bal}</TableCell>
                  <TableCell>{res.airdrop_amt}</TableCell>
                </TableRow>
              ))}

              {loading && (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              )}

              {!loading && resTable.length === 0 && !tableError && (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="text-center text-muted-foreground">
                    No records found.
                  </TableCell>
                </TableRow>
              )}

              {tableError && (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="text-center text-destructive">
                    Error: {tableError}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
        </Table>

        <PayModal open={visilbleFundModel} onClose={() => setVisibleFundModal(false)}  />

        <TxPay onPurchaseComplete={() => refreshResTable()} />
    </div>
  );
};

export default Airdrop;
