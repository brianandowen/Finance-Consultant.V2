"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/notify.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("notify")
        .setDescription("設定里程碑通知")
        .addStringOption((o) => o
        .setName("mode")
        .setDescription("通知方式")
        .setRequired(true)
        .addChoices({ name: "私訊我", value: "dm" }, { name: "在此頻道", value: "channel" }))
        .addIntegerOption((o) => o.setName("step").setDescription("里程碑百分比（例如 10 表示每 10%）").setMinValue(1).setMaxValue(100)),
    async execute(interaction) {
        // ✅ defer 在最前面
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const userId = interaction.user.id;
        await (0, db_1.ensureUser)(userId);
        const mode = interaction.options.getString("mode", true);
        const step = interaction.options.getInteger("step") ?? 10;
        let channelId = null;
        if (mode === "channel") {
            if (interaction.channel?.type === discord_js_1.ChannelType.GuildText) {
                channelId = interaction.channelId;
            }
            else {
                return interaction.editReply("⚠️ 此模式只能在伺服器文字頻道中使用。");
            }
        }
        await (0, db_1.query)(`INSERT INTO settings (user_id, notify_mode, notify_channel_id, milestone_step_percent, last_percent_hit)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (user_id)
       DO UPDATE SET notify_mode = EXCLUDED.notify_mode,
                     notify_channel_id = EXCLUDED.notify_channel_id,
                     milestone_step_percent = EXCLUDED.milestone_step_percent`, [userId, mode, channelId, step]);
        return interaction.editReply(`✅ 已更新通知設定\n方式：${mode === "dm" ? "私訊" : `頻道 <#${channelId}>`}｜里程碑：每 ${step}%`);
    },
};
