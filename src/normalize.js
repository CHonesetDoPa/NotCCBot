// Unicide Confusable Normalization and Rule Matching

function parseNormalizeMap(yamlText, yaml) {
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
        `Normalize item ${index} field 'from' must be a non-empty string.`,
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

function normalizeConfusableC(input, mapEntries) {
  if (!input) {
    return "";
  }

  return applyNormalizeMap(input.normalize("NFKC"), mapEntries);
}

module.exports = {
  parseNormalizeMap,
  applyNormalizeMap,
  normalizeConfusableC,
};
