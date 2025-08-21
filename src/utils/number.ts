/** 千分位、固定 0 小數（先照 MVP） */
export function fmtAmount(n: number | string) {
  const v = typeof n === "string" ? Number(n) : n;
  return v.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}
