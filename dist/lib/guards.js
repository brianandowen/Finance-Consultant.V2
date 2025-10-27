"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureCooldown = ensureCooldown;
exports.withInFlight = withInFlight;
exports.assertChannelWritable = assertChannelWritable;
// src/lib/guards.ts
// 節流（冷卻）、in-flight 鎖、頻道權限檢查
const discord_js_1 = require("discord.js");
const cooldownMs = Number(process.env.COOLDOWN_MS ?? 1500);
const lastUsed = new Map(); // key: userId:commandName
const inFlight = new Set(); // key: userId:commandName
function ensureCooldown(userId, command) {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const last = lastUsed.get(key) ?? 0;
    if (now - last < cooldownMs) {
        const remain = Math.ceil((cooldownMs - (now - last)) / 1000);
        throw new Error(`TooManyRequests: 請稍等 ${remain}s 再試`);
    }
    lastUsed.set(key, now);
}
async function withInFlight(userId, command, fn) {
    const key = `${userId}:${command}`;
    if (inFlight.has(key)) {
        throw new Error('Busy: 這個指令正在處理中，請稍候…');
    }
    inFlight.add(key);
    try {
        return await fn();
    }
    finally {
        inFlight.delete(key);
    }
}
function assertChannelWritable(ch) {
    const channel = ch;
    if (!channel)
        throw new Error('ChannelNotFound: 找不到目標頻道');
    const me = channel.guild?.members?.me;
    if (!me)
        throw new Error('BotMemberNotFound: 取用機器人身分失敗');
    const perms = channel.permissionsFor(me);
    if (!perms)
        throw new Error('NoPermissions: 無法取得頻道權限');
    const needed = [
        discord_js_1.PermissionsBitField.Flags.ViewChannel,
        discord_js_1.PermissionsBitField.Flags.SendMessages,
        discord_js_1.PermissionsBitField.Flags.EmbedLinks,
    ];
    for (const p of needed) {
        if (!perms.has(p)) {
            throw new Error('NoPermissions: 機器人在此頻道沒有發言/嵌入權限');
        }
    }
}
