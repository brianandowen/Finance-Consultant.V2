// scripts/inspect-db.ts
import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 取得 public schema 的所有「一般資料表」
  const tablesRes = await pool.query<{
    table_name: string;
  }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
    `
  );
  const tables = tablesRes.rows.map(r => r.table_name);

  for (const t of tables) {
    console.log(`\n=== TABLE: ${t} ===`);
    // 欄位/型別/是否可為 NULL/預設值
    const colsRes = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
      column_default: string | null;
    }>(
      `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position
      `,
      [t]
    );
    for (const c of colsRes.rows) {
      console.log(
        `- ${c.column_name}  (${c.data_type})  nullable=${c.is_nullable}  default=${c.column_default ?? "NULL"}`
      );
    }

    // 總筆數
    const cntRes = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${t}"`);
    console.log(`rows: ${cntRes.rows[0].count}`);

    // 抓 3 筆樣本（避免個資外洩，僅供結構比對；你資料是假的就更沒差）
    const sampleRes = await pool.query(`SELECT * FROM "${t}" ORDER BY 1 DESC LIMIT 3`);
    if (sampleRes.rowCount) {
      console.log(`samples:`);
      for (const row of sampleRes.rows) {
        console.log(row);
      }
    }
  }

  // 額外：看有哪些 VIEW（若你有用）
  const viewsRes = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema='public'
    ORDER BY table_name
  `);
  if (viewsRes.rowCount) {
    console.log(`\n=== VIEWS ===`);
    viewsRes.rows.forEach(v => console.log(`- ${v.table_name}`));
  }

  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
