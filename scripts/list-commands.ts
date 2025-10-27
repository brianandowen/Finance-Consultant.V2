// scripts/list-commands.ts
import 'dotenv/config';
import { REST, Routes, APIApplicationCommand } from 'discord.js';

async function main() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const guildId = process.env.GUILD_ID;
  const rest = new REST({ version: '10' }).setToken(token);

  const global = (await rest.get(Routes.applicationCommands(clientId))) as APIApplicationCommand[];
  console.log('🌐 Global commands:', global.length);
  global.forEach(c => console.log('  -', c.name));

  if (guildId) {
    const guild = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as APIApplicationCommand[];
    console.log(`🛡️ Guild(${guildId}) commands:`, guild.length);
    guild.forEach(c => console.log('  -', c.name));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
