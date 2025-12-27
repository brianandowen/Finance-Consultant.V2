// src/index.ts
import "dotenv/config";
import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Interaction,
} from "discord.js";
import * as Interactive from "./features/interactive";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
}) as Client & { commands?: Collection<string, any> };

client.commands = new Collection<string, any>();

function safeLoadCommand(path: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path);
    const cmd = mod.default || mod;
    if (cmd?.data?.name && typeof cmd.execute === "function") {
      client.commands!.set(cmd.data.name, cmd);
      console.log(`[cmd] loaded: ${cmd.data.name}`);
    }
  } catch {}
}

safeLoadCommand("./commands/ai");
safeLoadCommand("./commands/goal");
safeLoadCommand("./commands/txn");
safeLoadCommand("./commands/ask");
safeLoadCommand("./commands/notify.ts");

client.once("ready", async () => {
  console.log(`[ready] Logged in as ${client.user?.tag}`);
  // 兼容不同匯出型態（named / default）
  const reg =
    (Interactive as any).registerInteractiveQnA ||
    (Interactive as any).default?.registerInteractiveQnA;
  if (typeof reg === "function") {
    reg(client);
  } else {
    console.error("❌ registerInteractiveQnA 沒有正確匯出，請檢查 src/features/interactive.ts");
  }
});

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands?.get(interaction.commandName);
    if (!cmd) {
      await interaction.reply({ content: "指令未找到或已移除。", ephemeral: true });
      return;
    }
    await cmd.execute(interaction);
  } catch (err) {
    console.error("[interaction] error:", err);
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("❗ 發生錯誤，請稍後再試");
        } else {
          await interaction.reply({ content: "❗ 發生錯誤，請稍後再試", ephemeral: true });
        }
      } catch {}
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ 缺少 DISCORD_TOKEN 環境變數");
  process.exit(1);
}
client.login(token);
