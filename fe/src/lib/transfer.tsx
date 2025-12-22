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
  amount: bigint | number; // amount in QU (smallest unit, e.g. 100n for 100 QU)
};

type SendQDOGEParams = {
  to: string;
  amount: bigint | number; // amount in QU (smallest unit, e.g. 100n for 100 QU)
};

const QDOGE_ASSET_ISSUER = process.env.QDOGE_ISSUER;

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

export async function createAssetTx({
  to,
  amount
}: SendQDOGEParams) {
  const currentTick = await fetchTickInfo();
  const targetTick = currentTick.tick + DEFAULT_TICK_OFFSET;

  // 3. Build QX asset transfer payload (issuer, newOwner, assetName, units)
  const unitsLong = new Long(BigInt(amount));

  const payloadBuilder = new QubicTransferAssetPayload()
    .setIssuer(new PublicKey(QDOGE_ASSET_ISSUER))                // QDOGE issuer identity
    .setNewOwnerAndPossessor(to)    // receiver identity
    .setAssetName("QDOGE")          // "QDOGE"
    .setNumberOfUnits(unitsLong);     // number of QDOGE units

  const payload: DynamicPayload = payloadBuilder.getTransactionPayload();

  // 4. QX asset transfer fee (amount in QU sent to QX contract)
  const feeLong = new Long(BigInt(QubicDefinitions.QX_TRANSFER_ASSET_FEE));

  // 5. Create transaction targeting QX contract
  const tx = new QubicTransaction()
    .setSourcePublicKey(new PublicKey(QDOGE_ASSET_ISSUER))
    .setDestinationPublicKey(new PublicKey(QubicDefinitions.QX_ADDRESS))
    .setTick(targetTick)
    .setInputType(QubicDefinitions.QX_TRANSFER_ASSET_INPUT_TYPE) // 2
    .setInputSize(payload.getPackageSize())
    .setAmount(feeLong)               // pay QX_TRANSFER_ASSET_FEE in QU
    .setPayload(payload);

  return tx;
}

// export async function createAssetTx({
// from,
// to,

// }) => {
//   const tx = new QubicTransaction();
//   return tx;
// }
