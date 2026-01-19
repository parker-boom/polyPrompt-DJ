require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { io } = require("socket.io-client");
const { Client, GatewayIntentBits } = require("discord.js");

const { makeDeveloperToken, resolveKeyPath } = require("../src/lib/appleToken");
const { loadVibesConfig } = require("../src/lib/vibes");

const errors = [];
const warnings = [];

function noteError(message) {
  errors.push(message);
  console.error(`ERROR: ${message}`);
}

function noteWarn(message) {
  warnings.push(message);
  console.warn(`WARN: ${message}`);
}

function checkEnv() {
  const required = [
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_MEDIA_ID",
    "APPLE_MUSICKIT_KEY_PATH",
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "DISCORD_CHANNEL_ID",
    "OPENAI_API_KEY"
  ];
  required.forEach((key) => {
    if (!process.env[key]) {
      noteError(`Missing env var: ${key}`);
    }
  });
}

async function checkAppleToken() {
  try {
    const keyPath = resolveKeyPath(process.env.APPLE_MUSICKIT_KEY_PATH);
    if (!keyPath || !fs.existsSync(keyPath)) {
      noteError("Apple Music key file not found. Check APPLE_MUSICKIT_KEY_PATH.");
      return;
    }
    const { token } = makeDeveloperToken();
    if (!token || token.length < 20) {
      noteError("Developer token generation failed.");
    } else {
      console.log("OK: Apple developer token generated.");
    }
  } catch (err) {
    noteError(`Apple token error: ${err.message}`);
  }
}

async function checkVibes() {
  try {
    const config = loadVibesConfig();
    const placeholders = config.vibes.filter((v) => v.id === "REPLACE_ME");
    if (placeholders.length) {
      noteWarn("Vibes config has placeholder playlist IDs.");
    } else {
      console.log("OK: Vibes config loaded.");
    }
  } catch (err) {
    noteError(`Vibes config error: ${err.message}`);
  }
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timeoutId)), timeout]);
}

async function checkServerAndSocket() {
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        const socket = io(`http://localhost:${port}`, { transports: ["websocket"] });
        socket.on("connect", () => {
          socket.disconnect();
          resolve();
        });
        socket.on("connect_error", (err) => reject(err));
      }),
      3000,
      "Socket check"
    );
    console.log("OK: Socket.IO server booted.");
  } catch (err) {
    noteError(`Socket.IO check failed: ${err.message}`);
  } finally {
    ioServer.close();
    server.close();
  }
}

async function checkDiscordLogin() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        client.once("ready", () => resolve());
        client.once("error", reject);
        client.login(token).catch(reject);
      }),
      6000,
      "Discord login"
    );
    console.log("OK: Discord login succeeded.");
  } catch (err) {
    noteError(`Discord login failed: ${err.message}`);
  } finally {
    client.destroy();
  }
}

(async () => {
  console.log("PromptDJ doctor starting...\n");

  checkEnv();
  await checkAppleToken();
  await checkVibes();
  await checkServerAndSocket();
  await checkDiscordLogin();

  console.log("\nDoctor finished.");
  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
  }
  if (errors.length) {
    console.log(`Errors: ${errors.length}`);
    process.exit(1);
  }
})();
