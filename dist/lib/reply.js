"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeReply = safeReply;
exports.errorReply = errorReply;
function toReplyOptions(content, ephemeralDefault = true) {
    if (typeof content === 'string') {
        return { content, ephemeral: ephemeralDefault };
    }
    return { ...content, ephemeral: content.ephemeral ?? ephemeralDefault };
}
function toEditOptions(content) {
    if (typeof content === 'string')
        return content;
    const { ephemeral: _dropEph, flags: _dropFlags, ...rest } = content;
    return rest;
}
async function safeReply(itx, content, opts) {
    const ephe = opts?.ephemeral ?? true;
    if (itx.deferred || itx.replied) {
        const editOptions = toEditOptions(content);
        return itx.editReply(editOptions);
    }
    const replyOptions = toReplyOptions(content, ephe);
    return itx.reply(replyOptions);
}
async function errorReply(itx, err) {
    const traceId = new Date().toISOString();
    const msg = err?.message ?? String(err);
    const friendly = msg.startsWith('TooManyRequests')
        ? msg.replace('TooManyRequests: ', '')
        : msg.startsWith('Busy')
            ? msg.replace('Busy: ', '')
            : msg.startsWith('NoPermissions')
                ? '目標頻道權限不足，已取消。'
                : msg.startsWith('ChannelNotFound')
                    ? '找不到目標頻道，請重新選擇。'
                    : '發生錯誤，請稍後再試';
    // 🔎 把完整錯誤與 TraceId 打到後台，方便對應
    try {
        console.error(`[errorReply][${traceId}]`, err);
    }
    catch { }
    const body = `❗ ${friendly}\n\n(TraceId: ${traceId})`;
    try {
        if (itx.deferred || itx.replied) {
            await itx.editReply({ content: body });
        }
        else {
            await itx.reply({ content: body, ephemeral: true });
        }
    }
    catch {
        // 忽略二次錯誤
    }
}
