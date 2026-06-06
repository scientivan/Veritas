import {useReadContracts} from "wagmi";
import {formatEther} from "viem";
import {REGISTRY_ABI} from "@/lib/abis";
import {REGISTRY_ADDRESS} from "@/lib/contracts";

const META_CONTRACTS = [
  {address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "attestFee" as const},
  {address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "disputeBond" as const},
  {address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "fingerprintCount" as const},
] as const;

/** Live read of attestFee, disputeBond, and total attestation count from the registry. */
export function useContractMeta() {
  const {data} = useReadContracts({contracts: META_CONTRACTS});

  const attestFee = data?.[0]?.status === "success" ? (data[0].result as bigint) : undefined;
  const disputeBond = data?.[1]?.status === "success" ? (data[1].result as bigint) : undefined;
  const fingerprintCount = data?.[2]?.status === "success" ? Number(data[2].result) : undefined;

  return {
    attestFee,
    disputeBond,
    fingerprintCount,
    attestFeeEth: attestFee !== undefined ? formatEther(attestFee) : undefined,
    disputeBondEth: disputeBond !== undefined ? formatEther(disputeBond) : undefined,
  };
}
