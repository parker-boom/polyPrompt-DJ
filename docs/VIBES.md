# Vibes

Edit `config/vibes.json` with your Apple Music playlist IDs.

Example entry:
```
{
  "id": "pl.u-xxxx",
  "name": "focus",
  "aliases": ["study", "deep work"]
}
```

Notes:
- `defaultVibe` is the initial vibe used for state and rotation.
- `rotation.tracksPerVibe` controls when auto-rotation triggers.
- `rotation.avoidLast` prevents repeating recent vibes.
- `quietAnnounceMs` controls when the bot announces auto-rotation in Discord.

Aliases let users say "study" or "focus" and hit the same vibe.
