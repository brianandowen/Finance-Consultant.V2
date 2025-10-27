"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryUpdatePanel = tryUpdatePanel;
async function tryUpdatePanel(client, store, userId, makeEmbed, opts) {
    try {
        const panel = await store.getPanelByUser(userId);
        if (!panel)
            return; // 沒有面板就靜默跳過
        const ch = await client.channels.fetch(panel.channelId).catch(() => null);
        if (!ch)
            return;
        const channel = ch;
        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!msg)
            return;
        if (opts?.completed && panel.clearOnFinish) {
            // 完成且設定為清除
            await msg.delete().catch(() => null);
            await store.removePanel(userId).catch(() => null);
            return;
        }
        // 更新為完成樣式或一般刷新
        const embed = await makeEmbed();
        await msg.edit({ embeds: [embed], components: [] }).catch(() => null);
    }
    catch (e) {
        // 面板刷新是「best-effort」，失敗不可阻斷主要流程
        // 這裡僅建議加上一行日誌
        console.warn('[notify] update panel failed:', e.message);
    }
}
