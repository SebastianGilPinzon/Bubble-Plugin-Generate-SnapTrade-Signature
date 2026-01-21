async function(properties, context) {
const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");
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
const options = { hostname: u.hostname, path: u.pathname + u.search, method: "GET", headers: headers };
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
return String(str ?? "").replace(/\|/g, "-").replace(/\r?\n/g, " ").trim();
}
function toNumber(v) {
const n = Number(v);
return Number.isFinite(n) ? n : 0;
}
function extractSymbol(activity) {
if (!activity.symbol) return "";
const s = activity.symbol;
return sanitize(s.symbol || s.raw_symbol || "");
}
function formatDate(dateStr) {
if (!dateStr) return "";
return sanitize(dateStr);
}
const consumerKey = (properties.consumerkey || "").trim();
const clientId = (properties.clientid || "").trim();
const userId = (properties.userid || "").trim();
const userSecret = (properties.usersecret || "").trim();
const accountId = (properties.accountid || "").trim();
const startDate = (properties.startdate || "").trim();
if (!consumerKey) return { success: false, error_message: "consumerKey is required", activities_json: null, activities_lines: "", activities_count: 0 };
if (!clientId) return { success: false, error_message: "clientId is required", activities_json: null, activities_lines: "", activities_count: 0 };
if (!userId) return { success: false, error_message: "userId is required", activities_json: null, activities_lines: "", activities_count: 0 };
if (!userSecret) return { success: false, error_message: "userSecret is required", activities_json: null, activities_lines: "", activities_count: 0 };
if (!accountId) return { success: false, error_message: "accountId is required", activities_json: null, activities_lines: "", activities_count: 0 };
const path = "/api/v1/accounts/" + accountId + "/activities";
const limit = 1000;
let offset = 0;
let allActivities = [];
let hasMore = true;
try {
while (hasMore) {
const timestamp = Math.floor(Date.now() / 1000);
let queryParams = "clientId=" + encodeURIComponent(clientId) + "&userId=" + encodeURIComponent(userId) + "&userSecret=" + encodeURIComponent(userSecret) + "&timestamp=" + encodeURIComponent(timestamp) + "&limit=" + limit + "&offset=" + offset;
if (startDate) queryParams += "&startDate=" + encodeURIComponent(startDate);
const signature = generateSignature(consumerKey, path, queryParams, null);
const url = "https://api.snaptrade.com" + path + "?" + queryParams;
const headers = { "Signature": signature, "Content-Type": "application/json" };
const response = await httpsGet(url, headers);
if (response.statusCode !== 200) {
let errorMsg = "API returned status " + response.statusCode;
try { const parsedErr = JSON.parse(response.body); errorMsg = parsedErr.detail || parsedErr.message || errorMsg; } catch (e) {}
return { success: false, error_message: errorMsg, activities_json: null, activities_lines: "", activities_count: 0 };
}
let parsed;
try { parsed = JSON.parse(response.body); } catch (e) {
return { success: false, error_message: "Invalid JSON response", activities_json: null, activities_lines: "", activities_count: 0 };
}
const activities = Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
allActivities = allActivities.concat(activities);
const pagination = parsed.pagination;
if (pagination && pagination.total > offset + activities.length) {
offset += limit;
} else {
hasMore = false;
}
if (activities.length < limit) hasMore = false;
}
const lines = allActivities.map((a) => {
const activityId = sanitize(a.id || "");
const type = sanitize(a.type || "");
const tradeDate = formatDate(a.trade_date);
const settlementDate = formatDate(a.settlement_date);
const amount = toNumber(a.amount);
const price = toNumber(a.price);
const units = toNumber(a.units);
const fee = toNumber(a.fee);
const symbol = extractSymbol(a);
const currencyCode = sanitize(a.currency ? a.currency.code : "USD");
const description = sanitize(a.description || "");
const externalRefId = sanitize(a.external_reference_id || "");
const rawJson = "";
return activityId + "|" + type + "|" + tradeDate + "|" + settlementDate + "|" + amount + "|" + price + "|" + units + "|" + fee + "|" + symbol + "|" + currencyCode + "|" + description + "|" + externalRefId + "|" + rawJson;
});
return { success: true, error_message: null, activities_json: JSON.stringify(allActivities), activities_lines: lines.length > 0 ? lines.join("\n") : "", activities_count: allActivities.length };
} catch (error) {
return { success: false, error_message: error.message || "Unknown error", activities_json: null, activities_lines: "", activities_count: 0 };
}
}