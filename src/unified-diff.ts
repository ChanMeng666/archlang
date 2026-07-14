/**
 * A tiny, zero-dependency line-based unified diff (LCS backtrack + hunk grouping).
 *
 * Pure core: no I/O, no Node APIs, deterministic — `compile()`'s purity rules apply.
 * It produces standard unified-diff text (`--- a`/`+++ b` headers, `@@ -l,c +l,c @@`
 * hunks, ` `/`-`/`+` lines) between two `.arch` sources — enough for a reader (human or
 * agent) to see exactly what a rewrite changed. Used by the dataset generator's
 * fix→repair trajectories and by `arch fix`'s diff preview / `--dry-run`.
 */

/** Longest-common-subsequence table over two line arrays (classic DP). */
function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  return dp;
}

type Op = { tag: " " | "-" | "+"; line: string };

/** The edit script as a flat op list (context / delete / add), in order. */
function opsOf(a: string[], b: string[]): Op[] {
  const dp = lcs(a, b);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ tag: " ", line: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ tag: "-", line: a[i]! });
      i++;
    } else {
      ops.push({ tag: "+", line: b[j]! });
      j++;
    }
  }
  while (i < a.length) ops.push({ tag: "-", line: a[i++]! });
  while (j < b.length) ops.push({ tag: "+", line: b[j++]! });
  return ops;
}

/**
 * Unified diff between `aText` and `bText`, with `context` lines of surrounding context
 * (default 3). Returns `""` when the two are identical. Trailing-newline handling: the
 * text is split on `\n` and a trailing empty element (from a final newline) is dropped so
 * line counts read naturally.
 */
export function unifiedDiff(
  aText: string,
  bText: string,
  aName = "a/broken.arch",
  bName = "b/fixed.arch",
  context = 3,
): string {
  if (aText === bText) return "";
  const split = (t: string): string[] => {
    const lines = t.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  const a = split(aText);
  const b = split(bText);
  const ops = opsOf(a, b);

  // Group ops into hunks: runs of change ops plus `context` lines of surrounding context.
  const changed = ops.map((o) => o.tag !== " ");
  const out: string[] = [`--- ${aName}`, `+++ ${bName}`];

  let idx = 0;
  while (idx < ops.length) {
    if (!changed[idx]) {
      idx++;
      continue;
    }
    // Extend a hunk window backward/forward by `context`, merging near hunks.
    const start = Math.max(0, idx - context);
    let end = idx;
    while (end < ops.length) {
      if (changed[end]) {
        end++;
        continue;
      }
      // Look ahead: if another change falls within 2*context, keep the run going.
      let next = end;
      while (next < ops.length && !changed[next]) next++;
      if (next < ops.length && next - end <= context * 2) {
        end = next;
      } else {
        break;
      }
    }
    end = Math.min(ops.length, end + context);

    // Compute the hunk's source/dest line ranges.
    let aLine = 1;
    let bLine = 1;
    for (let k = 0; k < start; k++) {
      if (ops[k]!.tag !== "+") aLine++;
      if (ops[k]!.tag !== "-") bLine++;
    }
    let aCount = 0;
    let bCount = 0;
    for (let k = start; k < end; k++) {
      if (ops[k]!.tag !== "+") aCount++;
      if (ops[k]!.tag !== "-") bCount++;
    }
    out.push(`@@ -${aLine},${aCount} +${bLine},${bCount} @@`);
    for (let k = start; k < end; k++) out.push(`${ops[k]!.tag}${ops[k]!.line}`);
    idx = end;
  }
  return out.join("\n") + "\n";
}
