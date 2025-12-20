import { QubicHelper } from "@qubic-lib/qubic-ts-library/dist/qubicHelper";
import { QubicTransaction } from "@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction";
import { PublicKey } from "@qubic-lib/qubic-ts-library/dist/qubic-types/PublicKey";
import { Long } from "@qubic-lib/qubic-ts-library/dist/qubic-types/Long";
import { DynamicPayload } from "@qubic-lib/qubic-ts-library/dist/qubic-types/DynamicPayload";
import { QubicTransferAssetPayload } from "@qubic-lib/qubic-ts-library/dist/qubic-types/transacion-payloads/QubicTransferAssetPayload";
import { QubicDefinitions } from "@qubic-lib/qubic-ts-library/dist/QubicDefinitions";
import { fetchTickInfo } from "@/services/rpc.service";
import { DEFAULT_TICK_OFFSET, RPC_URL } from "@/constants";

type SendQubicParams = {
  from: string;
  to: string;
  amount: bigint | number; // amount in QU (smallest unit, e.g. 100n for 100 QU)
};

export async function createQubicTx({
  from,
  to,
  amount,
}: SendQubicParams) {

  const currentTick = await fetchTickInfo();
  const targetTick = currentTick.tick + DEFAULT_TICK_OFFSET;

  const tx = new QubicTransaction()
    .setSourcePublicKey(from)
    .setDestinationPublicKey(to)
    .setTick(targetTick)
    .setInputType(0)
    .setInputSize(0)
    .setAmount(new Long(amount));

    return tx; 
}
