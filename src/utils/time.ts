// src/utils/time.ts
import { DateTime } from "luxon";

/**
 * 通用日期解析函式：
 * 能處理 Date 物件、ISO 字串、SQL 字串等多種格式。
 */
function parseDate(value: unknown, zone = "Asia/Taipei"): DateTime | null {
  if (!value) return null;

  // 若是 Date 物件（例如 PG 驅動回傳的 timestamp）
  if (value instanceof Date) {
    const dt = DateTime.fromJSDate(value, { zone });
    return dt.isValid ? dt : null;
  }

  // 若是字串
  const str = String(value).trim();
  if (!str) return null;

  // 1️⃣ 嘗試解析 ISO 格式 (含 T/Z)
  let dt = DateTime.fromISO(str, { zone });
  if (dt.isValid) return dt;

  // 2️⃣ 嘗試解析 SQL 格式 (YYYY-MM-DD HH:mm:ss)
  dt = DateTime.fromSQL(str, { zone });
  if (dt.isValid) return dt;

  // 3️⃣ 嘗試 UNIX timestamp (有些版本會給整數字串)
  const num = Number(str);
  if (!Number.isNaN(num) && num > 1000000000) {
    dt = DateTime.fromMillis(num, { zone });
    if (dt.isValid) return dt;
  }

  // 全部都不行就回傳 null
  return null;
}

/**
 * 顯示格式：月/日 時:分（台北時間）
 * e.g. 10/27 14:05
 */
export function formatTW(value: unknown): string {
  const dt = parseDate(value, "Asia/Taipei");
  return dt ? dt.toFormat("MM/dd HH:mm") : "Invalid DateTime";
}

/**
 * 顯示格式：年-月-日（台北時間）
 * e.g. 2025-10-30
 */
export function dateOnlyTW(value: unknown): string {
  const dt = parseDate(value, "Asia/Taipei");
  return dt ? dt.toFormat("yyyy-MM-dd") : "Invalid DateTime";
}

/**
 * 驗證日期字串是否合法（ISO / SQL 格式皆可）
 */
export function isValidISODate(value: unknown): boolean {
  const dt = parseDate(value, "Asia/Taipei");
  return !!dt;
}
