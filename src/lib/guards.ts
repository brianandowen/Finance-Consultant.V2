// src/lib/guards.ts
// 節流（冷卻）、in-flight 鎖、頻道權限檢查
import { PermissionsBitField, type GuildTextBasedChannel } from 'discord.js';


const cooldownMs = Number(process.env.COOLDOWN_MS ?? 1500);


const lastUsed = new Map<string, number>(); // key: userId:commandName
const inFlight = new Set<string>(); // key: userId:commandName


export function ensureCooldown(userId: string, command: string) {
const key = `${userId}:${command}`;
const now = Date.now();
const last = lastUsed.get(key) ?? 0;
if (now - last < cooldownMs) {
const remain = Math.ceil((cooldownMs - (now - last)) / 1000);
throw new Error(`TooManyRequests: 請稍等 ${remain}s 再試`);
}
lastUsed.set(key, now);
}


export async function withInFlight<T>(userId: string, command: string, fn: () => Promise<T>): Promise<T> {
const key = `${userId}:${command}`;
if (inFlight.has(key)) {
throw new Error('Busy: 這個指令正在處理中，請稍候…');
}
inFlight.add(key);
try {
return await fn();
} finally {
inFlight.delete(key);
}
}


export function assertChannelWritable(ch: unknown) {
const channel = ch as GuildTextBasedChannel;
if (!channel) throw new Error('ChannelNotFound: 找不到目標頻道');
const me = channel.guild?.members?.me;
if (!me) throw new Error('BotMemberNotFound: 取用機器人身分失敗');
const perms = channel.permissionsFor(me);
if (!perms) throw new Error('NoPermissions: 無法取得頻道權限');
const needed = [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages,
PermissionsBitField.Flags.EmbedLinks,
];
for (const p of needed) {
if (!perms.has(p)) {
throw new Error('NoPermissions: 機器人在此頻道沒有發言/嵌入權限');
}
}
}