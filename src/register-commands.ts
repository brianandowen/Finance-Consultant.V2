// src/register-commands.ts
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { validateEnv, getEnv } from './config/env';


validateEnv();


function loadSlashBodies(): any[] {
const dir = join(__dirname, 'commands');
const files = readdirSync(dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
const bodies: any[] = [];
for (const file of files) {
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(join(dir, file));
const def = mod.default ?? mod;
if (def?.data instanceof SlashCommandBuilder) {
bodies.push(def.data.toJSON());
} else if (def?.data?.name && def?.data?.toJSON) {
bodies.push(def.data.toJSON());
}
}
return bodies;
}


async function main() {
const TOKEN = getEnv('DISCORD_TOKEN');
const CLIENT_ID = getEnv('DISCORD_CLIENT_ID');
const GUILD_ID = process.env.GUILD_ID; // 可選


const rest = new REST({ version: '10' }).setToken(TOKEN);
const bodies = loadSlashBodies();


if (GUILD_ID) {
const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: bodies });
console.log(`Registered ${Array.isArray(res) ? res.length : bodies.length} guild commands to ${GUILD_ID}`);
} else {
const res = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: bodies });
console.log(`Registered ${Array.isArray(res) ? res.length : bodies.length} global commands`);
}
}


main().catch((e) => {
console.error(e);
process.exit(1);
});