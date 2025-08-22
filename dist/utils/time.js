"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTW = formatTW;
exports.monthRangeUTC = monthRangeUTC;
exports.dateOnlyTW = dateOnlyTW;
exports.toUtcDayRangeFromLocal = toUtcDayRangeFromLocal;
const luxon_1 = require("luxon");
/** 以 Asia/Taipei 顯示 MM/DD HH:mm */
function formatTW(iso) {
    const d = typeof iso === "string" ? luxon_1.DateTime.fromISO(iso) : luxon_1.DateTime.fromJSDate(iso);
    return d.setZone("Asia/Taipei").toFormat("MM/dd HH:mm");
}
/** 取得「本月」的 UTC 查詢區間（含起，不含迄） */
function monthRangeUTC() {
    const nowTW = luxon_1.DateTime.now().setZone("Asia/Taipei");
    return {
        from: nowTW.startOf("month").toUTC().toISO(),
        to: nowTW.endOf("month").plus({ millisecond: 1 }).toUTC().toISO(), // < to
    };
}
/** 以 Asia/Taipei 顯示 YYYY-MM-DD（給 deadline 等） */
function dateOnlyTW(iso) {
    if (!iso)
        return "";
    return luxon_1.DateTime.fromISO(iso).setZone("Asia/Taipei").toFormat("yyyy-MM-dd");
}
/** 把 YYYY-MM-DD（用 Asia/Taipei 解讀）轉成 UTC 起訖 ISO，用於 where gte/lt */
function toUtcDayRangeFromLocal(dateStr) {
    const d = luxon_1.DateTime.fromISO(dateStr, { zone: "Asia/Taipei" });
    if (!d.isValid)
        return null;
    const from = d.startOf("day").toUTC().toISO();
    const to = d.endOf("day").plus({ millisecond: 1 }).toUTC().toISO();
    return { from, to };
}
