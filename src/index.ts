// src/index.ts
import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, type ChatInputCommandInteraction } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { validateEnv, getEnv } from './config/env';
import { ensureCooldown, withInFlight } from './lib/guards';
import { errorReply } from './lib/reply';


validateEnv();


export interface BotCommand {
data: { name: string } & Record<string, any>;
execute: (interaction: ChatInputCommandInteraction) => Promise<any>;
}


const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = new Collection<string, BotCommand>();


function loadCommands() {
const dir = join(__dirname, 'commands');
const files = readdirSync(dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
for (const file of files) {
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(join(dir, file));
const cmd: BotCommand = mod.default ?? mod;
if (cmd?.data?.name && typeof cmd.execute === 'function') {
commands.set(cmd.data.name, cmd);
}
}
console.log(`[commands] loaded: ${commands.size}`);
}


loadCommands();


client.once(Events.ClientReady, c => {
console.log(`Ready as ${c.user.tag}`);
});


client.on(Events.InteractionCreate, async (interaction) => {
if (!interaction.isChatInputCommand()) return;
const cmd = commands.get(interaction.commandName);
if (!cmd) return;


const uid = interaction.user.id;
const name = cmd.data.name;


try {
// 輕量冷卻 + in-flight 鎖，避免重入與洗指令
ensureCooldown(uid, name);
await withInFlight(uid, name, async () => {
await cmd.execute(interaction);
});
} catch (err) {
await errorReply(interaction, err);
}
});


client.login(getEnv('DISCORD_TOKEN'));