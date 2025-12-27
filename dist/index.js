"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const Interactive = __importStar(require("./features/interactive"));
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
    partials: [discord_js_1.Partials.Channel],
});
client.commands = new discord_js_1.Collection();
function safeLoadCommand(path) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(path);
        const cmd = mod.default || mod;
        if (cmd?.data?.name && typeof cmd.execute === "function") {
            client.commands.set(cmd.data.name, cmd);
            console.log(`[cmd] loaded: ${cmd.data.name}`);
        }
    }
    catch { }
}
safeLoadCommand("./commands/ai");
safeLoadCommand("./commands/goal");
safeLoadCommand("./commands/txn");
safeLoadCommand("./commands/ask");
safeLoadCommand("./commands/notify.ts");
client.once("ready", async () => {
    console.log(`[ready] Logged in as ${client.user?.tag}`);
    // 兼容不同匯出型態（named / default）
    const reg = Interactive.registerInteractiveQnA ||
        Interactive.default?.registerInteractiveQnA;
    if (typeof reg === "function") {
        reg(client);
    }
    else {
        console.error("❌ registerInteractiveQnA 沒有正確匯出，請檢查 src/features/interactive.ts");
    }
});
client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isChatInputCommand())
            return;
        const cmd = client.commands?.get(interaction.commandName);
        if (!cmd) {
            await interaction.reply({ content: "指令未找到或已移除。", ephemeral: true });
            return;
        }
        await cmd.execute(interaction);
    }
    catch (err) {
        console.error("[interaction] error:", err);
        if (interaction.isRepliable()) {
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply("❗ 發生錯誤，請稍後再試");
                }
                else {
                    await interaction.reply({ content: "❗ 發生錯誤，請稍後再試", ephemeral: true });
                }
            }
            catch { }
        }
    }
});
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("❌ 缺少 DISCORD_TOKEN 環境變數");
    process.exit(1);
}
client.login(token);
