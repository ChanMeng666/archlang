#!/usr/bin/env node
/** `archlang3d`'s entry: runs `run.ts`'s command and sets the exit code (usage and codes there). */
import { main } from "./run.js";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`archlang3d: internal error: ${(e as Error).stack ?? String(e)}\n`);
    process.exitCode = 1;
  },
);
