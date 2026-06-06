import { InlineKeyboard, type Bot } from "grammy";
import type { AppDatabase } from "./database.js";
import { checkSubscriptions } from "./subscriptions.js";
import type { BotContext, Channel } from "./types.js";

const CHECK_SUBSCRIPTIONS_CALLBACK = "user:check_subscriptions";
const START_BUTTON = "Старт";

export function registerUserHandlers(bot: Bot<BotContext>, db: AppDatabase): void {
  bot.command("start", async (ctx) => {
    await showWelcomeAndChannels(ctx, db);
  });

  bot.hears(START_BUTTON, async (ctx) => {
    await removeStartKeyboard(ctx);
    await showWelcomeAndChannels(ctx, db);
  });

  bot.callbackQuery(CHECK_SUBSCRIPTIONS_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSubscriptionGate(ctx, bot, db);
  });
}

async function showWelcomeAndChannels(
  ctx: BotContext,
  db: AppDatabase,
): Promise<void> {
  const welcomeImageFileId = db.getWelcomeImageFileId();

  if (welcomeImageFileId) {
    try {
      await ctx.replyWithPhoto(welcomeImageFileId, {
        caption: buildWelcomeText(),
        reply_markup: { remove_keyboard: true },
      });
    } catch (error) {
      console.error(`Failed to send welcome image: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.reply(buildWelcomeText(), {
        reply_markup: { remove_keyboard: true },
      });
    }
  } else {
    await ctx.reply(buildWelcomeText(), {
      reply_markup: { remove_keyboard: true },
    });
  }

  await showStartSubscriptionList(ctx, db);
}

async function showStartSubscriptionList(ctx: BotContext, db: AppDatabase): Promise<void> {
  const channels = db.getChannels();

  if (channels.length === 0) {
    await ctx.reply("Список каналов пока не настроен. Пожалуйста, попробуйте позже.");
    return;
  }

  await ctx.reply(buildChannelsText(channels, true), {
    reply_markup: buildSubscriptionKeyboard(),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

async function handleSubscriptionGate(ctx: BotContext, bot: Bot<BotContext>, db: AppDatabase): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply("Не удалось определить пользователя. Попробуйте написать /start еще раз.");
    return;
  }

  const channels = db.getChannels();

  if (channels.length === 0) {
    await ctx.reply("Список каналов пока не настроен. Пожалуйста, попробуйте позже.");
    return;
  }

  const result = await checkSubscriptions(bot, userId, channels);
  const unavailableChannels = new Set(result.failedChannels.map((failedCheck) => failedCheck.channel.id));
  const missingChannels = result.missingChannels.filter((channel) => !unavailableChannels.has(channel.id));

  if (result.failedChannels.length > 0) {
    await ctx.reply(buildFailedChannelsText(result.failedChannels));
    return;
  }

  if (missingChannels.length === 0) {
    const fileLink = db.getFileLink();

    if (!fileLink) {
      await ctx.reply("Вы подписаны на все каналы, но ссылка на файлы пока не настроена. Пожалуйста, попробуйте позже.");
      return;
    }

    db.markUserVerified(userId);
    await ctx.reply(
      [
        "Готово!",
        "Все материалы находятся по ссылке ниже",
        "",
        fileLink,
        "",
        "Спасибо, что поддержали авторов этой рассылки. Надеемся, материалы окажутся полезными уже на ближайших занятиях ✨",
      ].join("\n"),
    );
    return;
  }

  await ctx.reply(buildChannelsText(missingChannels, false), {
    reply_markup: buildSubscriptionKeyboard(),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

function buildChannelsText(channels: Channel[], isStart: boolean): string {
  const lines = channels.map((channel) => `<a href="${escapeHtml(channel.inviteLink)}">${escapeHtml(channel.title)}</a>`);

  const title = isStart
    ? "Чтобы получить доступ к общей папке с материалами, подпишитесь на каналы участников рассылки:"
    : "Почти готово!\nОсталось подписаться на несколько каналов:";
  const footer = isStart
    ? "После подписки нажмите кнопку ниже 👇"
    : "После этого снова нажмите кнопку 👇";

  return [title, "", ...lines, "", footer].join("\n");
}

function buildFailedChannelsText(failedChannels: Awaited<ReturnType<typeof checkSubscriptions>>["failedChannels"]): string {
  const lines = failedChannels.map((failedCheck) => {
    if (failedCheck.reason === "member_list_inaccessible") {
      return `${failedCheck.channel.title}: бот не может проверить участников. Добавьте бота администратором этого канала.`;
    }

    if (failedCheck.reason === "chat_not_found") {
      return `${failedCheck.channel.title}: канал не найден для бота. Проверьте ссылку или добавьте бота в канал.`;
    }

    return `${failedCheck.channel.title}: не удалось проверить подписку.`;
  });

  return ["Не получилось проверить часть каналов:", "", ...lines, "", "После исправления настроек нажмите кнопку еще раз."].join(
    "\n",
  );
}

function buildSubscriptionKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Я подписался(-ась)", CHECK_SUBSCRIPTIONS_CALLBACK);
}

async function removeStartKeyboard(ctx: BotContext): Promise<void> {
  const message = await ctx.reply("Загружаю каналы...", {
    reply_markup: {
      remove_keyboard: true,
      selective: false,
    },
  });

  try {
    await ctx.api.deleteMessage(message.chat.id, message.message_id);
  } catch (error) {
    console.error(`Failed to delete keyboard cleanup message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildWelcomeText(): string {
  return [
    "Добро пожаловать!",
    "",
    "Спасибо, что заглянули на нашу рассылку для преподавателей английского языка ❤️",
    "",
    "Внутри вас ждут десятки готовых материалов, которые помогут разнообразить уроки и сэкономить время на подготовке.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
