import type { Bot } from "grammy";
import type { BotContext, Channel, FailedChannelCheck, SubscriptionCheckResult, SubscriptionFailureReason } from "./types.js";

const ACTIVE_MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

export async function checkSubscriptions(
  bot: Bot<BotContext>,
  userId: number,
  channels: Channel[],
): Promise<SubscriptionCheckResult> {
  const missingChannels: Channel[] = [];
  const failedChannels: FailedChannelCheck[] = [];

  for (const channel of channels) {
    try {
      const member = await getChatMemberWithFallback(bot, channel, userId);

      if (!ACTIVE_MEMBER_STATUSES.has(member.status)) {
        missingChannels.push(channel);
      }
    } catch (error) {
      const failedCheck = buildFailedChannelCheck(channel, error);
      failedChannels.push(failedCheck);
      console.error(
        `Failed to check subscription for "${channel.title}" (${channel.chatId}): ${failedCheck.message}`,
      );
    }
  }

  return { missingChannels, failedChannels };
}

async function getChatMemberWithFallback(bot: Bot<BotContext>, channel: Channel, userId: number) {
  try {
    return await bot.api.getChatMember(channel.chatId, userId);
  } catch (error) {
    const fallbackChatId = getPublicChatIdFromInviteLink(channel.inviteLink);

    if (!fallbackChatId || fallbackChatId === channel.chatId || !isChatNotFoundError(error)) {
      throw error;
    }

    return bot.api.getChatMember(fallbackChatId, userId);
  }
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

function isChatNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("chat not found");
}

function getErrorDescription(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildFailedChannelCheck(channel: Channel, error: unknown): FailedChannelCheck {
  const message = getErrorDescription(error);

  return {
    channel,
    reason: getFailureReason(message),
    message,
  };
}

function getFailureReason(message: string): SubscriptionFailureReason {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("member list is inaccessible")) {
    return "member_list_inaccessible";
  }

  if (normalizedMessage.includes("chat not found")) {
    return "chat_not_found";
  }

  return "unknown";
}
