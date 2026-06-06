import {redirect} from "next/navigation";

/**
 * The standalone "Verify Art" / attest flow has been merged into the single
 * "Launch Your IP" flow (Step 1 verifies + scores, the on-chain attestation now
 * fires right before the mint). This route is kept only to redirect old links.
 */
export default function AttestPage() {
  redirect("/launch");
}
