"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
exports.getEnv = getEnv;
// src/config/env.ts
// 啟動期環境變數檢查（fail fast）
require("dotenv/config");
const REQUIRED_KEYS = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DATABASE_URL',
];
function validateEnv() {
    const missing = [];
    for (const k of REQUIRED_KEYS) {
        if (!process.env[k] || !String(process.env[k]).trim())
            missing.push(k);
    }
    if (missing.length) {
        const msg = `Missing required environment variables: ${missing.join(', ')}
` +
            'Create a .env from .env.example (do NOT commit it), or set env on your host.';
        throw new Error(msg);
    }
    // 建議固定時區，以避免日期解析偏差
    if (!process.env.TZ) {
        process.env.TZ = 'Asia/Taipei';
    }
}
function getEnv(key, fallback) {
    const v = process.env[key];
    if (v == null || v === '') {
        if (fallback !== undefined)
            return fallback;
        throw new Error(`ENV ${key} is required`);
    }
    return v;
}
