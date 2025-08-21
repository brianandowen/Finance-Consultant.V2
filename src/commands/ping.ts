import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("測試 bot 是否存活"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply("🏓 pong!");
  }
};
