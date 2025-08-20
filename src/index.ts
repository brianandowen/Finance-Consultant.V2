import 'dotenv/config';
import { Client, GatewayIntentBits, Interaction } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (i: Interaction) => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === 'ping') {
    await i.reply('Pong 🏓');
  }
});

client.login(process.env.DISCORD_TOKEN);
