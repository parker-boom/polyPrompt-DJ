const { findVibeByFuzzy } = require("./vibes");

function extractAfter(keyword, text) {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";
  return text.slice(idx + keyword.length).trim();
}

function detectIntentHeuristic(message, vibesConfig) {
  const raw = message || "";
  const lower = raw.toLowerCase().trim();

  if (!lower) return null;

  if (/(what's playing|whats playing|now playing|current song|playing now)/.test(lower)) {
    return { intent: "STATUS_NOW" };
  }

  if (/(what's next|whats next|up next|next song|queue\s*\?)/.test(lower)) {
    return { intent: "STATUS_NEXT" };
  }

  if (/\bhelp\b|what can you do|commands/.test(lower)) {
    return { intent: "HELP" };
  }

  const playMatch = lower.match(/^(play|queue|add|spin|drop|put on|put in|request)\b\s*(.*)/);
  if (playMatch) {
    const query = playMatch[2]?.trim();
    if (query) return { intent: "SONG_REQUEST", query };
  }

  if (/(switch|set|change)\s+(the\s+)?vibe/.test(lower)) {
    const query = extractAfter("vibe", lower);
    if (query) return { intent: "VIBE_REQUEST", vibe: query };
  }

  const vibeHint = findVibeByFuzzy(vibesConfig, lower);
  if (vibeHint && /(vibe|mood|playlist|energy|focus|chill|study|party|hype|instrumental)/.test(lower)) {
    return { intent: "VIBE_REQUEST", vibe: vibeHint.name };
  }

  return null;
}

module.exports = { detectIntentHeuristic };

