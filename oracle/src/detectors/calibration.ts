import {config} from "../config.js";

/**
 * Temperature-scale a 2-class (AI vs real) probability pair to correct the image
 * detector's overconfidence. Operates on the logit of P(AI) vs P(real): T > 1
 * pulls extreme scores toward 0.5, T <= 1 is a near-identity (returns P(AI)
 * renormalized over the two classes). Pure + deterministic, so it is unit-tested
 * without loading any model. See detectors/imageAi.ts for the measured over-fire.
 */
export function calibrateAi(pAi: number, pReal: number, temperature = config.imageAiTemperature): number {
  const eps = 1e-6;
  const a = Math.min(Math.max(pAi, eps), 1 - eps);
  const b = Math.min(Math.max(pReal, eps), 1 - eps);
  const t = temperature > 0 ? temperature : 1;
  const logit = Math.log(a / b); // 2-class logit: AI vs real
  return 1 / (1 + Math.exp(-(logit / t)));
}
