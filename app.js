require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment variables.");
  process.exit(1);
}

const rulesFile = process.env.KEYWORD_RULES_FILE || "keywords.yml";
const rulesFilePath = path.resolve(process.cwd(), rulesFile);
const normalizeMapFile = process.env.NORMALIZE_MAP_FILE || "normalize.yml";
const normalizeMapFilePath = path.resolve(process.cwd(), normalizeMapFile);

if (!fs.existsSync(rulesFilePath)) {
  console.error(`Rules file not found: ${rulesFilePath}`);
  process.exit(1);
}

if (!fs.existsSync(normalizeMapFilePath)) {
  console.error(`Normalize map file not found: ${normalizeMapFilePath}`);
  process.exit(1);
}

/**
 * YAML rules format:
 * - name: greeting
 *   patterns:
 *     - "\\b(hello|hi|hey)\\b"
 *   replies:
 *     - "Hi!"
 *     - "Hello there!"
 *   flags: "i"
 */
function parseRules(yamlText) {
  let parsed;
  try {
    parsed = yaml.load(yamlText);
  } catch (error) {
    throw new Error(`Rules YAML is invalid: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Rules YAML must be a non-empty array.");
  }

  return parsed.map((rule, index) => {
    if (!rule || typeof rule !== "object") {
      throw new Error(`Rule at index ${index} must be an object.`);
    }

    const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
    const replies = Array.isArray(rule.replies) ? rule.replies : [];

    if (patterns.length === 0) {
      throw new Error(`Rule at index ${index} has no patterns.`);
    }

    if (replies.length === 0) {
      throw new Error(`Rule at index ${index} has no replies.`);
    }

    const strict = rule.strict === true;

    const safePatterns = patterns.map((pattern, patternIndex) => {
      if (typeof pattern !== "string" || pattern.length === 0) {
        throw new Error(
          `Rule ${index}, pattern ${patternIndex} must be a non-empty string.`
        );
      }

      return pattern;
    });

    const flags = typeof rule.flags === "string" ? rule.flags : "i";

    let compiledPatterns = [];
    if (!strict) {
      compiledPatterns = safePatterns.map((pattern, patternIndex) => {
        try {
          return new RegExp(pattern, flags);
        } catch (error) {
          throw new Error(
            `Invalid regex in rule ${index}, pattern ${patternIndex}: ${error.message}`
          );
        }
      });
    }

    const safeReplies = replies.map((reply, replyIndex) => {
      if (typeof reply !== "string" || reply.length === 0) {
        throw new Error(
          `Rule ${index}, reply ${replyIndex} must be a non-empty string.`
        );
      }
      return reply;
    });

    return {
      name: typeof rule.name === "string" ? rule.name : `rule-${index}`,
      strict,
      patterns: strict ? safePatterns : compiledPatterns,
      replies: safeReplies,
    };
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseNormalizeMap(yamlText) {
  let parsed;
  try {
    parsed = yaml.load(yamlText);
  } catch (error) {
    throw new Error(`Normalize YAML is invalid: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Normalize YAML must be a non-empty array.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Normalize item at index ${index} must be an object.`);
    }

    const from = item.from;
    const to = item.to;

    if (typeof from !== "string" || from.length === 0) {
      throw new Error(
        `Normalize item ${index} field 'from' must be a non-empty string.`
      );
    }

    if (typeof to !== "string") {
      throw new Error(`Normalize item ${index} field 'to' must be a string.`);
    }

    return { from, to };
  });
}

function applyNormalizeMap(input, mapEntries) {
  let normalized = input;
  for (const entry of mapEntries) {
    normalized = normalized.split(entry.from).join(entry.to);
  }
  return normalized;
}

// Normalize common Unicode confusables that look like latin c/C.
function normalizeConfusableC(input, mapEntries) {
  if (!input) {
    return "";
  }

  return applyNormalizeMap(input.normalize("NFKC"), mapEntries);
}

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
      .filter((item) => Number.isSafeInteger(item))
  );
}

function loadRulesFromFile() {
  const rawRulesText = fs.readFileSync(rulesFilePath, "utf8");
  return parseRules(rawRulesText);
}

function loadNormalizeMapFromFile() {
  const rawNormalizeText = fs.readFileSync(normalizeMapFilePath, "utf8");
  return parseNormalizeMap(rawNormalizeText);
}

let rules = [];
let normalizeMap = [];
try {
  rules = loadRulesFromFile();
  console.log(
    `[RULES_LOADED] file=${rulesFilePath} total=${rules.length}`
  );
} catch (error) {
  console.error(`[RULES_LOAD_FAILED] file=${rulesFilePath} error=${error.message}`);
  process.exit(1);
}

try {
  normalizeMap = loadNormalizeMapFromFile();
  console.log(
    `[NORMALIZE_LOADED] file=${normalizeMapFilePath} total=${normalizeMap.length}`
  );
} catch (error) {
  console.error(
    `[NORMALIZE_LOAD_FAILED] file=${normalizeMapFilePath} error=${error.message}`
  );
  process.exit(1);
}

let reloadTimer = null;
function scheduleRulesReload() {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }

  // Debounce rapid change events generated by editors.
  reloadTimer = setTimeout(() => {
    try {
      const nextRules = loadRulesFromFile();
      rules = nextRules;
      console.log(
        `[RULES_RELOADED] file=${rulesFilePath} total=${rules.length}`
      );
    } catch (error) {
      console.error(
        `[RULES_RELOAD_FAILED] file=${rulesFilePath} error=${error.message}`
      );
    }
  }, 200);
}

let normalizeReloadTimer = null;
function scheduleNormalizeReload() {
  if (normalizeReloadTimer) {
    clearTimeout(normalizeReloadTimer);
  }

  normalizeReloadTimer = setTimeout(() => {
    try {
      const nextNormalizeMap = loadNormalizeMapFromFile();
      normalizeMap = nextNormalizeMap;
      console.log(
        `[NORMALIZE_RELOADED] file=${normalizeMapFilePath} total=${normalizeMap.length}`
      );
    } catch (error) {
      console.error(
        `[NORMALIZE_RELOAD_FAILED] file=${normalizeMapFilePath} error=${error.message}`
      );
    }
  }, 200);
}

try {
  fs.watch(rulesFilePath, (eventType) => {
    console.log(
      `[RULES_FILE_CHANGED] file=${rulesFilePath} event=${eventType}`
    );
    scheduleRulesReload();
  });
  console.log(`[RULES_WATCHING] file=${rulesFilePath}`);
} catch (error) {
  console.error(
    `[RULES_WATCH_FAILED] file=${rulesFilePath} error=${error.message}`
  );
}

try {
  fs.watch(normalizeMapFilePath, (eventType) => {
    console.log(
      `[NORMALIZE_FILE_CHANGED] file=${normalizeMapFilePath} event=${eventType}`
    );
    scheduleNormalizeReload();
  });
  console.log(`[NORMALIZE_WATCHING] file=${normalizeMapFilePath}`);
} catch (error) {
  console.error(
    `[NORMALIZE_WATCH_FAILED] file=${normalizeMapFilePath} error=${error.message}`
  );
}

const proxyUrl =
  process.env.TELEGRAM_PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY;

const userWhitelist = parseIdWhitelist(process.env.USER_ID_WHITELIST || "");
const chatWhitelist = parseIdWhitelist(process.env.CHAT_ID_WHITELIST || "");

const botOptions = { polling: true };
if (proxyUrl) {
  botOptions.request = { proxy: proxyUrl };
}

const bot = new TelegramBot(token, botOptions);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const sourceId = msg.from?.id || chatId;
  const username = msg.from?.username || msg.from?.first_name || "unknown";
  const chatType = msg.chat?.type || "unknown";
  const text = (msg.text || "").trim();
  const normalizedText = normalizeConfusableC(text, normalizeMap);

  if (!text) {
    return;
  }

  console.log(
    `[INCOMING] sourceId=${sourceId} username=${username} chatId=${chatId} chatType=${chatType} text=${JSON.stringify(text)}`
  );

  const userAllowed =
    userWhitelist.size === 0 || userWhitelist.has(Number(sourceId));
  const chatAllowed =
    chatWhitelist.size === 0 || chatWhitelist.has(Number(chatId));

  if (!userAllowed || !chatAllowed) {
    console.log(
      `[SKIP_WHITELIST] sourceId=${sourceId} username=${username} chatId=${chatId} userAllowed=${userAllowed} chatAllowed=${chatAllowed}`
    );
    return;
  }

  for (const rule of rules) {
    let matchedPattern = null;
    let matchedText = "";

    if (rule.strict) {
      for (const pattern of rule.patterns) {
        const normalizedPattern = normalizeConfusableC(pattern, normalizeMap);

        if (text === pattern || normalizedText === normalizedPattern) {
          matchedPattern = pattern;
          matchedText = text;
          break;
        }
      }
    } else {
      for (const regex of rule.patterns) {
        const safeRegex = new RegExp(regex.source, regex.flags);
        const rawResult = safeRegex.exec(text);
        if (rawResult) {
          matchedPattern = regex;
          matchedText = rawResult[0] || text;
          break;
        }

        const normalizedRegex = new RegExp(regex.source, regex.flags);
        const normalizedResult = normalizedRegex.exec(normalizedText);
        if (normalizedResult) {
          matchedPattern = regex;
          matchedText = normalizedResult[0] || text;
          break;
        }
      }
    }

    if (!matchedPattern) {
      continue;
    }

    const patternInfo = rule.strict
      ? `strict=true pattern=${JSON.stringify(matchedPattern)}`
      : `strict=false pattern=/${matchedPattern.source}/${matchedPattern.flags}`;

    console.log(
      `[MATCHED] sourceId=${sourceId} username=${username} rule=${rule.name} ${patternInfo} matched=${JSON.stringify(matchedText)}`
    );

    const reply = pickRandom(rule.replies);

    try {
      const sent = await bot.sendMessage(chatId, reply, {
        reply_to_message_id: msg.message_id,
      });
      console.log(
        `[SENT] sourceId=${sourceId} username=${username} rule=${rule.name} reply=${JSON.stringify(reply)} sentMessageId=${sent.message_id}`
      );
    } catch (error) {
      console.error(
        `[SEND_FAILED] sourceId=${sourceId} username=${username} rule=${rule.name} error=${error.message}`
      );
    }

    return;
  }
});

bot.on("polling_error", (error) => {
  console.error("Polling error:", error.message);
});

console.log("Bot started. Waiting for messages...");
