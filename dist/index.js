"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const db_1 = require("./db");
// 指令都用 default export { data, execute }
const ping_1 = __importDefault(require("./commands/ping"));
const goal_1 = __importDefault(require("./commands/goal"));
const txn_1 = __importDefault(require("./commands/txn"));
const balance_1 = __importDefault(require("./commands/balance"));
const summary_1 = __importDefault(require("./commands/summary"));
const history_1 = __importDefault(require("./commands/history"));
const notify_1 = __importDefault(require("./commands/notify"));
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
const commands = new discord_js_1.Collection();
[ping_1.default, goal_1.default, txn_1.default, balance_1.default, summary_1.default, history_1.default, notify_1.default].forEach((c) => {
    if (c?.data?.name && typeof c.execute === "function") {
        commands.set(c.data.name, c);
    }
});
client.commands = commands;
client.once("ready", async () => {
    await (0, db_1.query)("SELECT 1");
    console.log("DB connected ✅");
    console.log(`🤖 Logged in as ${client.user?.tag}`);
});
const inFlight = new Set();
client.removeAllListeners("interactionCreate");
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    if (inFlight.has(interaction.id))
        return;
    inFlight.add(interaction.id);
    const cmd = client.commands?.get?.(interaction.commandName);
    if (!cmd) {
        try {
            await interaction.reply({
                content: "❌ 找不到這個指令。",
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        catch { }
        inFlight.delete(interaction.id);
        return;
    }
    try {
        await cmd.execute(interaction);
    }
    catch (err) {
        console.error(err);
        const msg = { content: "❌ 指令執行失敗，請稍後重試。", flags: discord_js_1.MessageFlags.Ephemeral };
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply(msg);
            }
            else {
                await interaction.followUp(msg);
            }
        }
        catch { }
    }
    finally {
        inFlight.delete(interaction.id);
    }
});
client.on("error", console.error);
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN);
