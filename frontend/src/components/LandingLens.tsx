"use client";

import {usePathname} from "next/navigation";
import {DetectorLens} from "./DetectorLens";

/**
 * Mounts the ambient DetectorLens cursor field ONLY on the landing page ("/").
 * Kept in the root layout (not the page) so the canvas keeps its z-0 slot behind
 * the z-10 content stacking context; route-gated here instead of globally.
 */
export function LandingLens() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <DetectorLens />;
}
