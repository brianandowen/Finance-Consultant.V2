// src/index.ts
// -------------------------------------------------------------
// Discord Bot 入口：載入 Slash Commands + 專用頻道互動
// - 指令：/ai /goal /txn (/ask 若存在)
// - 互動：setupInteractive()（綁定頻道、10秒冷卻、摘要快取）
// -------------------------------------------------------------
import "dotenv/config";
import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Interaction,
} from "discord.js";
import { setupInteractive } from "./features/interactive";

// 準備 Client（包含訊息事件所需 intents）
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,   // 專用頻道互動需要
    GatewayIntentBits.MessageContent,  // 讀取訊息文字
  ],
  partials: [Partials.Channel],
}) as Client & { commands?: Collection<string, any> };

client.commands = new Collection<string, any>();

// ---- 載入指令（安全載入，缺檔不會炸） ----
function safeLoadCommand(path: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path);
    const cmd = mod.default || mod;
    if (cmd?.data?.name && typeof cmd.execute === "function") {
      client.commands!.set(cmd.data.name, cmd);
      console.log(`[cmd] loaded: ${cmd.data.name}`);
    }
  } catch (e) {
    // 檔案可能不存在或已被你刪除，略過即可
  }
}

// 依你的精簡清單載入現存指令
safeLoadCommand("./commands/ai");
safeLoadCommand("./commands/goal");
safeLoadCommand("./commands/txn");
safeLoadCommand("./commands/ask");   // 若你已加入 /ask

// ---- Ready ----
client.once("ready", async () => {
  console.log(`[ready] Logged in as ${client.user?.tag}`);
});

// ---- Slash 指令處理 ----
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
      } catch {
        /* ignore */
      }
    }
  }
});

// ---- 專用頻道互動（你剛完成的 features/interactive.ts）----
setupInteractive(client);

// ---- Login ----
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ 缺少 DISCORD_TOKEN 環境變數");
  process.exit(1);
}
client.login(token);
