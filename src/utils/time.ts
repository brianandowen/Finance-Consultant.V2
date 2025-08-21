import { DateTime } from "luxon";

/** 以 Asia/Taipei 顯示 MM/DD HH:mm */
export function formatTW(iso: string | Date) {
  const d = typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
  return d.setZone("Asia/Taipei").toFormat("MM/dd HH:mm");
}

/** 取得「本月」的 UTC 查詢區間（含起，不含迄） */
export function monthRangeUTC() {
  const nowTW = DateTime.now().setZone("Asia/Taipei");
  return {
    from: nowTW.startOf("month").toUTC().toISO(),
    to: nowTW.endOf("month").plus({ millisecond: 1 }).toUTC().toISO(), // < to
  };
}

/** 以 Asia/Taipei 顯示 YYYY-MM-DD（給 deadline 等） */
export function dateOnlyTW(iso: string | null | undefined) {
  if (!iso) return "";
  return DateTime.fromISO(iso).setZone("Asia/Taipei").toFormat("yyyy-MM-dd");
}

/** 把 YYYY-MM-DD（用 Asia/Taipei 解讀）轉成 UTC 起訖 ISO，用於 where gte/lt */
export function toUtcDayRangeFromLocal(dateStr: string) {
  const d = DateTime.fromISO(dateStr, { zone: "Asia/Taipei" });
  if (!d.isValid) return null;
  const from = d.startOf("day").toUTC().toISO();
  const to   = d.endOf("day").plus({ millisecond: 1 }).toUTC().toISO();
  return { from, to };
}