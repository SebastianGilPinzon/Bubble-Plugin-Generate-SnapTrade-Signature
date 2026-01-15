function(properties, context) {
  const crypto = require("crypto");

  function stablestringify(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value !== "object") return JSON.stringify(value);

    if (Array.isArray(value)) {
      return "[" + value.map(stablestringify).join(",") + "]";
    }

    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys
        .map(function(k) {
          return JSON.stringify(k) + ":" + stablestringify(value[k]);
        })
        .join(",") +
      "}"
    );
  }

  const raw = (properties.contentjson || "").trim();
  let content = {};
  if (raw) {
    try {
      content = JSON.parse(raw);
    } catch (e) {
      throw new Error("contentjson must be valid json");
    }
  }

  const path = (properties.path || "").trim();
  const query = (properties.query || "").trim(); // allow empty

  if (!path) throw new Error("path is required");

  const consumerkey_raw = (properties.consumerKey || "").trim();
  if (!consumerkey_raw) throw new Error("consumerkey is required");

  const sigobject = {
    content: content,
    path: path,
    query: query
  };

  const sigcontent = stablestringify(sigobject);

  const signature = crypto
    .createHmac("sha256", consumerkey_raw)
    .update(sigcontent)
    .digest("base64");

  return { signature: signature };
}
