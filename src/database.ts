import Database from "better-sqlite3";
import type { Channel } from "./types.js";

const FILE_LINK_KEY = "file_link";
const WELCOME_IMAGE_KEY = "welcome_image_file_id";

export class AppDatabase {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  getChannels(): Channel[] {
    return this.db
      .prepare(
        `SELECT id, chat_id as chatId, title, invite_link as inviteLink, created_at as createdAt
         FROM channels
         ORDER BY id ASC`,
      )
      .all() as Channel[];
  }

  addChannel(chatId: string, title: string, inviteLink: string): Channel {
    const result = this.db
      .prepare("INSERT INTO channels (chat_id, title, invite_link) VALUES (?, ?, ?)")
      .run(chatId, title, inviteLink);

    return this.getChannelById(Number(result.lastInsertRowid));
  }

  deleteChannel(id: number): boolean {
    const result = this.db.prepare("DELETE FROM channels WHERE id = ?").run(id);

    if (result.changes > 0) {
      this.normalizeChannelIds();
    }

    return result.changes > 0;
  }

  getFileLink(): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(FILE_LINK_KEY) as
      | { value: string }
      | undefined;

    return row?.value ?? null;
  }

  setFileLink(link: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(FILE_LINK_KEY, link);
  }

  getWelcomeImageFileId(): string | null {
    return this.getSetting(WELCOME_IMAGE_KEY);
  }

  setWelcomeImageFileId(fileId: string): void {
    this.setSetting(WELCOME_IMAGE_KEY, fileId);
  }

  deleteWelcomeImage(): boolean {
    return this.db.prepare("DELETE FROM settings WHERE key = ?").run(WELCOME_IMAGE_KEY).changes > 0;
  }

  markUserVerified(userId: number): void {
    this.db
      .prepare(
        `INSERT INTO verified_users (user_id, verified_at) VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET verified_at = CURRENT_TIMESTAMP`,
      )
      .run(userId);
  }

  private getChannelById(id: number): Channel {
    const channel = this.db
      .prepare(
        `SELECT id, chat_id as chatId, title, invite_link as inviteLink, created_at as createdAt
         FROM channels
         WHERE id = ?`,
      )
      .get(id) as Channel | undefined;

    if (!channel) {
      throw new Error(`Channel ${id} was not found after insert.`);
    }

    return channel;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        invite_link TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verified_users (
        user_id INTEGER PRIMARY KEY,
        verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;

    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  private normalizeChannelIds(): void {
    const channels = this.getChannels();
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM channels").run();
      this.db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run("channels");

      const insert = this.db.prepare("INSERT INTO channels (title, chat_id, invite_link) VALUES (?, ?, ?)");

      for (const channel of channels) {
        insert.run(channel.title, channel.chatId, channel.inviteLink);
      }
    });

    transaction();
  }
}
