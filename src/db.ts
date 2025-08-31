// src/db.ts
// 以 pg Pool 連線到 Neon（Postgres）
// ------------------------------------------------------
// - 匯出 query()：集中執行 SQL 的 helper
// - 匯出 ensureUser()：確保 users 表有此使用者（若不存在就插入）
// ------------------------------------------------------

import { Pool, QueryResult, QueryResultRow } from "pg";
import dotenv from "dotenv";

dotenv.config();

/** 使用環境變數建立連線池 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon 需要 SSL；若你本地連 Docker，可視情況關閉
});

/** 
 * 統一的 query helper（丟 SQL 與參數）
 * T = 單一 row 的型別，rows: T[]
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** 確保 users 表已存在該 user_id（若無則插入） */
export async function ensureUser(userId: string) {
  await query(
    `INSERT INTO users (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}
