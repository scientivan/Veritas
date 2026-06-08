import {createPublicClient, http} from "viem";
import {unichainSepolia} from "./chains";

/** Shared public client for reading events and chain state from Unichain Sepolia. */
export const publicEventsClient = createPublicClient({
  chain: unichainSepolia,
  transport: http(),
});

/** The public Unichain Sepolia RPC caps eth_getLogs to 10 000 blocks per request. */
const CHUNK_SIZE = 9_500n;

/**
 * Fetch logs across a wide block range by splitting into parallel CHUNK_SIZE-block
 * requests. The chunks run in parallel, so latency ≈ one RPC round-trip regardless
 * of the total range.
 */
export async function getLogsInChunks<T>(
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint
): Promise<T[]> {
  if (toBlock < fromBlock) return [];
  const promises: Promise<T[]>[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK_SIZE) {
    const to = from + CHUNK_SIZE - 1n <= toBlock ? from + CHUNK_SIZE - 1n : toBlock;
    promises.push(fetchChunk(from, to));
  }
  return (await Promise.all(promises)).flat();
}
