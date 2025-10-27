import 'dotenv/config';
import { REST, Routes } from 'discord.js';

async function main() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log('✅ Cleared ALL global commands');
}
main().catch(e => { console.error(e); process.exit(1); });
