// src/index.ts
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Collection,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import { query } from "./db";

// 指令都用 default export { data, execute }
import ping from "./commands/ping";
import goal from "./commands/goal";
import txn from "./commands/txn";
import balance from "./commands/balance";
import summary from "./commands/summary";
import history from "./commands/history";
import notify from "./commands/notify";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = new Collection<string, any>();
[ping, goal, txn, balance, summary, history, notify].forEach((c) => {
  if (c?.data?.name && typeof c.execute === "function") {
    commands.set(c.data.name, c);
  }
});
(client as any).commands = commands;

client.once("ready", async () => {
  await query("SELECT 1");
  console.log("DB connected ✅");
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

const inFlight = new Set<string>();

client.removeAllListeners("interactionCreate");
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (inFlight.has(interaction.id)) return;
  inFlight.add(interaction.id);

  const cmd = (client as any).commands?.get?.(interaction.commandName);
  if (!cmd) {
    try {
      await interaction.reply({
        content: "❌ 找不到這個指令。",
        flags: MessageFlags.Ephemeral,
      });
    } catch {}
    inFlight.delete(interaction.id);
    return;
  }

  try {
    await cmd.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    console.error(err);
    const msg = { content: "❌ 指令執行失敗，請稍後重試。", flags: MessageFlags.Ephemeral as any };
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply(msg);
      } else {
        await interaction.followUp(msg);
      }
    } catch {}
  } finally {
    inFlight.delete(interaction.id);
  }
});

client.on("error", console.error);
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));

const TOKEN = process.env.DISCORD_TOKEN!;
client.login(TOKEN);
