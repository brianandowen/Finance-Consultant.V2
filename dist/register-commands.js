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
const commands = [
    ping_1.pingCommand.data.toJSON(),
    goal_1.goalCommand.data.toJSON(),
    txn_1.txnCommand.data.toJSON(),
    balance_1.balanceCommand.data.toJSON(),
    summary_1.summaryCommand.data.toJSON(),
    history_1.historyCommand.data.toJSON(),
    notify_1.notifyCommand.data.toJSON(),
];
const rest = new discord_js_1.REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
async function main() {
    await rest.put(discord_js_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log("✅ 指令已註冊");
}
main();
