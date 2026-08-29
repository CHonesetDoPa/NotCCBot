// Resolve and parse rules

function parseRules(yamlText, yaml) {
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
          `Rule ${index}, pattern ${patternIndex} must be a non-empty string.`,
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
            `Invalid regex in rule ${index}, pattern ${patternIndex}: ${error.message}`,
          );
        }
      });
    }

    const safeReplies = replies.map((reply, replyIndex) => {
      if (typeof reply !== "string" || reply.length === 0) {
        throw new Error(
          `Rule ${index}, reply ${replyIndex} must be a non-empty string.`,
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

// 从回复列表中随机挑一条。
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

//依次用原始文本与规范化文本尝试匹配规则，返回首个命中项，无命中返回 null
function matchRules(text, normalizedText, rules, normalizeFn) {
  for (const rule of rules) {
    if (rule.strict) {
      for (const pattern of rule.patterns) {
        const normalizedPattern = normalizeFn(pattern);
        if (text === pattern || normalizedText === normalizedPattern) {
          return { rule, matchedText: text };
        }
      }
    } else {
      for (const regex of rule.patterns) {
        // Recreate the RegExp to avoid shared lastIndex state across calls.
        const rawResult = new RegExp(regex.source, regex.flags).exec(text);
        if (rawResult) {
          return { rule, matchedText: rawResult[0] || text };
        }

        const normalizedResult = new RegExp(regex.source, regex.flags).exec(
          normalizedText,
        );
        if (normalizedResult) {
          return { rule, matchedText: normalizedResult[0] || text };
        }
      }
    }
  }

  return null;
}

module.exports = { parseRules, pickRandom, matchRules };
