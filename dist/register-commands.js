"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/register-commands.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
// ⬇️ 指令都採用 default export
const ping_1 = __importDefault(require("./commands/ping"));
const goal_1 = __importDefault(require("./commands/goal"));
const txn_1 = __importDefault(require("./commands/txn"));
const balance_1 = __importDefault(require("./commands/balance"));
const summary_1 = __importDefault(require("./commands/summary"));
const history_1 = __importDefault(require("./commands/history"));
const notify_1 = __importDefault(require("./commands/notify"));
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
    ping_1.default,
    goal_1.default,
    txn_1.default,
    balance_1.default,
    summary_1.default,
    history_1.default,
    notify_1.default,
]
    .filter(Boolean)
    .map((c) => {
    if (!c?.data?.toJSON) {
        console.warn("⚠️ 有指令缺少 data 或 toJSON，已略過：", c?.data?.name ?? c);
        return null;
    }
    return c.data.toJSON();
})
    .filter(Boolean);
// ---- 送到 Discord ----
const rest = new discord_js_1.REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try {
        console.log(`🔄 正在註冊 ${commands.length} 個指令...`);
        if (GUILD_ID) {
            // 伺服器內註冊（更新快，適合開發）
            const data = (await rest.put(discord_js_1.Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }));
            console.log(`✅ 伺服器(${GUILD_ID}) 指令已更新：${data.length} 個`);
        }
        else {
            // 全域註冊（可能要幾分鐘才會生效）
            const data = (await rest.put(discord_js_1.Routes.applicationCommands(CLIENT_ID), { body: commands }));
            console.log(`✅ 全域指令已更新：${data.length} 個`);
        }
    }
    catch (error) {
        console.error("❌ 註冊失敗：", error);
        process.exit(1);
    }
})();
