// src/register-commands.ts
import "dotenv/config";
import { REST, Routes } from "discord.js";

// ⬇️ 指令都採用 default export
import ping from "./commands/ping";
import goal from "./commands/goal";
import txn from "./commands/txn";
import balance from "./commands/balance";
import summary from "./commands/summary";
import history from "./commands/history";
import notify from "./commands/notify";

// ---- 讀環境變數 ----
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.APPLICATION_ID; // 你的 Bot Application ID
const GUILD_ID = process.env.GUILD_ID; // 若給了就做「伺服器內註冊」，否則做「全域註冊」

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ 缺少環境變數：DISCORD_TOKEN 或 CLIENT_ID / APPLICATION_ID");
  process.exit(1);
}

// ---- 收集所有指令的 data ----
const commands = [
  ping,
  goal,
  txn,
  balance,
  summary,
  history,
  notify,
]
  .filter(Boolean)
  .map((c: any) => {
    if (!c?.data?.toJSON) {
      console.warn("⚠️ 有指令缺少 data 或 toJSON，已略過：", c?.data?.name ?? c);
      return null;
    }
    return c.data.toJSON();
  })
  .filter(Boolean) as any[];

// ---- 送到 Discord ----
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🔄 正在註冊 ${commands.length} 個指令...`);

    if (GUILD_ID) {
      // 伺服器內註冊（更新快，適合開發）
      const data = (await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID),
        { body: commands }
      )) as any[];
      console.log(`✅ 伺服器(${GUILD_ID}) 指令已更新：${data.length} 個`);
    } else {
      // 全域註冊（可能要幾分鐘才會生效）
      const data = (await rest.put(
        Routes.applicationCommands(CLIENT_ID!),
        { body: commands }
      )) as any[];
      console.log(`✅ 全域指令已更新：${data.length} 個`);
    }
  } catch (error) {
    console.error("❌ 註冊失敗：", error);
    process.exit(1);
  }
})();
