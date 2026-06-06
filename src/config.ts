import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "./types.js";

function parseAdminIds(rawValue: string | undefined): Set<number> {
  if (!rawValue) {
    return new Set();
  }

  const ids = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return new Set(ids);
}

export function loadConfig(): AppConfig {
  const botToken = process.env.BOT_TOKEN?.trim();

  if (!botToken) {
    throw new Error("BOT_TOKEN is required. Copy .env.example to .env and fill it.");
  }

  const databasePath = process.env.DATABASE_PATH?.trim() || "data/bot.sqlite";
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    botToken,
    adminIds: parseAdminIds(process.env.ADMIN_IDS),
    databasePath,
  };
}
