import type { Context } from "grammy";

export type BotContext = Context;

export interface AppConfig {
  botToken: string;
  adminIds: Set<number>;
  databasePath: string;
}

export interface Channel {
  id: number;
  chatId: string;
  title: string;
  inviteLink: string;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}

export type AdminFlow =
  | { type: "add_channel" }
  | { type: "set_file_link" }
  | { type: "set_welcome_image" };

export type SubscriptionFailureReason =
  | "member_list_inaccessible"
  | "chat_not_found"
  | "unknown";

export interface FailedChannelCheck {
  channel: Channel;
  reason: SubscriptionFailureReason;
  message: string;
}

export interface SubscriptionCheckResult {
  missingChannels: Channel[];
  failedChannels: FailedChannelCheck[];
}
