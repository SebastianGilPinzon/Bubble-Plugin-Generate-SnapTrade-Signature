async function(properties, context) {
  const crypto = require("crypto");
  const https = require("https");

  function stableStringify(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }

  function generateSignature(consumerKey, path, query, content) {
    const sigObject = { content: content, path: path, query: query };
    const sigContent = stableStringify(sigObject);
    return crypto.createHmac("sha256", consumerKey).update(sigContent).digest("base64");
  }

  function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: headers
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      });

      req.on("error", reject);
      req.end();
    });
  }

  function sanitize(str) {
    return String(str ?? "")
      .replace(/\|/g, "-")
      .replace(/\r?\n/g, " ")
      .trim();
  }

  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function pick(obj, paths, fallback) {
    for (const p of paths) {
      const parts = p.split(".");
      let cur = obj;
      let ok = true;
      for (const part of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
        else { ok = false; break; }
      }
      if (ok && cur !== undefined && cur !== null) return cur;
    }
    return fallback;
  }

  function extractSymbol(pos) {
    return sanitize(
      pick(pos, [
        "symbol",
        "symbol.symbol",
        "symbol.ticker",
        "security.symbol",
        "security.ticker",
        "instrument.symbol",
        "instrument.ticker",
        "ticker"
      ], "")
    );
  }

  const consumerKey = (properties.consumerkey || "").trim();
  const clientId = (properties.clientid || "").trim();
  const userId = (properties.userid || "").trim();
  const userSecret = (properties.usersecret || "").trim();
  const accountId = (properties.accountid || "").trim();

  if (!consumerKey) return { success: false, error_message: "consumerKey is required", positions_json: null, positions_lines: "", positions_count: 0 };
  if (!clientId) return { success: false, error_message: "clientId is required", positions_json: null, positions_lines: "", positions_count: 0 };
  if (!userId) return { success: false, error_message: "userId is required", positions_json: null, positions_lines: "", positions_count: 0 };
  if (!userSecret) return { success: false, error_message: "userSecret is required", positions_json: null, positions_lines: "", positions_count: 0 };
  if (!accountId) return { success: false, error_message: "accountId is required", positions_json: null, positions_lines: "", positions_count: 0 };

  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v1/accounts/" + accountId + "/positions";

  const query =
    "clientId=" + encodeURIComponent(clientId) +
    "&userId=" + encodeURIComponent(userId) +
    "&userSecret=" + encodeURIComponent(userSecret) +
    "&timestamp=" + encodeURIComponent(timestamp);

  // GET => content MUST be null
  const signature = generateSignature(consumerKey, path, query, null);

  const url = "https://api.snaptrade.com" + path + "?" + query;
  const headers = { "Signature": signature, "Content-Type": "application/json" };

  try {
    const response = await httpsGet(url, headers);

    if (response.statusCode !== 200) {
      let errorMsg = "API returned status " + response.statusCode;
      try {
        const parsedErr = JSON.parse(response.body);
        errorMsg = parsedErr.detail || parsedErr.message || errorMsg;
      } catch (e) {}
      return { success: false, error_message: errorMsg, positions_json: null, positions_lines: "", positions_count: 0 };
    }

    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch (e) {
      return { success: false, error_message: "Invalid JSON response from SnapTrade", positions_json: null, positions_lines: "", positions_count: 0 };
    }

    const positions = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed?.positions) ? parsed.positions : []));

    const lines = positions.map((p) => {
      const symbol = extractSymbol(p);
      const quantity = toNumber(pick(p, ["quantity", "units", "shares", "position", "amount"], 0));
      const marketValue = toNumber(pick(p, ["market_value", "marketValue", "market_value_usd", "marketValueUsd", "value"], 0));
      const price = toNumber(pick(p, ["price", "last_price", "lastPrice", "price_per_share", "pricePerShare"], 0));
      const currencyCode = sanitize(pick(p, ["currency.code", "currency_code", "currencyCode"], "USD"));
      const rawJson = sanitize(JSON.stringify(p));

      return sanitize(symbol) + "|" + quantity + "|" + marketValue + "|" + price + "|" + currencyCode + "|" + rawJson;
    });

    return {
      success: true,
      error_message: null,
      positions_json: JSON.stringify(parsed),
      positions_lines: lines.length > 0 ? lines.join("\n") : "",
      positions_count: positions.length
    };
  } catch (error) {
    return {
      success: false,
      error_message: error?.message || "Unknown error",
      positions_json: null,
      positions_lines: "",
      positions_count: 0
    };
  }
}
