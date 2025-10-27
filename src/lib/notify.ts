// src/lib/notify.ts
// 面板更新的共用助手：讀取目前面板記錄、更新或刪除
import type { Client, TextBasedChannel, EmbedBuilder, Message } from 'discord.js';


// 你專案應該已有 DB 介面；這裡以函式型別表達，實作時請接到你的 repo 層
export interface NotifyStore {
getPanelByUser(userId: string): Promise<null | {
channelId: string;
messageId: string;
clearOnFinish?: boolean;
}>;
upsertPanel(userId: string, payload: { channelId: string; messageId: string; clearOnFinish?: boolean }): Promise<void>;
removePanel(userId: string): Promise<void>;
}


export async function tryUpdatePanel(
client: Client,
store: NotifyStore,
userId: string,
makeEmbed: () => Promise<EmbedBuilder>,
opts?: { completed?: boolean }
) {
try {
const panel = await store.getPanelByUser(userId);
if (!panel) return; // 沒有面板就靜默跳過


const ch = await client.channels.fetch(panel.channelId).catch(() => null);
if (!ch) return;
const channel = ch as TextBasedChannel;


const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
if (!msg) return;


if (opts?.completed && panel.clearOnFinish) {
// 完成且設定為清除
await (msg as Message).delete().catch(() => null);
await store.removePanel(userId).catch(() => null);
return;
}


// 更新為完成樣式或一般刷新
const embed = await makeEmbed();
await (msg as Message).edit({ embeds: [embed], components: [] }).catch(() => null);
} catch (e) {
// 面板刷新是「best-effort」，失敗不可阻斷主要流程
// 這裡僅建議加上一行日誌
console.warn('[notify] update panel failed:', (e as Error).message);
}
}