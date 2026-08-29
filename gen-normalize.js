// 从 Unicode confusables.txt 生成 normalize.yml ，保留映射到 C/c 的条目
// 数据获取自 https://www.unicode.org/Public/security/latest/confusables.txt

const fs = require("fs");

const CONFUSABLES_URL =
  "https://www.unicode.org/Public/security/latest/confusables.txt";

async function fetchConfusables() {
  if (typeof fetch === "function") {
    const res = await fetch(CONFUSABLES_URL);
    if (!res.ok) {
      throw new Error(`Failed: HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  }
  const { request } = require("undici");
  const res = await request(CONFUSABLES_URL);
  if (res.statusCode !== 200) {
    throw new Error(`Failed: HTTP ${res.statusCode}`);
  }
  return await res.body.text();
}

async function main() {
  const text = await fetchConfusables();
  const entries = [];

  for (const line of text.split(/\r?\n/)) {
  const code = line.charCodeAt(0);
  if (code === 0x23 /* # */ || code === 0x0d || code === 0x0a) continue;
  if (!line.trim()) continue;

  const [src, tgt] = line.split(";").map((s) => s.trim());
  const srcCode = parseInt(src, 16);

  const tgtPoints = tgt.split(/\s+/);
  if (tgtPoints.length !== 1) continue;
  if (tgtPoints[0] !== "0043" && tgtPoints[0] !== "0063") continue;

  entries.push({
    from: String.fromCodePoint(srcCode),
    to: tgtPoints[0] === "0043" ? "C" : "c",
  });
}

entries.sort(
  (a, b) =>
    a.to.localeCompare(b.to) ||
    a.from.codePointAt(0) - b.from.codePointAt(0),
);

const yaml =
  entries
    .map(
      (e) =>
        `- from: ${JSON.stringify(e.from)}\n  to: ${JSON.stringify(e.to)}`,
    )
    .join("\n\n") + "\n";

fs.writeFileSync("normalize.yml", yaml);
console.log(`Generated ${entries.length} entries to normalize.yml`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
