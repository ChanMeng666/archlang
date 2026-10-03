/**
 * `test/equivariance-storeys.test.ts`'s tiers T0, T1 and T2 over the SCALED shaft models —
 * the scaled layouts and the plain 179/220 mm shells. Split out for wall time only (each
 * storey here rasterises a plan of up to 120 m × 100 m a dozen times); the suite body is
 * `defineScaledSuite` (`./equivariance-storeys-cases.ts`), shared with
 * `test/equivariance-storeys-head.test.ts`.
 */

import { defineScaledSuite, SCALED_MODEL_CASES } from "./equivariance-storeys-cases.js";

defineScaledSuite("scaled shaft models", SCALED_MODEL_CASES);
