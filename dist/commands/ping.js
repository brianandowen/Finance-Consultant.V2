"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/ping.ts
const discord_js_1 = require("discord.js");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder().setName("ping").setDescription("健康檢查"),
    async execute(interaction) {
        await interaction.reply({ content: "pong 🏓", flags: discord_js_1.MessageFlags.Ephemeral });
    },
};
