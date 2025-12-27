// src/utils/time.ts
import { DateTime } from "luxon";

/**
 * ===== 1. 通用日期解析（台北時區）=====
 * 能處理 Date 物件、ISO 字串、SQL 字串、UNIX timestamp 等
 * 用途：讓所有日期處理一致，避免某些地方 fromISO 解析失敗造成誤判
 */
export function parseDate(value: unknown, zone = "Asia/Taipei"): DateTime | null {
  if (!value) return null;

  // ✅ 若是 Date 物件（例如 PG driver 回傳的 timestamp）
  if (value instanceof Date) {
    const dt = DateTime.fromJSDate(value, { zone });
    return dt.isValid ? dt : null;
  }

  // ✅ 若是字串
  const str = String(value).trim();
  if (!str) return null;

  // 1️⃣ 嘗試 ISO (含 T/Z)
  let dt = DateTime.fromISO(str, { zone });
  if (dt.isValid) return dt;

  // 2️⃣ 嘗試 SQL (YYYY-MM-DD HH:mm:ss)
  dt = DateTime.fromSQL(str, { zone });
  if (dt.isValid) return dt;

  // 3️⃣ 嘗試 UNIX timestamp（毫秒）
  const num = Number(str);
  if (!Number.isNaN(num) && num > 1000000000) {
    dt = DateTime.fromMillis(num, { zone });
    if (dt.isValid) return dt;
  }

  return null;
}

/**
 * ===== 2. 顯示格式：月/日 時:分（台北時間）=====
 * e.g. 10/27 14:05
 */
export function formatTW(value: unknown): string {
  const dt = parseDate(value, "Asia/Taipei");
  return dt ? dt.toFormat("MM/dd HH:mm") : "Invalid DateTime";
}

/**
 * ===== 3. 顯示格式：年-月-日（台北時間）=====
 * e.g. 2025-10-30
 */
export function dateOnlyTW(value: unknown): string {
  const dt = parseDate(value, "Asia/Taipei");
  return dt ? dt.toFormat("yyyy-MM-dd") : "Invalid DateTime";
}

/**
 * ===== 4. 驗證日期字串是否合法（ISO / SQL / Date）=====
 */
export function isValidISODate(value: unknown): boolean {
  const dt = parseDate(value, "Asia/Taipei");
  return !!dt;
}

/**
 * ===== 5. ⭐ 目標截止日專用：統一計算（避免誤判已到期）=====
 * 你 goal.deadline 是存 "YYYY-MM-DD"（DATE），那就把它當成「那天結束 23:59:59 才算到期」
 *
 * 回傳：
 * - ok: 解析成功
 * - dateLabel: 顯示用 yyyy-mm-dd
 * - isExpired: 是否已到期（現在 > 截止日當天的 endOfDay）
 * - daysLeft: 剩幾天（包含今天的概念，用 ceil）
 * - endOfDay: 截止日的 endOfDay DateTime
 */
export function deadlineTWInfo(deadline: unknown) {
  const tz = "Asia/Taipei";
  const due = parseDate(deadline, tz);

  if (!due) {
    return {
      ok: false as const,
      dateLabel: "Invalid",
      isExpired: false,
      daysLeft: null as number | null,
      endOfDay: null as DateTime | null,
    };
  }

  const now = DateTime.now().setZone(tz);
  const endOfDay = due.setZone(tz).endOf("day");

  const msLeft = endOfDay.toMillis() - now.toMillis();
  const isExpired = msLeft < 0;

  // ✅ daysLeft 只在未到期時有意義
  // 例如距離還有 0.2 天，ceil = 1 天（表示「今天內要完成」）
  const daysLeft = isExpired ? 0 : Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  return {
    ok: true as const,
    dateLabel: endOfDay.toFormat("yyyy-MM-dd"),
    isExpired,
    daysLeft,
    endOfDay,
  };
}
