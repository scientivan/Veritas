import {encodeAbiParameters, keccak256, type Address, type Hex} from "viem";

/**
 * Mirror of `VeritasRegistry.computeAttestationId`:
 *   keccak256(abi.encode(pHash, blockHash, owner))
 *
 * The id binds the fingerprints to the owner so a near-copy attested by a
 * different owner gets a distinct id (and shows up as a dilution event).
 */
export function computeAttestationId(pHash: Hex, blockHash: Hex, owner: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{type: "bytes32"}, {type: "bytes32"}, {type: "address"}],
      [pHash, blockHash, owner],
    ),
  );
}
