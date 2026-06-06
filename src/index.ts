import { Bot } from "grammy";
import { registerAdminHandlers } from "./adminHandlers.js";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { registerUserHandlers } from "./userHandlers.js";
import type { BotContext } from "./types.js";

const config = loadConfig();
const db = new AppDatabase(config.databasePath);
const bot = new Bot<BotContext>(config.botToken);

registerAdminHandlers(bot, db, config);
registerUserHandlers(bot, db);

bot.catch((error) => {
  console.error("Bot error:", error);
});

process.once("SIGINT", () => {
  void bot.stop();
});

process.once("SIGTERM", () => {
  void bot.stop();
});

console.log("Bot is starting in long polling mode...");
void bot.start();
