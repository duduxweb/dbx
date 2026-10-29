const RELEASE = "https://github.com/duduxweb/dbx/releases/download/playlist-latest/";
const INDEX_URL = RELEASE + "categories-index.json";

function queryOf(req) {
  return new URL(req.url, "https://dbx.invalid").searchParams;
}

function json(res, status, data) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

function authorized(query) {
  return Boolean(process.env.API_USERNAME && process.env.API_PASSWORD &&
    query.get("username") === process.env.API_USERNAME &&
    query.get("password") === process.env.API_PASSWORD);
}

async function getIndex() {
  const now = Date.now();
  if (globalThis.__dbxIndex && globalThis.__dbxIndexExpires > now) return globalThis.__dbxIndex;
  const response = await fetch(INDEX_URL, { headers: { "user-agent": "DBX-Vercel-API/1.0" } });
  if (!response.ok) throw new Error("Category index unavailable: " + response.status);
  const index = await response.json();
  if (!Array.isArray(index.categories)) throw new Error("Invalid category index");
  globalThis.__dbxIndex = index;
  globalThis.__dbxIndexExpires = now + 5 * 60 * 1000;
  return index;
}

function categoryType(category) {
  if (category.kind === "live" || category.kind === "vod") return category.kind;
  return /filme|movie|serie|s[eé]rie|vod/i.test(category.name) ? "vod" : "live";
}

function safeAsset(category) {
  const asset = String(category.asset || "");
  if (!/^category-[a-z0-9-]+\.m3u$/.test(asset)) throw new Error("Invalid category asset");
  return asset;
}

async function getCategory(category) {
  const response = await fetch(RELEASE + safeAsset(category), {
    headers: { "user-agent": "DBX-Vercel-API/1.0" },
  });
  if (!response.ok) throw new Error("Playlist unavailable: " + response.status);
  return response.text();
}

function attr(line, key) {
  const match = line.match(new RegExp(key + '="([^"]*)"', "i"));
  return match ? match[1] : "";
}

function parseM3u(text) {
  const entries = [];
  let extinf = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#EXTINF:")) {
      extinf = line;
    } else if (extinf && line.trim() && !line.startsWith("#")) {
      const comma = extinf.lastIndexOf(",");
      entries.push({
        name: comma >= 0 ? extinf.slice(comma + 1).trim() : "Sem nome",
        url: line.trim(),
        logo: attr(extinf, "tvg-logo"),
        tvgId: attr(extinf, "tvg-id"),
      });
      extinf = "";
    }
  }
  return entries;
}

function categoryUrl(category) {
  return RELEASE + safeAsset(category);
}

module.exports = {
  RELEASE,
  INDEX_URL,
  queryOf,
  json,
  authorized,
  getIndex,
  categoryType,
  getCategory,
  parseM3u,
  categoryUrl,
};
