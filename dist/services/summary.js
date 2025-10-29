"use strict";
// src/services/summary.ts
// 對齊你的實際 schema：transactions(ttype, amount, category, occurred_at), goals(target_amount, start_date)
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFinanceSummary = buildFinanceSummary;
const luxon_1 = require("luxon");
async function buildFinanceSummary(db, userId) {
    // 以台北時區計算當月區間（[含, 不含)）
    const nowTW = luxon_1.DateTime.now().setZone("Asia/Taipei");
    const monthStartTW = nowTW.startOf("month");
    const nextMonthStartTW = monthStartTW.plus({ months: 1 });
    const startUtcISO = monthStartTW.toUTC().toISO(); // 含
    const endUtcISO = nextMonthStartTW.toUTC().toISO(); // 不含
    const monthStr = monthStartTW.toFormat("yyyy-MM");
    // 1) 本月總收入/支出/淨額  ✅ 使用 ttype、occurred_at
    const monthly = await db.query(`
    SELECT
      SUM(CASE WHEN ttype='income'  THEN amount ELSE 0 END)::float8 AS income,
      SUM(CASE WHEN ttype='expense' THEN amount ELSE 0 END)::float8 AS expense,
      (SUM(CASE WHEN ttype='income'  THEN amount ELSE 0 END)
      - SUM(CASE WHEN ttype='expense' THEN amount ELSE 0 END))::float8 AS net
    FROM transactions
    WHERE user_id = $1
      AND occurred_at >= $2
      AND occurred_at <  $3
    `, [userId, startUtcISO, endUtcISO]);
    const totals = {
        income: Number(monthly.rows[0]?.income ?? 0),
        expense: Number(monthly.rows[0]?.expense ?? 0),
        net: Number(monthly.rows[0]?.net ?? 0),
    };
    // 2) 本月 Top3 類別（支出） ✅ 使用 ttype、occurred_at
    const catRows = await db.query(`
    SELECT category AS name, SUM(amount)::float8 AS amount
    FROM transactions
    WHERE user_id = $1
      AND ttype = 'expense'
      AND occurred_at >= $2
      AND occurred_at <  $3
    GROUP BY category
    ORDER BY SUM(amount) DESC
    LIMIT 3
    `, [userId, startUtcISO, endUtcISO]);
    const totalExpense = totals.expense || 1;
    const byCategoryTop3 = catRows.rows.map((r) => ({
        name: r.name ?? "未分類",
        amount: Number(r.amount ?? 0),
        pct: Math.round(((Number(r.amount ?? 0) / totalExpense) * 1000)) / 10,
    }));
    // 3) 最近 30 筆統計（全期間） ✅ 使用 occurred_at
    const last30 = await db.query(`SELECT amount::float8 AS amount
     FROM transactions
     WHERE user_id = $1
     ORDER BY occurred_at DESC
     LIMIT 30`, [userId]);
    const arr = last30.rows
        .map((r) => Number(r.amount))
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
    const avg = arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0;
    const median = arr.length
        ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2)
        : 0;
    const p95 = arr.length ? (arr[Math.floor(arr.length * 0.95) - 1] ?? arr[arr.length - 1]) : 0;
    // 4) 目前啟用目標（若有） ✅ 使用 target_amount + start_date 計算 saved/progress
    const goalRow = await db.query(`
    SELECT name, target_amount::float8 AS target, start_date
    FROM goals
    WHERE user_id = $1 AND is_active = TRUE
    ORDER BY updated_at DESC
    LIMIT 1
    `, [userId]);
    let goal;
    if (goalRow.rowCount) {
        const g = goalRow.rows[0];
        const target = Number(g.target ?? 0);
        const startDate = g.start_date
            ? luxon_1.DateTime.fromJSDate(new Date(g.start_date)).toUTC().toISO()
            : monthStartTW.startOf("month").toUTC().toISO(); // 沒給就用當月初
        // 用交易帳從 goal.start_date 起算到「現在」的淨流入當作 saved
        const savedRes = await db.query(`
      SELECT
        (COALESCE(SUM(CASE WHEN ttype='income'  THEN amount END),0)
       - COALESCE(SUM(CASE WHEN ttype='expense' THEN amount END),0))::float8 AS saved
      FROM transactions
      WHERE user_id = $1
        AND occurred_at >= $2
        AND occurred_at <  $3
      `, [userId, startDate, nowTW.plus({ days: 1 }).startOf("day").toUTC().toISO()]);
        let saved = Number(savedRes.rows[0]?.saved ?? 0);
        if (!Number.isFinite(saved))
            saved = 0;
        // 邏輯：最低 0，最高 cap 在 target（避免超過 100% 不好看；要保留 >100% 也可以拿掉 min）
        const progressPct = target > 0 ? Math.min(100, Math.max(0, Math.round((saved / target) * 1000) / 10)) : 0;
        goal = {
            name: String(g.name),
            target,
            saved,
            progressPct,
        };
    }
    // 5) MoM（上月淨額對比） ✅ 使用 ttype、occurred_at
    const prevStartUtcISO = monthStartTW.minus({ months: 1 }).toUTC().toISO();
    const prevEndUtcISO = monthStartTW.toUTC().toISO();
    const prev = await db.query(`
    SELECT
      (SUM(CASE WHEN ttype='income' THEN amount ELSE 0 END)
     - SUM(CASE WHEN ttype='expense' THEN amount ELSE 0 END))::float8 AS net
    FROM transactions
    WHERE user_id = $1
      AND occurred_at >= $2
      AND occurred_at <  $3
    `, [userId, prevStartUtcISO, prevEndUtcISO]);
    const momNetPct = (() => {
        const prevNet = Number(prev.rows[0]?.net ?? 0);
        const nowNet = totals.net;
        if (prevNet === 0)
            return undefined;
        return Math.round((((nowNet - prevNet) / Math.abs(prevNet)) * 1000)) / 10;
    })();
    // 6) 告警（示例）
    const alerts = [];
    const eat = byCategoryTop3.find((c) => c.name === "外食");
    if (eat && eat.pct >= 15)
        alerts.push(`外食占比 ${eat.pct}%（>15%）`);
    return {
        period: {
            month: monthStr,
            range: `${monthStartTW.toFormat("yyyy-MM-dd")}~${nowTW.toFormat("yyyy-MM-dd")}`,
        },
        totals,
        byCategoryTop3,
        last30TxnsStats: { avg, median, p95 },
        goal,
        comparisons: { momNetPct },
        alerts: alerts.length ? alerts : undefined,
    };
}
