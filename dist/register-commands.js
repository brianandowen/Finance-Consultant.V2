"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/register-commands.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const fs_1 = require("fs");
const path_1 = require("path");
const env_1 = require("./config/env");
(0, env_1.validateEnv)();
function loadSlashBodies() {
    const dir = (0, path_1.join)(__dirname, 'commands');
    const files = (0, fs_1.readdirSync)(dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    const bodies = [];
    for (const file of files) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require((0, path_1.join)(dir, file));
        const def = mod.default ?? mod;
        if (def?.data instanceof discord_js_1.SlashCommandBuilder) {
            bodies.push(def.data.toJSON());
        }
        else if (def?.data?.name && def?.data?.toJSON) {
            bodies.push(def.data.toJSON());
        }
    }
    return bodies;
}
async function main() {
    const TOKEN = (0, env_1.getEnv)('DISCORD_TOKEN');
    const CLIENT_ID = (0, env_1.getEnv)('DISCORD_CLIENT_ID');
    const GUILD_ID = process.env.GUILD_ID; // 可選
    const rest = new discord_js_1.REST({ version: '10' }).setToken(TOKEN);
    const bodies = loadSlashBodies();
    if (GUILD_ID) {
        const res = await rest.put(discord_js_1.Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: bodies });
        console.log(`Registered ${Array.isArray(res) ? res.length : bodies.length} guild commands to ${GUILD_ID}`);
    }
    else {
        const res = await rest.put(discord_js_1.Routes.applicationCommands(CLIENT_ID), { body: bodies });
        console.log(`Registered ${Array.isArray(res) ? res.length : bodies.length} global commands`);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
