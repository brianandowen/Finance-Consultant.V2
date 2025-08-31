"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyOnce = replyOnce;
// src/utils/reply.ts
const discord_js_1 = require("discord.js");
async function replyOnce(interaction, content, { ephemeral = false } = {}) {
    const opts = { content, flags: ephemeral ? discord_js_1.MessageFlags.Ephemeral : undefined };
    if (!interaction.deferred && !interaction.replied)
        return interaction.reply(opts);
    if (interaction.deferred && !interaction.replied)
        return interaction.editReply(content);
    return interaction.followUp(opts);
}
