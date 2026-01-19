const fs = require("fs");
const path = require("path");

const DEFAULT_PATH = path.join(process.cwd(), "config", "vibes.json");

function loadVibesConfig() {
  const raw = fs.readFileSync(DEFAULT_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!data.vibes || !Array.isArray(data.vibes) || data.vibes.length === 0) {
    throw new Error("Vibes config is empty. Fill config/vibes.json.");
  }
  return data;
}

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function findVibeByName(config, vibeText) {
  const needle = normalize(vibeText);
  if (!needle) return null;
  return config.vibes.find((vibe) => {
    const names = [vibe.name, ...(vibe.aliases || [])].map(normalize);
    return names.includes(needle);
  });
}

function findVibeByFuzzy(config, vibeText) {
  const needle = normalize(vibeText);
  if (!needle) return null;
  return config.vibes.find((vibe) => {
    const names = [vibe.name, ...(vibe.aliases || [])].map(normalize);
    return names.some((name) => needle.includes(name) || name.includes(needle));
  });
}

function pickNextVibe(config, currentVibeId, avoidIds) {
  const candidates = config.vibes.filter((v) => !avoidIds.includes(v.id));
  if (candidates.length === 0) {
    return config.vibes.find((v) => v.id !== currentVibeId) || config.vibes[0];
  }
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

module.exports = {
  loadVibesConfig,
  findVibeByName,
  findVibeByFuzzy,
  pickNextVibe
};

