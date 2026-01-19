require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");

const { logger } = require("./lib/logger");
const { getDeveloperToken } = require("./lib/appleToken");
const { loadVibesConfig, findVibeByName, findVibeByFuzzy, pickNextVibe } = require("./lib/vibes");
const { detectIntentHeuristic } = require("./lib/intent");
const { createAiService } = require("./lib/ai");
const { startDiscordBot } = require("./discordBot");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const log = logger("server");
const screenLog = logger("screen");
const aiLog = logger("ai");
const botLog = logger("discord");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

let personality = { name: "PromptDJ", tagline: "Live from your local channel.", style: {} };
try {
  const raw = fs.readFileSync(path.join(process.cwd(), "config", "personality.json"), "utf8");
  personality = JSON.parse(raw);
} catch (err) {
  log.warn("Personality config missing, using defaults.");
}

let vibesConfig = {
  defaultVibe: null,
  quietAnnounceMs: 120000,
  rotation: { tracksPerVibe: 15, avoidLast: 3, requestStormWindowMs: 120000 },
  vibes: []
};
try {
  vibesConfig = loadVibesConfig();
} catch (err) {
  log.error("Failed to load vibes config", { error: err.message });
}

const placeholderVibes = vibesConfig.vibes.filter((v) => v.id === "REPLACE_ME");
if (placeholderVibes.length) {
  log.warn("Vibes config has placeholder playlist IDs. Update config/vibes.json.");
}

const ai = createAiService({ personality, log: aiLog });

const state = {
  screenSocket: null,
  pendingActions: new Map(),
  lastStatus: null,
  lastTrackId: null,
  tracksSinceVibeStart: 0,
  currentVibe: null,
  lastVibes: [],
  lastChannelActivity: 0,
  lastGeneralReplyAt: 0,
  lastManualRequestAt: 0
};

const generalCooldownMs = 8000;

function getDefaultVibe() {
  const fromConfig = findVibeByName(vibesConfig, vibesConfig.defaultVibe);
  return fromConfig || vibesConfig.vibes[0] || null;
}

function rememberVibe(vibe) {
  if (!vibe) return;
  state.lastVibes.unshift(vibe.id);
  state.lastVibes = state.lastVibes.slice(0, Math.max(3, vibesConfig.rotation?.avoidLast || 3));
}

function sendScreenAction(type, payload, timeoutMs = 15000) {
  if (!state.screenSocket) {
    return Promise.reject(new Error("Screen not connected"));
  }

  const id = crypto.randomUUID();
  const action = { id, type, payload };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pendingActions.delete(id);
      reject(new Error(`${type} timed out`));
    }, timeoutMs);

    state.pendingActions.set(id, { resolve, reject, timeout });
    screenLog.info("Action send", { id, type });
    state.screenSocket.emit("server:action", action);
  });
}

function pushToast(message, tone) {
  if (state.screenSocket) {
    state.screenSocket.emit("server:toast", { message, tone, ts: Date.now() });
  }
}

async function setVibe(vibe, reason, requestedBy) {
  if (!vibe) throw new Error("Unknown vibe");
  await sendScreenAction("setVibe", { vibeId: vibe.id, vibeName: vibe.name, reason });
  state.currentVibe = { id: vibe.id, name: vibe.name };
  state.tracksSinceVibeStart = 0;
  rememberVibe(vibe);

  const toast = `Vibe shift: ${vibe.name}`;
  pushToast(toast, "accent");

  const quietFor = Date.now() - state.lastChannelActivity;
  if (quietFor > vibesConfig.quietAnnounceMs && !requestedBy) {
    bot.sendMessage(`Vibe shift: ${vibe.name}.`);
  }

  if (requestedBy) {
    bot.sendMessage(`${requestedBy}, switching to ${vibe.name}.`);
  }
}

async function queueSong(query, requestedBy) {
  const result = await sendScreenAction("queueSong", { query, requestedBy });
  return result;
}

function formatTrack(track) {
  if (!track || (!track.title && !track.artist)) return "Unknown track";
  return `${track.title || "Unknown"} — ${track.artist || "Unknown"}`;
}

async function handleStatusUpdate(status) {
  if (!status) return;
  state.lastStatus = status;
  if (status.vibe && status.vibe.id) {
    state.currentVibe = status.vibe;
  }

  const currentId = status.nowPlaying?.id;
  if (currentId && currentId !== state.lastTrackId) {
    if (state.lastTrackId) {
      state.tracksSinceVibeStart += 1;
    }
    state.lastTrackId = currentId;
    await maybeRotateVibe();
  }
}

async function maybeRotateVibe() {
  const rotation = vibesConfig.rotation || {};
  const tracksPerVibe = rotation.tracksPerVibe || 15;
  const avoidCount = rotation.avoidLast || 3;
  const requestStormWindow = rotation.requestStormWindowMs || 120000;

  if (!state.currentVibe) return;
  if (state.tracksSinceVibeStart < tracksPerVibe) return;
  if (Date.now() - state.lastManualRequestAt < requestStormWindow) return;

  const avoidIds = [state.currentVibe.id, ...state.lastVibes.slice(0, avoidCount)];
  const nextVibe = pickNextVibe(vibesConfig, state.currentVibe.id, avoidIds);
  if (!nextVibe) return;

  screenLog.info("Auto-rotating vibe", { to: nextVibe.name });
  try {
    await setVibe(nextVibe, "rotation");
  } catch (err) {
    screenLog.error("Auto-rotation failed", { error: err.message });
  }
}

function chooseVariant(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function trimReply(text) {
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/);
  const trimmed = sentences.slice(0, 2).join(" ").trim();
  return trimmed.length > 260 ? trimmed.slice(0, 260) : trimmed;
}

function buildHelp() {
  return `Ask me to play a song, switch vibes, or ask what's playing. Try: "play get lucky", "switch to focus", "what's next".`;
}

async function handleDiscordMessage(message) {
  const content = message.content.trim();
  if (!content) return;

  state.lastChannelActivity = Date.now();
  botLog.info("Message in channel", { author: message.author.username, content });
  ai.addMessage({ author: message.author.username, content, isBot: false });
  ai.maybeSummarize().catch(() => {});

  let intent = detectIntentHeuristic(content, vibesConfig);
  if (!intent) {
    const context = ai.buildContext();
    const modelIntent = await ai.classifyIntent({ message: content, context });
    if (modelIntent) intent = modelIntent;
  }

  if (!intent) {
    intent = { intent: "GENERAL_CHAT" };
  }

  const allowedIntents = new Set([
    "SONG_REQUEST",
    "VIBE_REQUEST",
    "STATUS_NOW",
    "STATUS_NEXT",
    "HELP",
    "GENERAL_CHAT"
  ]);
  if (!allowedIntents.has(intent.intent)) {
    intent = { intent: "GENERAL_CHAT" };
  }

  botLog.info("Intent", intent);

  if (intent.intent === "SONG_REQUEST") {
    const query = intent.query || content.replace(/^(play|queue|add|spin|drop|put on|request)\s+/i, "").trim();
    if (!query) {
      await bot.sendMessage("Tell me the song title and artist.");
      return;
    }
    state.lastManualRequestAt = Date.now();

    try {
      screenLog.info("Queue request", { query, requestedBy: message.author.username });
      const result = await queueSong(query, message.author.username);
      const reply = chooseVariant([
        `Queued: ${formatTrack(result)}.`,
        `On deck: ${formatTrack(result)}.`,
        `Spinning up ${formatTrack(result)}.`
      ]);
      await bot.sendMessage(reply);
      pushToast(`Queued: ${formatTrack(result)} — requested by ${message.author.username}`);
      ai.addMessage({ author: personality.name, content: reply, isBot: true });
    } catch (err) {
      const reply = `Queue failed: ${err.message}.`;
      await bot.sendMessage(reply);
      botLog.error("Queue error", { error: err.message });
    }
    return;
  }

  if (intent.intent === "VIBE_REQUEST") {
    if (!vibesConfig.vibes.length) {
      await bot.sendMessage("No vibes configured yet. Update config/vibes.json.");
      return;
    }

    const vibeText = intent.vibe || content;
    let vibe = findVibeByName(vibesConfig, vibeText) || findVibeByFuzzy(vibesConfig, vibeText);
    if (!vibe) {
      const vibeList = vibesConfig.vibes.map((v) => v.name).join(", ");
      await bot.sendMessage(`I don't have that vibe. Try: ${vibeList}.`);
      return;
    }

    state.lastManualRequestAt = Date.now();
    try {
      screenLog.info("Vibe request", { vibe: vibe.name, requestedBy: message.author.username });
      await setVibe(vibe, "request", message.author.username);
      ai.addMessage({ author: personality.name, content: `Switched to ${vibe.name}.`, isBot: true });
    } catch (err) {
      await bot.sendMessage(`Vibe switch failed: ${err.message}.`);
    }
    return;
  }

  if (intent.intent === "STATUS_NOW") {
    const now = state.lastStatus?.nowPlaying;
    const reply = now
      ? `Now playing: ${formatTrack(now)}.`
      : "Nothing playing yet. Queue a track.";
    await bot.sendMessage(reply);
    ai.addMessage({ author: personality.name, content: reply, isBot: true });
    return;
  }

  if (intent.intent === "STATUS_NEXT") {
    const upNext = state.lastStatus?.upNext || [];
    const reply = upNext.length
      ? `Up next: ${upNext.map((t) => `${t.title} — ${t.artist}`).join(" | ")}.`
      : "Queue is empty. Toss me a song.";
    await bot.sendMessage(reply);
    ai.addMessage({ author: personality.name, content: reply, isBot: true });
    return;
  }

  if (intent.intent === "HELP") {
    const reply = buildHelp();
    await bot.sendMessage(reply);
    ai.addMessage({ author: personality.name, content: reply, isBot: true });
    return;
  }

  if (intent.intent === "GENERAL_CHAT") {
    if (Date.now() - state.lastGeneralReplyAt < generalCooldownMs) {
      botLog.debug("Skipping chat reply due to cooldown");
      return;
    }

    const context = ai.buildContext();
    const replyRaw = intent.response || (await ai.generateChatReply({ message: content, context }));
    const reply = trimReply(replyRaw);
    if (reply) {
      state.lastGeneralReplyAt = Date.now();
      await bot.sendMessage(reply);
      pushToast(`DJ says: ${reply}`);
      ai.addMessage({ author: personality.name, content: reply, isBot: true });
    }
  }
}

app.use(express.static(PUBLIC_DIR));

app.get("/token", (req, res) => {
  try {
    res.json({ token: getDeveloperToken() });
  } catch (err) {
    log.error("Token generation failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get("/sandbox", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "sandbox.html"));
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    screenConnected: Boolean(state.screenSocket),
    discordReady: Boolean(bot.ready && bot.ready()),
    vibe: state.currentVibe,
    nowPlaying: state.lastStatus?.nowPlaying || null
  });
});

io.on("connection", (socket) => {
  screenLog.info("Screen connected", { id: socket.id });
  state.screenSocket = socket;

  socket.emit("server:hello", {
    djName: personality.name,
    djTagline: personality.tagline,
    vibe: state.currentVibe || getDefaultVibe()
  });

  sendScreenAction("getStatus", {}).catch(() => {});

  socket.on("screen:hello", (payload) => {
    screenLog.info("Screen hello", payload || {});
  });

  socket.on("screen:status", async (status) => {
    screenLog.debug("Status update", status?.nowPlaying ? { track: status.nowPlaying.title } : {});
    await handleStatusUpdate(status);
  });

  socket.on("screen:actionResult", (result) => {
    const pending = state.pendingActions.get(result.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    state.pendingActions.delete(result.id);
    if (result.ok) {
      screenLog.info("Action ok", { id: result.id });
      pending.resolve(result.data);
    } else {
      screenLog.error("Action failed", { id: result.id, error: result.error });
      pending.reject(new Error(result.error || "Action failed"));
    }
  });

  socket.on("disconnect", () => {
    if (state.screenSocket && state.screenSocket.id === socket.id) {
      state.screenSocket = null;
    }
    for (const pending of state.pendingActions.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Screen disconnected"));
    }
    state.pendingActions.clear();
    screenLog.warn("Screen disconnected", { id: socket.id });
  });
});

const bot = startDiscordBot({
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  channelId: process.env.DISCORD_CHANNEL_ID,
  log: botLog,
  onMessage: handleDiscordMessage
});

state.currentVibe = getDefaultVibe();

server.listen(PORT, () => {
  log.info(`PromptDJ server running at http://localhost:${PORT}`);
  log.info("Screen URL: / (main) or /sandbox for fallback");
});

