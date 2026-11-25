export function isDisbursementCheck(direction: string | null, sourceRef: string | null): boolean {
  return direction === "ISSUED" && /^DP-[1-9]\d*$/.test(sourceRef ?? "");
}
