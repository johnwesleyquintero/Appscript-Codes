// =========================
// MAIN
// =========================

/**
 * Refreshes the PPC_Insights tab with campaign metrics,
 * targeting summary, placement summary, and diagnostics.
 *
 * Required tabs (exact names):
 *   - PPC_Insights
 *   - Sponsored_Products_Campaign_report
 *   - Sponsored_Products_Targeting_re
 *   - Sponsored_Products_Placement_re
 */
function refreshPPCInsights() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const insightsSheet  = ss.getSheetByName("PPC_Insights");
  const campaignSheet  = ss.getSheetByName("Sponsored_Products_Campaign_report");
  const targetingSheet = ss.getSheetByName("Sponsored_Products_Targeting_re");
  const placementSheet = ss.getSheetByName("Sponsored_Products_Placement_re");

  // Guard: fail fast with a clear message if any tab is missing
  const missing = [
    !insightsSheet  && "PPC_Insights",
    !campaignSheet  && "Sponsored_Products_Campaign_report",
    !targetingSheet && "Sponsored_Products_Targeting_re",
    !placementSheet && "Sponsored_Products_Placement_re",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error("Missing tab(s): " + missing.join(", "));
  }

  insightsSheet.clearContents();

  // Collect all output rows in memory, write to sheet once at the end
  const output = [];

  // =========================
  // HEADER
  // =========================
  output.push(["PPC INSIGHTS V2"]);
  output.push(["Generated: " + new Date()]);
  output.push([""]);

  // =========================
  // CAMPAIGN SUMMARY
  // =========================
  const cData    = campaignSheet.getDataRange().getValues();
  // Trim all headers to avoid trailing-space mismatches from Amazon exports
  const cHeaders = cData[0].map(h => String(h).trim());

  const cImp    = cHeaders.indexOf("Impressions");
  const cClicks = cHeaders.indexOf("Clicks");
  const cSpend  = cHeaders.indexOf("Spend");
  const cOrders = cHeaders.indexOf("7 Day Total Orders (#)");
  const cSales  = cHeaders.indexOf("7 Day Total Sales");

  let impressions = 0, clicks = 0, spend = 0, orders = 0, sales = 0;

  for (let i = 1; i < cData.length; i++) {
    impressions += Number(cData[i][cImp])    || 0;
    clicks      += Number(cData[i][cClicks]) || 0;
    spend       += parseMoney(cData[i][cSpend]);
    orders      += Number(cData[i][cOrders]) || 0;
    sales       += parseMoney(cData[i][cSales]);
  }

  const ctr  = impressions ? (clicks / impressions) * 100 : 0;
  const cvr  = clicks      ? (orders / clicks)      * 100 : 0;
  const acos = sales       ? (spend  / sales)        * 100 : 0;
  const roas = spend       ? (sales  / spend)              : 0;

  output.push(["METRICS"]);
  output.push(["Metric", "Value"]);
  output.push(["Impressions", impressions]);
  output.push(["Clicks",      clicks]);
  output.push(["Orders",      orders]);
  output.push(["Sales",       sales]);
  output.push(["Spend",       spend]);
  output.push(["CTR %",       ctr.toFixed(2)]);
  output.push(["CVR %",       cvr.toFixed(2)]);
  output.push(["ACOS %",      acos.toFixed(2)]);
  output.push(["ROAS",        roas.toFixed(2)]);
  output.push([""]);
  output.push([""]);

  // =========================
  // TARGETING (NORMALIZED)
  // =========================
  const tData    = targetingSheet.getDataRange().getValues();
  const tHeaders = tData[0].map(h => String(h).trim());

  const tKey = tHeaders.indexOf("Targeting");
  const tImp = tHeaders.indexOf("Impressions");
  const tClk = tHeaders.indexOf("Clicks");

  const tMap = {};

  for (let i = 1; i < tData.length; i++) {
    const key = tData[i][tKey];
    if (!key) continue;
    if (!tMap[key]) tMap[key] = { imp: 0, clk: 0 };
    tMap[key].imp += Number(tData[i][tImp]) || 0;
    tMap[key].clk += Number(tData[i][tClk]) || 0;
  }

  output.push(["TARGETING SUMMARY"]);
  output.push(["Targeting", "Impressions", "Clicks", "Tag"]);

  for (const key in tMap) {
    const clk = tMap[key].clk;
    const imp = tMap[key].imp;
    output.push([key, imp, clk, tagPerformance(clk, 0, 0)]);
    // ^ V1: click-signal only. Replace 0s with real orders/roas for V2.
  }

  output.push([""]);
  output.push([""]);

  // =========================
  // PLACEMENT (NORMALIZED)
  // =========================
  const pData    = placementSheet.getDataRange().getValues();
  const pHeaders = pData[0].map(h => String(h).trim());

  const pKey = pHeaders.indexOf("Placement");
  const pImp = pHeaders.indexOf("Impressions");
  const pClk = pHeaders.indexOf("Clicks");

  const pMap = {};

  for (let i = 1; i < pData.length; i++) {
    const key = pData[i][pKey];
    if (!key) continue;
    if (!pMap[key]) pMap[key] = { imp: 0, clk: 0 };
    pMap[key].imp += Number(pData[i][pImp]) || 0;
    pMap[key].clk += Number(pData[i][pClk]) || 0;
  }

  output.push(["PLACEMENT SUMMARY"]);
  output.push(["Placement", "Impressions", "Clicks", "Tag"]);

  for (const key in pMap) {
    const clk = pMap[key].clk;
    const imp = pMap[key].imp;
    output.push([key, imp, clk, tagPerformance(clk, 0, 0)]);
    // ^ V1: click-signal only. Replace 0s with real orders/roas for V2.
  }

  output.push([""]);
  output.push([""]);

  // =========================
  // DIAGNOSTICS
  // =========================
  output.push(["DIAGNOSTICS"]);
  if (ctr    <  0.5) output.push(["⚠ CTR LOW"]);
  if (cvr    > 10)   output.push(["✅ CVR STRONG"]);
  if (roas   >  2)   output.push(["✅ ROAS PROFITABLE"]);
  if (orders <= 2)   output.push(["⚠ LOW DATA SAMPLE"]);

  // =========================
  // SINGLE WRITE — much faster than row-by-row
  // =========================
  insightsSheet
    .getRange(1, 1, output.length, 4)
    .setValues(output.map(r => {
      // Pad each row to 4 columns so the range is rectangular
      while (r.length < 4) r.push("");
      return r;
    }));

  SpreadsheetApp.getUi().alert("✅ PPC Insights refreshed!");
}

// =========================
// HELPERS
// =========================

/**
 * Tags a targeting/placement row as WIN, NEUTRAL, or LOSE.
 *
 * V1: behavior-based (clicks + orders). ACOS dropped — not available at
 *     targeting level until search-term attribution is wired in (V2).
 *
 * 🟢 WIN     — ≥1 order OR ROAS ≥ 2 (confirmed revenue signal)
 * 🔴 LOSE    — ≥10 clicks AND 0 orders (clear waste threshold)
 * 🟡 NEUTRAL — everything else (exploration / insufficient data)
 *
 * Why ≥10 clicks for LOSE:
 *   Amazon traffic buckets (close-match, rest-of-search, etc.) are mixed-intent
 *   containers, not isolated experiments. A low-click count is insufficient
 *   signal to call waste — it mislabels top-funnel exploration as failure.
 *
 * @param {number} clicks  - Total clicks for this row
 * @param {number} orders  - Total orders attributed (0 in V1)
 * @param {number} roas    - Return on ad spend (0 in V1)
 * @returns {string} Emoji tag: 🟢 WIN / 🔴 LOSE / 🟡 NEUTRAL
 */
function tagPerformance(clicks, orders, roas) {
  if (orders >= 1 || roas >= 2)        return "🟢 WIN";
  if (clicks >= 10 && orders === 0)    return "🔴 LOSE";
  return "🟡 NEUTRAL";
}

/**
 * Strips $ signs and commas from Amazon money strings and returns a number.
 * e.g. "$1,234.56" → 1234.56
 */
function parseMoney(value) {
  if (!value) return 0;
  return Number(String(value).replace(/\$/g, "").replace(/,/g, "")) || 0;
}

// =========================
// UI
// =========================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ PPC OPS")
    .addItem("🔄 Run PPC Insights", "refreshPPCInsights")
    .addToUi();
}