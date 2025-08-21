import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import { pingCommand } from "./commands/ping";
import { goalCommand } from "./commands/goal";
import { txnCommand } from "./commands/txn";
import { balanceCommand } from "./commands/balance";
import { summaryCommand } from "./commands/summary";
import { historyCommand } from "./commands/history";
import { notifyCommand } from "./commands/notify";

dotenv.config();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = new Collection<string, any>([
  [pingCommand.data.name, pingCommand],
  [goalCommand.data.name, goalCommand],
  [txnCommand.data.name, txnCommand],
  [balanceCommand.data.name, balanceCommand],
  [summaryCommand.data.name, summaryCommand],
  [historyCommand.data.name, historyCommand],
  [notifyCommand.data.name, notifyCommand],
]);

client.once("ready", () => console.log(`🤖 Logged in as ${client.user?.tag}`));
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try { await command.execute(interaction); }
  catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) await interaction.followUp("⚠️ 指令執行錯誤");
    else await interaction.reply("⚠️ 指令執行錯誤");
  }
});
client.login(process.env.DISCORD_TOKEN);
