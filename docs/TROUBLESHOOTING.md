# Troubleshooting

1) Bot does not reply
- Confirm DISCORD_GUILD_ID and DISCORD_CHANNEL_ID match the channel.
- Enable Message Content intent in the Discord Developer Portal.

2) Bot logs in but no messages are read
- The bot must have permission to view the channel and read messages.

3) MusicKit authorize fails
- Ensure Apple Music subscription is active on the account.
- Try the fallback page: `http://localhost:3000/sandbox`.

4) Token generation error
- Verify APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_MUSICKIT_KEY_PATH.
- Confirm the .p8 file path exists.

5) Screen shows "Music: Error"
- Restart the server after updating the key path.
- Verify the Apple developer token can be generated with `npm run doctor`.

6) No audio plays
- Audio only plays from the local browser tab.
- Make sure the tab is not muted and playback is allowed.

7) Queue requests fail
- Ensure the screen is open and authorized.
- Check server logs for screen connection errors.

8) Vibe switch does nothing
- Fill real playlist IDs in `config/vibes.json`.
- Avoid leaving `REPLACE_ME` placeholders.

9) "what's playing" returns empty
- The screen must be connected and sending status updates.
- Click "Refresh Status" on the screen once.

10) AI replies are missing
- Ensure OPENAI_API_KEY is set.
- Watch for rate-limit errors in logs.
