const { queryOf, authorized, getIndex, categoryUrl, RELEASE } = require("../lib/iptv");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const query = queryOf(req);
  if (!authorized(query)) return res.status(401).send("Unauthorized");

  try {
    const index = await getIndex();
    const categoryId = query.get("category_id");
    let target = RELEASE + "playlist.m3u";
    if (categoryId) {
      const category = index.categories.find((item) => String(item.id) === categoryId);
      if (!category) return res.status(404).send("Categoria não encontrada");
      target = categoryUrl(category);
    }
    res.setHeader("cache-control", "no-store");
    return res.redirect(302, target);
  } catch (error) {
    return res.status(502).send(String(error.message || error));
  }
};
