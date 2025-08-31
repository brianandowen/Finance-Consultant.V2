"use strict";
// src/db.ts
// 以 pg Pool 連線到 Neon（Postgres）
// ------------------------------------------------------
// - 匯出 query()：集中執行 SQL 的 helper
// - 匯出 ensureUser()：確保 users 表有此使用者（若不存在就插入）
// ------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.ensureUser = ensureUser;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/** 使用環境變數建立連線池 */
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Neon 需要 SSL；若你本地連 Docker，可視情況關閉
});
/**
 * 統一的 query helper（丟 SQL 與參數）
 * T = 單一 row 的型別，rows: T[]
 */
async function query(text, params) {
    return exports.pool.query(text, params);
}
/** 確保 users 表已存在該 user_id（若無則插入） */
async function ensureUser(userId) {
    await query(`INSERT INTO users (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`, [userId]);
}
