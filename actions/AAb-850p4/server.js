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
        const sigObject = { content, path, query };
        const sigContent = stableStringify(sigObject);
        return crypto.createHmac("sha256", consumerKey).update(sigContent).digest("base64");
    }
    
    function httpsGet(url, headers) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: "GET",
                headers: headers
            };
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
            });
            req.on("error", reject);
            req.end();
        });
    }
    
    function sanitize(str) {
        return (str || "").replace(/\|/g, "-").replace(/\n/g, " ");
    }
    
    const consumerKey = (properties.consumerkey || "").trim();
    const clientId = (properties.clientid || "").trim();
    const userId = (properties.userid || "").trim();
    const userSecret = (properties.usersecret || "").trim();
    const accountId = (properties.accountid || "").trim();
    
    if (!consumerKey) return { success: false, error_message: "consumerKey is required", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    if (!clientId) return { success: false, error_message: "clientId is required", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    if (!userId) return { success: false, error_message: "userId is required", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    if (!userSecret) return { success: false, error_message: "userSecret is required", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    if (!accountId) return { success: false, error_message: "accountId is required", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    
    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v1/accounts/" + accountId + "/balances";
    const query = "clientId=" + clientId + "&userId=" + userId + "&userSecret=" + userSecret + "&timestamp=" + timestamp;
    const signature = generateSignature(consumerKey, path, query, null);
    
    const url = "https://api.snaptrade.com" + path + "?" + query;
    const headers = { "Signature": signature, "Content-Type": "application/json" };
    
    try {
        const response = await httpsGet(url, headers);
        if (response.statusCode === 200) {
            const balances = JSON.parse(response.body);
            const firstBalance = balances[0] || {};
            
            const lines = balances.map(function(b) {
                var code = sanitize(b.currency ? b.currency.code : "USD");
                var name = sanitize(b.currency ? b.currency.name : "US Dollar");
                var currencyId = b.currency ? b.currency.id : "";
                var cash = b.cash || 0;
                var buyingPower = b.buying_power || 0;
                return code + "|" + name + "|" + cash + "|" + buyingPower + "|" + currencyId;
            });
            
            return {
                success: true,
                error_message: null,
                balances_json: JSON.stringify(balances),
                balances_lines: lines.length > 0 ? lines.join("\n") : "",
                balances_count: balances.length,
                cash: firstBalance.cash || 0,
                buying_power: firstBalance.buying_power || 0,
                currency_code: firstBalance.currency ? firstBalance.currency.code : "USD"
            };
        } else {
            var errorMsg = "API returned status " + response.statusCode;
            try { errorMsg = JSON.parse(response.body).detail || errorMsg; } catch (e) {}
            return { success: false, error_message: errorMsg, balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
        }
    } catch (error) {
        return { success: false, error_message: error.message || "Unknown error", balances_json: null, balances_lines: "", balances_count: 0, cash: 0, buying_power: 0, currency_code: null };
    }
}