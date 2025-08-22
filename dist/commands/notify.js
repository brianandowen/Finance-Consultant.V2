"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyCommand = void 0;
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
exports.notifyCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("notify")
        .setDescription("設定里程碑通知偏好（單人版）")
        .addStringOption(opt => opt.setName("mode")
        .setDescription("通知方式")
        .setRequired(true)
        .addChoices({ name: "私訊", value: "dm" }, { name: "頻道", value: "channel" }))
        .addChannelOption(opt => opt.setName("channel")
        .setDescription("選擇通知頻道（mode=channel 時必填）")
        .addChannelTypes(discord_js_1.ChannelType.GuildText))
        .addIntegerOption(opt => opt.setName("step")
        .setDescription("每跨幾％提醒一次（預設 10）")
        .setMinValue(1).setMaxValue(50)),
    async execute(interaction) {
        const userId = interaction.user.id;
        const mode = interaction.options.getString("mode", true);
        const channel = interaction.options.getChannel("channel");
        const step = interaction.options.getInteger("step") ?? 10;
        if (mode === "channel" && !channel) {
            return interaction.reply({ content: "❌ 請指定通知頻道。", ephemeral: true });
        }
        const payload = {
            user_id: userId,
            notify_mode: mode,
            milestone_step_percent: step,
            updated_at: new Date().toISOString(),
        };
        if (mode === "channel") {
            payload.notify_channel_id = channel.id;
        }
        else {
            payload.notify_channel_id = null;
        }
        // upsert settings（以 user_id 為 PK）
        const { error } = await db_1.supabase
            .from("settings")
            .upsert(payload, { onConflict: "user_id" });
        if (error) {
            console.error(error);
            return interaction.reply({ content: "❌ 設定失敗：" + error.message, ephemeral: true });
        }
        return interaction.reply({
            content: `✅ 已更新通知設定\n` +
                `方式：${mode === "dm" ? "私訊" : `頻道 <#${payload.notify_channel_id}>`}｜` +
                `里程碑：每 ${step}%`,
            ephemeral: true,
        });
    },
};
