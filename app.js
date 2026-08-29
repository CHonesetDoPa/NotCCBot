// Main Entry Point

require("dotenv").config();
const fs = require("node:fs");
const yaml = require("js-yaml");
const { Bot, run } = require("node-telegram-bot-api/node");

const { loadConfig } = require("./src/config");
const { parseNormalizeMap, normalizeConfusableC } = require("./src/normalize");
const { parseRules, pickRandom, matchRules } = require("./src/rules");

// 从环境变量读取 token、规则文件路径、白名单和代理配置
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// 从 YAML 文件读取关键词回复规则和字符规范化映射表
function loadRulesFromFile() {
  return parseRules(fs.readFileSync(config.rulesFilePath, "utf8"), yaml);
}

function loadNormalizeMapFromFile() {
  return parseNormalizeMap(
    fs.readFileSync(config.normalizeMapFilePath, "utf8"),
    yaml,
  );
}

// 启动时加载规则与映射表
const rules = loadRulesFromFile();
const normalizeMap = loadNormalizeMapFromFile();
console.log(
  `[RULES_LOADED] file=${config.rulesFilePath} total=${rules.length}`,
);
console.log(
  `[NORMALIZE_LOADED] file=${config.normalizeMapFilePath} total=${normalizeMap.length}`,
);

// 长轮询模式
const botOptions = {};
if (config.proxyUrl) {
  const undici = require("undici");
  const agent = new undici.ProxyAgent(config.proxyUrl);
  botOptions.fetch = (url, init) =>
    undici.fetch(url, { ...init, dispatcher: agent });
  console.log(`[PROXY] using ${config.proxyUrl}`);
}

const bot = new Bot(config.token, botOptions);

// 消息处理：规范化、白名单校验、规则匹配、随机回复
bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const chatId = ctx.chatId;
  const sourceId = ctx.from?.id || chatId;
  const username = ctx.from?.username || ctx.from?.first_name || "unknown";
  const chatType = ctx.chat?.type || "unknown";
  const text = (msg?.text || "").trim();
  const normalizedText = normalizeConfusableC(text, normalizeMap);

  if (!text) {
    return;
  }

  console.log(
    `[INCOMING] sourceId=${sourceId} username=${username} chatId=${chatId} chatType=${chatType} text=${JSON.stringify(text)}`,
  );

  // 白名单
  const userAllowed =
    config.userWhitelist.size === 0 ||
    config.userWhitelist.has(Number(sourceId));
  const chatAllowed =
    config.chatWhitelist.size === 0 || config.chatWhitelist.has(Number(chatId));

  if (!userAllowed || !chatAllowed) {
    console.log(
      `[SKIP_WHITELIST] sourceId=${sourceId} username=${username} chatId=${chatId} userAllowed=${userAllowed} chatAllowed=${chatAllowed}`,
    );
    return;
  }

  const match = matchRules(text, normalizedText, rules, (pattern) =>
    normalizeConfusableC(pattern, normalizeMap),
  );

  if (!match) {
    return;
  }

  // 命中规则后随机发出
  const { rule, matchedText } = match;
  const patternInfo = rule.strict
    ? `strict=true patterns=${JSON.stringify(rule.patterns)}`
    : `strict=false pattern=/${rule.patterns
        .map((r) => r.source)
        .join("|")}/${rule.patterns[0]?.flags || ""}`;

  console.log(
    `[MATCHED] sourceId=${sourceId} username=${username} rule=${rule.name} ${patternInfo} matched=${JSON.stringify(matchedText)}`,
  );

  const reply = pickRandom(rule.replies);

  try {
    const sent = await ctx.reply(reply, {
      reply_parameters: { message_id: msg.message_id },
    });
    console.log(
      `[SENT] sourceId=${sourceId} username=${username} rule=${rule.name} reply=${JSON.stringify(reply)} sentMessageId=${sent.message_id}`,
    );
  } catch (error) {
    console.error(
      `[SEND_FAILED] sourceId=${sourceId} username=${username} rule=${rule.name} error=${error.message}`,
    );
  }
});

console.log("Bot started. Waiting for messages...");
run(bot, { onError: (error) => console.error("Polling error:", error) }).catch(
  (error) => {
    console.error("Polling loop failed:", error);
    process.exit(1);
  },
);
