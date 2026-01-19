const levels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG"
};

function formatExtra(extra) {
  if (!extra) return "";
  try {
    return " " + JSON.stringify(extra);
  } catch {
    return "";
  }
}

function logger(scope) {
  return {
    info(message, extra) {
      console.log(`[${new Date().toISOString()}] [${levels.info}] [${scope}] ${message}${formatExtra(extra)}`);
    },
    warn(message, extra) {
      console.warn(`[${new Date().toISOString()}] [${levels.warn}] [${scope}] ${message}${formatExtra(extra)}`);
    },
    error(message, extra) {
      console.error(`[${new Date().toISOString()}] [${levels.error}] [${scope}] ${message}${formatExtra(extra)}`);
    },
    debug(message, extra) {
      if (process.env.DEBUG) {
        console.log(`[${new Date().toISOString()}] [${levels.debug}] [${scope}] ${message}${formatExtra(extra)}`);
      }
    }
  };
}

module.exports = { logger };

