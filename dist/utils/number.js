"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtAmount = fmtAmount;
/** 千分位、固定 0 小數（先照 MVP） */
function fmtAmount(n) {
    const v = typeof n === "string" ? Number(n) : n;
    return v.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}
