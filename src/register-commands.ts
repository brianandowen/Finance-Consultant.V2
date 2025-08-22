import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { pingCommand } from "./commands/ping";
import { goalCommand } from "./commands/goal";
import { txnCommand } from "./commands/txn";
import { balanceCommand } from "./commands/balance";
import { summaryCommand } from "./commands/summary";
import { historyCommand } from "./commands/history";
import { notifyCommand } from "./commands/notify";

dotenv.config();

const commands = [
  pingCommand.data.toJSON(),
  goalCommand.data.toJSON(),
  txnCommand.data.toJSON(),
  balanceCommand.data.toJSON(),
  summaryCommand.data.toJSON(),
  historyCommand.data.toJSON(),
  notifyCommand.data.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

async function main() {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
    { body: commands }
  );
  console.log("✅ 指令已註冊");
}
main();
