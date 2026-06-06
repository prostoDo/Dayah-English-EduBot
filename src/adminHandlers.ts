import { InlineKeyboard, type Bot } from "grammy";
import type { AppConfig, AdminFlow, BotContext, Channel } from "./types.js";
import type { AppDatabase } from "./database.js";

const adminFlows = new Map<number, AdminFlow>();

export function registerAdminHandlers(bot: Bot<BotContext>, db: AppDatabase, config: AppConfig): void {
  bot.command("admin", async (ctx) => {
    if (!(await guardAdmin(ctx, config))) {
      return;
    }

    await ctx.reply("Админ-панель", { reply_markup: adminKeyboard() });
  });

  bot.command("welcome_image", async (ctx) => {
    if (!(await guardAdmin(ctx, config))) {
      return;
    }

    const userId = ctx.from?.id;

    if (!userId) {
      return;
    }

    await startWelcomeImageFlow(ctx, userId);
  });

  bot.command("remove_welcome_image", async (ctx) => {
    if (!(await guardAdmin(ctx, config))) {
      return;
    }

    const userId = ctx.from?.id;

    if (!userId) {
      return;
    }

    adminFlows.delete(userId);
    const deleted = db.deleteWelcomeImage();
    await ctx.reply(deleted ? "Изображение приветствия удалено." : "Изображение приветствия не было установлено.", {
      reply_markup: adminKeyboard(),
    });
  });

  bot.callbackQuery(/^admin:/, async (ctx) => {
    if (!(await guardAdmin(ctx, config))) {
      return;
    }

    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;

    if (data === "admin:add_channel") {
      adminFlows.set(ctx.from.id, { type: "add_channel" });
      await ctx.reply(
        [
          "Отправьте канал двумя строками:",
          "",
          "1. название для пользователя",
          "2. ссылка для подписки",
          "",
          "Пример:",
          "Мой канал",
          "https://t.me/my_channel",
        ].join("\n"),
        { reply_markup: cancelKeyboard() },
      );
      return;
    }

    if (data === "admin:set_link") {
      adminFlows.set(ctx.from.id, { type: "set_file_link" });
      await ctx.reply("Отправьте новую ссылку на Google/Yandex Disk одним сообщением.", {
        reply_markup: cancelKeyboard(),
      });
      return;
    }

    if (data === "admin:set_welcome_image") {
      await startWelcomeImageFlow(ctx, ctx.from.id);
      return;
    }

    if (data === "admin:remove_welcome_image") {
      adminFlows.delete(ctx.from.id);
      const deleted = db.deleteWelcomeImage();
      await ctx.reply(deleted ? "Изображение приветствия удалено." : "Изображение приветствия не было установлено.", {
        reply_markup: adminKeyboard(),
      });
      return;
    }

    if (data === "admin:list_channels") {
      await ctx.reply(formatChannels(db.getChannels()), { link_preview_options: { is_disabled: true } });
      return;
    }

    if (data === "admin:current_link") {
      const fileLink = db.getFileLink();
      await ctx.reply(fileLink ? `Текущая ссылка:\n${fileLink}` : "Ссылка пока не задана.");
      return;
    }

    if (data === "admin:delete_menu") {
      await ctx.reply("Выберите канал для удаления:", { reply_markup: deleteChannelKeyboard(db.getChannels()) });
      return;
    }

    if (data === "admin:cancel") {
      adminFlows.delete(ctx.from.id);
      await ctx.reply("Действие отменено.", { reply_markup: adminKeyboard() });
      return;
    }

    if (data.startsWith("admin:delete_channel:")) {
      const channelId = Number(data.replace("admin:delete_channel:", ""));

      if (!Number.isInteger(channelId)) {
        await ctx.reply("Некорректный id канала.");
        return;
      }

      const deleted = db.deleteChannel(channelId);
      await ctx.reply(deleted ? "Канал удален." : "Канал не найден.", { reply_markup: adminKeyboard() });
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (!config.adminIds.has(ctx.from.id)) {
      await next();
      return;
    }

    const flow = adminFlows.get(ctx.from.id);

    if (!flow) {
      await next();
      return;
    }

    if (flow.type === "add_channel") {
      await handleAddChannel(ctx, db);
      return;
    }

    if (flow.type === "set_file_link") {
      await handleSetFileLink(ctx, db);
      return;
    }

    if (flow.type === "set_welcome_image") {
      await ctx.reply("Отправьте изображение в формате PNG или JPG, а не текст.", {
        reply_markup: cancelKeyboard(),
      });
    }
  });

  bot.on("message:photo", async (ctx, next) => {
    if (!config.adminIds.has(ctx.from.id) || adminFlows.get(ctx.from.id)?.type !== "set_welcome_image") {
      await next();
      return;
    }

    const photo = ctx.message.photo.at(-1);

    if (!photo) {
      await ctx.reply("Не удалось получить изображение. Попробуйте отправить его еще раз.");
      return;
    }

    await saveWelcomeImage(ctx, db, photo.file_id);
  });

  bot.on("message:document", async (ctx, next) => {
    if (!config.adminIds.has(ctx.from.id) || adminFlows.get(ctx.from.id)?.type !== "set_welcome_image") {
      await next();
      return;
    }

    const document = ctx.message.document;
    const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);

    if (!document.mime_type || !allowedMimeTypes.has(document.mime_type)) {
      await ctx.reply("Поддерживаются только PNG и JPG/JPEG.", {
        reply_markup: cancelKeyboard(),
      });
      return;
    }

    await saveWelcomeImage(ctx, db, document.file_id);
  });
}

async function startWelcomeImageFlow(ctx: BotContext, userId: number): Promise<void> {
  adminFlows.set(userId, { type: "set_welcome_image" });
  await ctx.reply("Отправьте PNG или JPG/JPEG для приветственного сообщения.", {
    reply_markup: cancelKeyboard(),
  });
}

async function saveWelcomeImage(ctx: BotContext, db: AppDatabase, fileId: string): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  db.setWelcomeImageFileId(fileId);
  adminFlows.delete(userId);
  await ctx.reply("Изображение приветствия сохранено.", {
    reply_markup: adminKeyboard(),
  });
}

async function guardAdmin(ctx: BotContext, config: AppConfig): Promise<boolean> {
  const userId = ctx.from?.id;

  if (!userId || !config.adminIds.has(userId)) {
    await ctx.reply("Недостаточно прав.");
    return false;
  }

  return true;
}

async function handleAddChannel(ctx: BotContext, db: AppDatabase): Promise<void> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text ?? "";
  const lines = text
    .split("\n")
    .map((line) => stripLeadingListMarker(line.trim()))
    .filter(Boolean);
  const [title, inviteLink] = lines;

  if (!userId) {
    return;
  }

  if (lines.length !== 2 || !title || !inviteLink) {
    await ctx.reply("Нужно отправить ровно две непустые строки: название и ссылка.");
    return;
  }

  if (!isValidUrl(inviteLink)) {
    await ctx.reply("Ссылка для подписки должна начинаться с http:// или https://.");
    return;
  }

  const chatId = getPublicChatIdFromInviteLink(inviteLink);

  if (!chatId) {
    await ctx.reply("Ссылка должна быть публичной ссылкой на канал в формате https://t.me/channel_username.");
    return;
  }

  try {
    const channel = db.addChannel(chatId, title, inviteLink);
    adminFlows.delete(userId);
    await ctx.reply(`Канал добавлен:\n${formatChannelDetails(channel)}`, {
      reply_markup: adminKeyboard(),
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error("Failed to add channel:", error);
    await ctx.reply("Не удалось добавить канал. Возможно, такая ссылка уже есть в списке.");
  }
}

async function handleSetFileLink(ctx: BotContext, db: AppDatabase): Promise<void> {
  const userId = ctx.from?.id;
  const link = ctx.message?.text?.trim();

  if (!userId || !link) {
    return;
  }

  if (!isValidUrl(link)) {
    await ctx.reply("Ссылка должна начинаться с http:// или https://.");
    return;
  }

  db.setFileLink(link);
  adminFlows.delete(userId);
  await ctx.reply(`Ссылка обновлена:\n${link}`, {
    reply_markup: adminKeyboard(),
    link_preview_options: { is_disabled: true },
  });
}

function adminKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Добавить канал", "admin:add_channel")
    .row()
    .text("Удалить канал", "admin:delete_menu")
    .row()
    .text("Список каналов", "admin:list_channels")
    .row()
    .text("Изменить ссылку", "admin:set_link")
    .row()
    .text("Текущая ссылка", "admin:current_link")
    .row()
    .text("Добавить/изменить картинку", "admin:set_welcome_image")
    .row()
    .text("Удалить картинку", "admin:remove_welcome_image");
}

function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Отмена", "admin:cancel");
}

function deleteChannelKeyboard(channels: Channel[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (channels.length === 0) {
    return keyboard.text("Каналов пока нет", "admin:list_channels");
  }

  for (const channel of channels) {
    keyboard.text(channel.title, `admin:delete_channel:${channel.id}`).row();
  }

  keyboard.text("Отмена", "admin:cancel");
  return keyboard;
}

function formatChannels(channels: Channel[]): string {
  if (channels.length === 0) {
    return "Каналы пока не добавлены.";
  }

  return ["Текущие каналы:", ...channels.map(formatChannel)].join("\n\n");
}

function formatChannel(channel: Channel, index: number): string {
  return [`${index + 1}. ${channel.title}`, `Link: ${channel.inviteLink}`].join("\n");
}

function formatChannelDetails(channel: Channel): string {
  return [channel.title, `Link: ${channel.inviteLink}`].join("\n");
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function stripLeadingListMarker(value: string): string {
  return value.replace(/^\d+[.)]\s*/, "").trim();
}

function getPublicChatIdFromInviteLink(inviteLink: string): string | null {
  try {
    const url = new URL(inviteLink);
    const hostname = url.hostname.toLowerCase();

    if (hostname !== "t.me" && hostname !== "telegram.me") {
      return null;
    }

    const username = url.pathname.replace(/^\/+/, "").split("/")[0];

    if (!username || username.startsWith("+") || username.toLowerCase() === "joinchat") {
      return null;
    }

    return `@${username}`;
  } catch {
    return null;
  }
}
