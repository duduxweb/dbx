const {
  queryOf, json, authorized, getIndex, categoryType, getCategory, parseM3u,
} = require("../lib/iptv");

async function loadAllLiveStreams(categories) {
  const liveCategories = categories.filter((category) => categoryType(category) === "live");
  const results = new Array(liveCategories.length);
  let nextIndex = 0;
  const workerCount = Math.min(24, liveCategories.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const categoryIndex = nextIndex++;
      if (categoryIndex >= liveCategories.length) return;

      const category = liveCategories[categoryIndex];
      let entries;
      try {
        entries = parseM3u(await getCategory(category));
      } catch (error) {
        // Some categories remain in the index after their playlist asset expires.
        if (/404/.test(String(error.message || error))) {
          results[categoryIndex] = [];
          continue;
        }
        throw error;
      }
      results[categoryIndex] = entries.map((entry, index) => ({
        name: entry.name,
        stream_type: "live",
        stream_id: Number(category.id) * 1000000 + index + 1,
        stream_icon: entry.logo,
        epg_channel_id: entry.tvgId,
        category_id: String(category.id),
        category_ids: [Number(category.id)],
        direct_source: entry.url,
        is_adult: 0,
      }));
    }
  }));

  return results.flat().map((stream, index) => ({ ...stream, num: index + 1 }));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const query = queryOf(req);
  if (!authorized(query)) return json(res, 401, { user_info: { auth: 0, status: "Disabled" } });

  try {
    const index = await getIndex();
    const categories = index.categories;
    const action = query.get("action") || "";

    if (!action) {
      return json(res, 200, {
        user_info: {
          username: process.env.API_USERNAME,
          status: "Active",
          auth: 1,
          exp_date: null,
          is_trial: "0",
          active_cons: "0",
          max_connections: "1",
          allowed_output_formats: ["m3u8", "ts"],
        },
        server_info: {
          url: req.headers.host || "",
          port: "443",
          https_port: "443",
          server_protocol: "https",
          timezone: "UTC",
        },
      });
    }

    if (action === "get_live_categories" || action === "get_vod_categories") {
      const kind = action === "get_vod_categories" ? "vod" : "live";
      const result = categories
        .filter((category) => categoryType(category) === kind)
        .map((category) => ({
          category_id: String(category.id),
          category_name: category.name,
          parent_id: 0,
        }));
      return json(res, 200, result);
    }

    if (action === "get_live_streams" || action === "get_vod_streams") {
      const kind = action === "get_vod_streams" ? "vod" : "live";
      const categoryId = query.get("category_id") || "";
      let streams;

      if (!categoryId && kind === "live") {
        streams = await loadAllLiveStreams(categories);
      } else {
        if (!categoryId) {
          return json(res, 400, {
            error: "Informe category_id para consultar os canais desta categoria.",
          });
        }
        const category = categories.find((item) =>
          String(item.id) === categoryId && categoryType(item) === kind
        );
        if (!category) return json(res, 404, { error: "Categoria não encontrada" });

        const entries = parseM3u(await getCategory(category));
        streams = entries.map((entry, index) => ({
          num: index + 1,
          name: entry.name,
          stream_type: kind,
          stream_id: Number(category.id) * 1000000 + index + 1,
          stream_icon: entry.logo,
          epg_channel_id: entry.tvgId,
          category_id: String(category.id),
          category_ids: [Number(category.id)],
          direct_source: entry.url,
          is_adult: 0,
        }));
      }

      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=300");

      // Stream Xtream arrays in chunks; large VOD categories can exceed 4.5 MB.
      res.statusCode = 200;
      if (typeof res.flushHeaders === "function") res.flushHeaders();
      let chunk = "[";
      for (let index = 0; index < streams.length; index++) {
        if (index > 0) chunk += ",";
        chunk += JSON.stringify(streams[index]);
        if (chunk.length >= 64_000) {
          if (!res.write(chunk)) await new Promise((resolve) => res.once("drain", resolve));
          chunk = "";
        }
      }
      chunk += "]";
      if (!res.write(chunk)) await new Promise((resolve) => res.once("drain", resolve));
      return res.end();
    }

    if (action === "get_live_info" || action === "get_vod_info") return json(res, 200, {});
    return json(res, 400, { error: "Ação não suportada" });
  } catch (error) {
    return json(res, 502, { error: String(error.message || error) });
  }
};
