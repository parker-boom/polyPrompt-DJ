# Architecture

PromptDJ is a single Node.js app with a browser-based MusicKit screen.

Flow:
- Discord message arrives -> intent router -> optional OpenAI -> action.
- Server emits a Socket.IO action to the screen.
- Screen executes MusicKit calls and replies with status.
- Server updates state and replies in Discord.

Key files:
- `src/server.js`: Express server, Socket.IO bridge, vibe rotation, and bot wiring.
- `src/discordBot.js`: Discord client and message hook.
- `src/lib/ai.js`: OpenAI usage, memory buffer, and summaries.
- `public/index.html` + `public/screen.js`: projector UI and MusicKit actions.
- `config/vibes.json`: playlist-based vibe config.
