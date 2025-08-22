import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
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

client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

// 保險回覆：依互動狀態選擇 reply / editReply / followUp，避免 10062
async function safeReply(interaction: any, payload: any) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied)  return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (e) {
    console.error("safeReply error:", e);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await safeReply(interaction, { content: "找不到這個指令 🤔", ephemeral: true });
    return;
  }

  // 2 秒保底：若 2 秒內 command 還沒回，就自動 defer，避免 3 秒逾時
  const deferTimer = setTimeout(async () => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch (e) {
      // 這裡安靜吞掉，避免計時器晚到造成多次回覆錯誤
    }
  }, 2000);

  try {
    await command.execute(interaction); // 讓各指令照原本邏輯做（可能自己 reply / editReply）

    clearTimeout(deferTimer);

    // 若指令執行完仍未回覆，補一個完成訊息，保證有回應
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "✅ 完成", ephemeral: true });
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply("✅ 完成");
    }
  } catch (e) {
    clearTimeout(deferTimer);
    console.error(e);
    await safeReply(interaction, { content: "⚠️ 指令執行錯誤", ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
