"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const fs_1 = require("fs");
const path_1 = require("path");
const env_1 = require("./config/env");
const guards_1 = require("./lib/guards");
const reply_1 = require("./lib/reply");
(0, env_1.validateEnv)();
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
const commands = new discord_js_1.Collection();
function loadCommands() {
    const dir = (0, path_1.join)(__dirname, 'commands');
    const files = (0, fs_1.readdirSync)(dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    for (const file of files) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require((0, path_1.join)(dir, file));
        const cmd = mod.default ?? mod;
        if (cmd?.data?.name && typeof cmd.execute === 'function') {
            commands.set(cmd.data.name, cmd);
        }
    }
    console.log(`[commands] loaded: ${commands.size}`);
}
loadCommands();
client.once(discord_js_1.Events.ClientReady, c => {
    console.log(`Ready as ${c.user.tag}`);
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd)
        return;
    const uid = interaction.user.id;
    const name = cmd.data.name;
    try {
        // 輕量冷卻 + in-flight 鎖，避免重入與洗指令
        (0, guards_1.ensureCooldown)(uid, name);
        await (0, guards_1.withInFlight)(uid, name, async () => {
            await cmd.execute(interaction);
        });
    }
    catch (err) {
        await (0, reply_1.errorReply)(interaction, err);
    }
});
client.login((0, env_1.getEnv)('DISCORD_TOKEN'));
