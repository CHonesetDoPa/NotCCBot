// Read configuration from environment variables and files

const path = require("node:path");

function parseIdWhitelist(value) {
  if (!value || !value.trim()) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item))
      .filter((item) => Number.isSafeInteger(item)),
  );
}

function loadConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in environment variables.");
  }

  const rulesFile = env.KEYWORD_RULES_FILE || "keywords.yml";
  const normalizeMapFile = env.NORMALIZE_MAP_FILE || "normalize.yml";

  return {
    token,
    rulesFilePath: path.resolve(process.cwd(), rulesFile),
    normalizeMapFilePath: path.resolve(process.cwd(), normalizeMapFile),
    userWhitelist: parseIdWhitelist(env.USER_ID_WHITELIST || ""),
    chatWhitelist: parseIdWhitelist(env.CHAT_ID_WHITELIST || ""),
    proxyUrl:
      env.TELEGRAM_PROXY_URL || env.HTTPS_PROXY || env.HTTP_PROXY || null,
  };
}

module.exports = { loadConfig, parseIdWhitelist };
