/**
 * `test/equivariance-storeys.test.ts`'s tiers T0, T1 and T2 over the 220 mm shells whose
 * stair head meets something — the shell 300 mm off the flight and the red team's p3 cases
 * (`P3`, `./shaft-equivariance-models.ts`). Split out for wall time only; the suite body is
 * `defineScaledSuite` (`./equivariance-storeys-cases.ts`), shared with
 * `test/equivariance-storeys-scaled.test.ts`.
 */

import { defineScaledSuite, HEAD_MODEL_CASES } from "./equivariance-storeys-cases.js";

defineScaledSuite("220 mm shells with something at the stair head", HEAD_MODEL_CASES);
