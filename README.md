<<<<<<< HEAD
# Dayah-English-EduBot
=======
# Diancho Subscription Bot

Telegram bot on grammY + TypeScript. It checks whether a user is subscribed to required channels and sends a Google/Yandex Disk link only after all subscriptions are confirmed.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Fill `.env`:

- `BOT_TOKEN` - token from BotFather.
- `ADMIN_IDS` - comma-separated Telegram user IDs that can open `/admin`.
- `DATABASE_PATH` - SQLite database path.

4. Run in development:

```bash
npm run dev
```

5. Build and run production:

```bash
npm run build
npm start
```

## Important Telegram Requirement

The bot must be added to every required channel so it can call `getChatMember`. Channel management in `/admin` expects public `https://t.me/channel_username` links.

## Admin Flow

Open `/admin` from an admin account.

To add a channel, send two lines when prompted:

```text
Channel title
https://t.me/channel_username
```
>>>>>>> 6955f84 (First_version_bot_commit)
