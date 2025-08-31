// src/commands/ping.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("健康檢查"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: "pong 🏓", flags: MessageFlags.Ephemeral });
  },
};
