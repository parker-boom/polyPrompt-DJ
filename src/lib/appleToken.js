const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const cache = {
  token: null,
  exp: 0
};

function resolveKeyPath(keyPath) {
  if (!keyPath) return null;
  return path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
}

function makeDeveloperToken() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const keyPath = process.env.APPLE_MUSICKIT_KEY_PATH;

  if (!teamId || !keyId || !keyPath) {
    throw new Error("Missing APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_MUSICKIT_KEY_PATH in .env");
  }

  const absKeyPath = resolveKeyPath(keyPath);
  const privateKey = fs.readFileSync(absKeyPath, "utf8");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 12;

  const token = jwt.sign(
    { iss: teamId, iat: now, exp },
    privateKey,
    { algorithm: "ES256", header: { kid: keyId } }
  );

  return { token, exp };
}

function getDeveloperToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - now > 60) {
    return cache.token;
  }

  const { token, exp } = makeDeveloperToken();
  cache.token = token;
  cache.exp = exp;
  return token;
}

module.exports = { getDeveloperToken, makeDeveloperToken, resolveKeyPath };

