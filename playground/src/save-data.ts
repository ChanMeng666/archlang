/**
 * Whether the browser asks to spare data (Save-Data, or a 2g connection): the playground then
 * fetches nothing ahead of a use (ruling MP-D4). The one copy of the rule: main.ts's idle import
 * and the header actions' warm-up (actions.ts, card 3.18) both read it
 * (`playground/test/save-data.test.ts`; `e2e/boot.spec.ts` emulates the connections).
 */
export function sparesData(nav: Navigator): boolean {
  const connection = (nav as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connection?.saveData === true || /^(?:slow-)?2g$/.test(connection?.effectiveType ?? "");
}
