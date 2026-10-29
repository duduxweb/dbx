const {
  queryOf, authorized, getIndex, getCategory, parseM3u,
} = require("../lib/iptv");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const query = queryOf(req);
  if (!authorized(query)) return res.status(401).send("Unauthorized");

  const streamText = (query.get("stream") || "").replace(/\.ts$/i, "");
  const streamId = Number(streamText);
  const categoryId = Math.floor(streamId / 1000000);
  const entryIndex = streamId % 1000000 - 1;
  if (!Number.isSafeInteger(streamId) || categoryId < 1 || entryIndex < 0) {
    return res.status(404).send("Stream not found");
  }

  try {
    const index = await getIndex();
    const category = index.categories.find((item) => Number(item.id) === categoryId);
    if (!category) return res.status(404).send("Stream not found");
    const entries = parseM3u(await getCategory(category));
    const entry = entries[entryIndex];
    if (!entry || !/^https?:\/\//i.test(entry.url)) {
      return res.status(404).send("Stream not found");
    }
    res.setHeader("cache-control", "no-store");
    return res.redirect(302, entry.url);
  } catch (error) {
    return res.status(502).send(String(error.message || error));
  }
};
