"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
const ping_1 = require("./commands/ping");
const goal_1 = require("./commands/goal");
const txn_1 = require("./commands/txn");
const balance_1 = require("./commands/balance");
const summary_1 = require("./commands/summary");
const history_1 = require("./commands/history");
const notify_1 = require("./commands/notify");
dotenv_1.default.config();
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
const commands = new discord_js_1.Collection([
    [ping_1.pingCommand.data.name, ping_1.pingCommand],
    [goal_1.goalCommand.data.name, goal_1.goalCommand],
    [txn_1.txnCommand.data.name, txn_1.txnCommand],
    [balance_1.balanceCommand.data.name, balance_1.balanceCommand],
    [summary_1.summaryCommand.data.name, summary_1.summaryCommand],
    [history_1.historyCommand.data.name, history_1.historyCommand],
    [notify_1.notifyCommand.data.name, notify_1.notifyCommand],
]);
client.once(discord_js_1.Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user?.tag}`);
});
// 保險回覆：依互動狀態選擇 reply / editReply / followUp，避免 10062
async function safeReply(interaction, payload) {
    try {
        if (interaction.deferred)
            return await interaction.editReply(payload);
        if (interaction.replied)
            return await interaction.followUp(payload);
        return await interaction.reply(payload);
    }
    catch (e) {
        console.error("safeReply error:", e);
    }
}
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const command = commands.get(interaction.commandName);
    if (!command) {
        await safeReply(interaction, { content: "找不到這個指令 🤔", ephemeral: true });
        return;
    }
    // 2 秒保底：若 2 秒內 command 還沒回，就自動 defer，避免 3 秒逾時
    const deferTimer = setTimeout(async () => {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
        }
        catch (e) {
            // 這裡安靜吞掉，避免計時器晚到造成多次回覆錯誤
        }
    }, 2000);
    try {
        await command.execute(interaction); // 讓各指令照原本邏輯做（可能自己 reply / editReply）
        clearTimeout(deferTimer);
        // 若指令執行完仍未回覆，補一個完成訊息，保證有回應
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "✅ 完成", ephemeral: true });
        }
        else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply("✅ 完成");
        }
    }
    catch (e) {
        clearTimeout(deferTimer);
        console.error(e);
        await safeReply(interaction, { content: "⚠️ 指令執行錯誤", ephemeral: true });
    }
});
client.login(process.env.DISCORD_TOKEN);
