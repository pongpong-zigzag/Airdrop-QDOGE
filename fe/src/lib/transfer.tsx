"use client";

import { QubicTransaction } from "@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction";
import { PublicKey } from "@qubic-lib/qubic-ts-library/dist/qubic-types/PublicKey";
import { Long } from "@qubic-lib/qubic-ts-library/dist/qubic-types/Long";
import { DynamicPayload } from "@qubic-lib/qubic-ts-library/dist/qubic-types/DynamicPayload";
import { QubicTransferAssetPayload } from "@qubic-lib/qubic-ts-library/dist/qubic-types/transacion-payloads/QubicTransferAssetPayload";
import { QubicDefinitions } from "@qubic-lib/qubic-ts-library/dist/QubicDefinitions";
import { fetchTickInfo } from "@/services/rpc.service";
import { DEFAULT_TICK_OFFSET } from "@/constants";

type SendQubicParams = {
  from: string;
  to: string;
  amount: bigint | number; // amount in QU
};

type SendAssetParams = {
  from: string;
  to: string;
  amount: bigint | number;
  assetName?: string;
};

const QDOGE_ASSET_ISSUER =
  process.env.QDOGE_ISSUER_ID ||
  "QDOGEEESKYPAICECHEAHOXPULEOADTKGEJHAVYPFKHLEWGXXZQUGIGMBUTZE";

export async function createQubicTx({ from, to, amount }: SendQubicParams) {
  const currentTick = await fetchTickInfo();
  const settings = localStorage.getItem("settings");
  const tickOffset = settings ? JSON.parse(settings).tickOffset : DEFAULT_TICK_OFFSET;
  const targetTick = currentTick.tick + tickOffset;

  console.log(currentTick.tick, targetTick);

  const tx = new QubicTransaction()
    .setSourcePublicKey(from)
    .setDestinationPublicKey(to)
    .setTick(targetTick)
    .setInputType(0)
    .setInputSize(0)
    .setAmount(new Long(amount));

    console.log(tx);

  return tx;
}

export async function createAssetTx({ from, to, amount, assetName = "QDOGE" }: SendAssetParams) {
  const currentTick = await fetchTickInfo();
  const targetTick = currentTick.tick + DEFAULT_TICK_OFFSET;

  const unitsLong = new Long(BigInt(amount));

  const payloadBuilder = new QubicTransferAssetPayload()
    .setIssuer(new PublicKey(QDOGE_ASSET_ISSUER))
    .setNewOwnerAndPossessor(to)
    .setAssetName(assetName)
    .setNumberOfUnits(unitsLong);

  const payload: DynamicPayload = payloadBuilder.getTransactionPayload();

  const feeLong = new Long(BigInt(QubicDefinitions.QX_TRANSFER_ASSET_FEE));
  console.log(QubicDefinitions.QX_ADDRESS);

  const tx = new QubicTransaction()
    .setSourcePublicKey(from)
    .setDestinationPublicKey(new PublicKey(QubicDefinitions.QX_ADDRESS))
    .setTick(targetTick)
    .setInputType(QubicDefinitions.QX_TRANSFER_ASSET_INPUT_TYPE)
    .setInputSize(payload.getPackageSize())
    .setAmount(feeLong)
    .setPayload(payload);

  return tx;
}
