const { Client, GatewayIntentBits, Partials } = require("discord.js");

function startDiscordBot({ token, guildId, channelId, log, onMessage }) {
  if (!token || !guildId || !channelId) {
    log.warn("Discord not configured. Missing DISCORD_BOT_TOKEN / DISCORD_GUILD_ID / DISCORD_CHANNEL_ID.");
    return { client: null, sendMessage: async () => {}, ready: false };
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
  });

  let ready = false;
  let channelRef = null;

  client.on("ready", async () => {
    ready = true;
    log.info(`Discord logged in as ${client.user.tag}`);
    try {
      const channel = await client.channels.fetch(channelId);
      channelRef = channel;
      log.info("Discord channel ready", { channelId: channelId });
    } catch (err) {
      log.error("Failed to fetch Discord channel", { error: err.message });
    }
  });

  client.on("messageCreate", async (message) => {
    if (!message || !message.content) {
      log.warn("Received empty message content");
      return;
    }
    if (message.author?.bot) return;
    if (message.guildId !== guildId || message.channelId !== channelId) return;
    onMessage(message);
  });

  client.on("error", (err) => log.error("Discord client error", { error: err.message }));
  client.on("shardError", (err) => log.error("Discord shard error", { error: err.message }));
  client.on("shardDisconnect", (event) => log.warn("Discord shard disconnected", { event }));
  client.on("shardResume", () => log.info("Discord shard resumed"));

  client.login(token).catch((err) => {
    log.error("Discord login failed", { error: err.message });
  });

  async function sendMessage(text) {
    if (!ready) return;
    try {
      if (!channelRef) {
        channelRef = await client.channels.fetch(channelId);
      }
      if (channelRef) {
        await channelRef.send(text);
      }
    } catch (err) {
      log.error("Failed to send Discord message", { error: err.message });
    }
  }

  return { client, sendMessage, ready: () => ready };
}

module.exports = { startDiscordBot };

