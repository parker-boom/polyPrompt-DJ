# Setup

Prereqs:
- Node.js 18+
- Apple Music subscription for the account that will authorize playback
- Discord bot with Message Content intent enabled

## .env
Copy `.env.example` to `.env` and fill:
- APPLE_TEAM_ID
- APPLE_KEY_ID
- APPLE_MEDIA_ID
- APPLE_MUSICKIT_KEY_PATH (path to your .p8 key, relative is fine)
- DISCORD_BOT_TOKEN
- DISCORD_GUILD_ID
- DISCORD_CHANNEL_ID
- OPENAI_API_KEY
- OPENAI_MODEL (optional)
- PORT (optional)

## Apple Music key
Place your `.p8` key at the path in `APPLE_MUSICKIT_KEY_PATH`.

## Discord intent
Enable the Message Content intent in the Discord Developer Portal or the bot will not read chat.

## Doctor
Run checks:
```
node scripts/doctor.js
```
