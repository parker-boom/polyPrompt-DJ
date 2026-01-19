// server.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

function makeDeveloperToken() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const keyPath = process.env.APPLE_MUSICKIT_KEY_PATH;

  if (!teamId || !keyId || !keyPath) {
    throw new Error("Missing APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_MUSICKIT_KEY_PATH in .env");
  }

  const absKeyPath = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  const privateKey = fs.readFileSync(absKeyPath, "utf8");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30; // 30 days (safe); you can extend later

  // Apple Music developer token is a JWT signed with ES256. :contentReference[oaicite:1]{index=1}
  return jwt.sign(
    { iss: teamId, iat: now, exp },
    privateKey,
    { algorithm: "ES256", header: { kid: keyId } }
  );
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/token", (req, res) => {
  try {
    res.json({ token: makeDeveloperToken() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`PromptDJ MusicKit sandbox running: http://localhost:${PORT}`);
});
