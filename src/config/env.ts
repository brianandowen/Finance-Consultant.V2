// src/config/env.ts
// 啟動期環境變數檢查（fail fast）
import 'dotenv/config';


type RequiredEnvKeys =
| 'DISCORD_TOKEN'
| 'DISCORD_CLIENT_ID'
| 'DATABASE_URL';


const REQUIRED_KEYS: RequiredEnvKeys[] = [
'DISCORD_TOKEN',
'DISCORD_CLIENT_ID',
'DATABASE_URL',
];


export function validateEnv() {
const missing: string[] = [];
for (const k of REQUIRED_KEYS) {
if (!process.env[k] || !String(process.env[k]).trim()) missing.push(k);
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


export function getEnv(key: string, fallback?: string): string {
const v = process.env[key];
if (v == null || v === '') {
if (fallback !== undefined) return fallback;
throw new Error(`ENV ${key} is required`);
}
return v;
}