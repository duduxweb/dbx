const RELEASE = "https://github.com/duduxweb/dbx/releases/download/playlist-latest/";
const INDEX_URL = RELEASE + "categories-index.json";
const EXTINF_ATTR = (line, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(escaped + '="([^"]*)"', "i"));
  return match ? match[1] : "";
};

async function readText(url) {
  const response = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("Playlist asset unavailable: " + response.status);
  return response.text();
}

async function getIndex() {
  const response = await fetch(INDEX_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("Category index unavailable: " + response.status);
  return response.json();
}

function parseM3u(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let extinf = "";
  let group = "";
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      extinf = line;
      group = EXTINF_ATTR(line, "group-title");
    } else if (extinf && line.trim() && !line.startsWith("#")) {
      const comma = extinf.lastIndexOf(",");
      result.push({
        name: comma >= 0 ? extinf.slice(comma + 1).trim() : "Sem nome",
        url: line.trim(),
        logo: EXTINF_ATTR(extinf, "tvg-logo"),
        tvg_id: EXTINF_ATTR(extinf, "tvg-id"),
        group,
      });
      extinf = "";
      group = "";
    }
  }
  return result;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}

function authorized(url, env) {
  const username = url.searchParams.get("username") || "";
  const password = url.searchParams.get("password") || "";
  return Boolean(env.API_USERNAME && env.API_PASSWORD &&
    username === env.API_USERNAME && password === env.API_PASSWORD);
}

function categoryType(category) {
  return /filme|movie|serie|s[eé]rie|vod/i.test(category.name) ? "vod" : "live";
}

async function loadCategory(category) {
  const safeAsset = String(category.asset || "");
  if (!/^category-[a-z0-9-]+\.m3u$/.test(safeAsset)) throw new Error("Invalid category asset");
  return parseM3u(await readText(RELEASE + safeAsset));
}

async function getCategoryStreams(categories, selectedId, kind) {
  const selected = categories.filter((category) =>
    (!selectedId || String(category.id) === selectedId) &&
    categoryType(category) === kind
  );
  const output = [];
  for (const category of selected) {
    const entries = await loadCategory(category);
    entries.forEach((entry, index) => {
      const streamId = category.id * 1000000 + index + 1;
      output.push({
        num: output.length + 1,
        name: entry.name,
        stream_type: kind,
        stream_id: streamId,
        stream_icon: entry.logo,
        epg_channel_id: entry.tvg_id,
        category_id: String(category.id),
        category_ids: [Number(category.id)],
        direct_source: entry.url,
        is_adult: 0,
      });
    });
  }
  return output;
}

async function handlePlayerApi(url, env) {
  if (!authorized(url, env)) return json({ user_info: { auth: 0, status: "Disabled" } }, 401);
  const index = await getIndex();
  const categories = index.categories || [];
  const action = url.searchParams.get("action") || "";

  if (!action) {
    return json({
      user_info: {
        username: env.API_USERNAME,
        status: "Active",
        auth: 1,
        exp_date: null,
        is_trial: "0",
        active_cons: "0",
        max_connections: "1",
        allowed_output_formats: ["m3u8", "ts"],
      },
      server_info: { url: new URL(url).host, port: "443", https_port: "443", server_protocol: "https", timezone: "UTC" },
    });
  }

  if (action === "get_live_categories" || action === "get_vod_categories") {
    const kind = action === "get_vod_categories" ? "vod" : "live";
    return json(categories.filter((category) => categoryType(category) === kind)
      .map((category) => ({ category_id: String(category.id), category_name: category.name, parent_id: 0 })));
  }

  if (action === "get_live_streams" || action === "get_vod_streams") {
    const kind = action === "get_vod_streams" ? "vod" : "live";
    try {
      const streams = await getCategoryStreams(categories, url.searchParams.get("category_id") || "", kind);
      return json(streams);
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  }

  if (action === "get_live_info" || action === "get_vod_info") {
    return json({});
  }
  return json({ error: "Unsupported action" }, 400);
}

async function handleM3u(url, env) {
  if (!authorized(url, env)) return new Response("Unauthorized", { status: 401 });
  const index = await getIndex();
  const categoryId = url.searchParams.get("category_id");
  const category = categoryId
    ? (index.categories || []).find((item) => String(item.id) === categoryId)
    : null;
  const asset = category ? category.asset : "playlist.m3u";
  const body = await readText(RELEASE + asset);
  return new Response(body, {
    headers: {
      "content-type": "audio/x-mpegurl; charset=utf-8",
      "content-disposition": 'inline; filename="playlist.m3u"',
      "cache-control": "public, max-age=300",
    },
  });
}

async function handleStream(path, env) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) return new Response("Not found", { status: 404 });
  if (!env.API_USERNAME || !env.API_PASSWORD ||
      parts[1] !== env.API_USERNAME || parts[2] !== env.API_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }
  const idText = parts[3] ? parts[3].replace(/\.ts$/, "") : "";
  const streamId = Number(idText);
  const categoryId = Math.floor(streamId / 1000000);
  const entryIndex = streamId % 1000000 - 1;
  if (!Number.isSafeInteger(streamId) || categoryId < 1 || entryIndex < 0) {
    return new Response("Not found", { status: 404 });
  }
  const index = await getIndex();
  const category = (index.categories || []).find((item) => Number(item.id) === categoryId);
  if (!category) return new Response("Not found", { status: 404 });
  const entries = await loadCategory(category);
  const entry = entries[entryIndex];
  if (!entry || !/^https?:\/\//i.test(entry.url)) return new Response("Not found", { status: 404 });
  return Response.redirect(entry.url, 302);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
    }
    try {
      if (url.pathname.endsWith("/player_api.php")) return await handlePlayerApi(url, env);
      if (url.pathname.endsWith("/get.php")) return await handleM3u(url, env);
      if (url.pathname.startsWith("/live/")) return await handleStream(url.pathname, env);
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ service: "DBX IPTV API", status: "prepared", format: "Xtream-compatible subset" });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  },
};
