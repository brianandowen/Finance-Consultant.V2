"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingCommand = void 0;
const discord_js_1 = require("discord.js");
exports.pingCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("ping")
        .setDescription("測試 bot 是否存活"),
    async execute(interaction) {
        await interaction.reply("🏓 pong!");
    }
};
