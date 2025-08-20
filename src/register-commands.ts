import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('health check'),
].map(c => c.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
    { body: commands }
  );
  console.log('✅ Registered /ping to guild.');
}
main().catch(err => {
  console.error('Register failed:', err);
  process.exit(1);
});
