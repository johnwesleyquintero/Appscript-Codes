// =========================
// MAIN
// =========================

/**
 * SYSTEM CONFIGURATION
 * Centralized rules to drive the PPC Brain.
 */
const PPC_RULES = {
  WIN_ROAS: 2.0,            // Minimum ROAS to be considered a "Win"
  WASTE_CLICKS: 10,         // Clicks with 0 orders = Waste
  MIN_CLICKS_FOR_SIGNAL: 2, // Minimum clicks before we trust a "Win"
  MIN_SPEND_FOR_SIGNAL: 2,  // Minimum spend before we trust a "Win"
  HIGH_IMP_THRESHOLD: 1000, // Impressions with 0 clicks = Creative failure
  TOP_ACTION_COUNT: 5,      // How many priority actions to show
  WASTE_SPEND_THRESHOLD: 5, // Spend threshold for search term alerts
  CONF_MED_CLICKS: 8,       // Clicks required for Medium confidence
  CONF_HIGH_CLICKS: 20      // Clicks required for High confidence
};

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

  const insightsSheet   = ss.getSheetByName("PPC_Insights");
  const campaignSheet   = ss.getSheetByName("Sponsored_Products_Campaign_report");
  const targetingSheet  = ss.getSheetByName("Sponsored_Products_Targeting_re");
  const placementSheet  = ss.getSheetByName("Sponsored_Products_Placement_re");
  const searchtermSheet = ss.getSheetByName("Sponsored_Products_Search_term_") || ss.getSheetByName("Sponsored_Products_Search_term_re");

  // Guard: fail fast with a clear message if any tab is missing
  const missing = [
    !insightsSheet   && "PPC_Insights",
    !campaignSheet   && "Sponsored_Products_Campaign_report",
    !targetingSheet  && "Sponsored_Products_Targeting_re",
    !placementSheet  && "Sponsored_Products_Placement_re",
    !searchtermSheet && "Sponsored_Products_Search_term_",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error("Missing tab(s): " + missing.join(", "));
  }

  insightsSheet.clearContents();

  // Collect all output rows in memory, write to sheet once at the end
  const wasteList = [];    // For Diagnostics
  let totalWasteSpend = 0;
  let scaleCount = 0;
  let cutCount = 0;
  let holdCount = 0;

  const priorityQueue = []; // Actions to be ranked by impact
  // Helper to validate headers
  const getIdx = (headers, col) => {
    const i = headers.indexOf(col);
    if (i === -1) throw new Error(`Column "${col}" not found. Check your Amazon export format.`);
    return i;
  };

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

  const cImp    = getIdx(cHeaders, "Impressions");
  const cClicks = getIdx(cHeaders, "Clicks");
  const cSpend  = getIdx(cHeaders, "Spend");
  const cOrders = getIdx(cHeaders, "7 Day Total Orders (#)");
  const cSales  = getIdx(cHeaders, "7 Day Total Sales");

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

  const tKey = getIdx(tHeaders, "Targeting");
  const tImp = getIdx(tHeaders, "Impressions");
  const tClk = getIdx(tHeaders, "Clicks");
  const tSpd = getIdx(tHeaders, "Spend");
  const tOrd = getIdx(tHeaders, "7 Day Total Orders (#)");
  const tSal = getIdx(tHeaders, "7 Day Total Sales");

  const tMap = {};

  for (let i = 1; i < tData.length; i++) {
    const key = tData[i][tKey];
    if (!key) continue;
    if (!tMap[key]) tMap[key] = { imp: 0, clk: 0, spd: 0, ord: 0, sal: 0 };
    tMap[key].imp += Number(tData[i][tImp])    || 0;
    tMap[key].clk += Number(tData[i][tClk])    || 0;
    tMap[key].spd += parseMoney(tData[i][tSpd]);
    tMap[key].ord += Number(tData[i][tOrd])    || 0;
    tMap[key].sal += parseMoney(tData[i][tSal]);
  }

  output.push(["TARGETING SUMMARY"]);
  output.push(["Targeting", "Impressions", "Clicks", "Tag", "Action"]);

  for (const key in tMap) {
    const { imp, clk, spd, ord, sal } = tMap[key];
    const roas = spd ? sal / spd : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: clk, 
      orders: ord, 
      roas, 
      impressions: imp, 
      spend: spd 
    });
    const action = getSuggestedAction(tag);
    const score = (sal * 2) - spd;

    // Decision Counting
    if (action === "PROTECT / SCALE") {
      scaleCount++;
      if (confidence !== "LOW") priorityQueue.push({ score, type: "SCALE", msg: `Target: ${key} (${ord} ord, ${confidence} conf)` });
    } else if (action === "NEGATE / PAUSE") {
      cutCount++;
      if (confidence !== "LOW") priorityQueue.push({ score, type: "CUT", msg: `Target: ${key} ($${spd.toFixed(2)} waste, ${confidence} conf)` });
    } else {
      holdCount++;
    }

    output.push([key, imp, clk, `${tag} [${confidence}]`, action]);
    if (ord === 0) totalWasteSpend += spd;
  }

  output.push([""]);
  output.push([""]);

  // =========================
  // PLACEMENT (NORMALIZED)
  // =========================
  const pData    = placementSheet.getDataRange().getValues();
  const pHeaders = pData[0].map(h => String(h).trim());

  const pKey = getIdx(pHeaders, "Placement");
  const pImp = getIdx(pHeaders, "Impressions");
  const pClk = getIdx(pHeaders, "Clicks");
  const pSpd = getIdx(pHeaders, "Spend");
  const pOrd = getIdx(pHeaders, "7 Day Total Orders (#)");
  const pSal = getIdx(pHeaders, "7 Day Total Sales");

  const pMap = {};

  for (let i = 1; i < pData.length; i++) {
    const key = pData[i][pKey];
    if (!key) continue;
    if (!pMap[key]) pMap[key] = { imp: 0, clk: 0, spd: 0, ord: 0, sal: 0 };
    pMap[key].imp += Number(pData[i][pImp])    || 0;
    pMap[key].clk += Number(pData[i][pClk])    || 0;
    pMap[key].spd += parseMoney(pData[i][pSpd]);
    pMap[key].ord += Number(pData[i][pOrd])    || 0;
    pMap[key].sal += parseMoney(pData[i][pSal]);
  }

  output.push(["PLACEMENT SUMMARY"]);
  output.push(["Placement", "Impressions", "Clicks", "Tag", "Action"]);

  for (const key in pMap) {
    const { imp, clk, spd, ord, sal } = pMap[key];
    const roas = spd ? sal / spd : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: clk, 
      orders: ord, 
      roas, 
      impressions: imp, 
      spend: spd 
    });
    const action = getSuggestedAction(tag);
    const score = (sal * 2) - spd;

    if (action === "PROTECT / SCALE") {
      scaleCount++;
      if (confidence !== "LOW") priorityQueue.push({ score, type: "SCALE", msg: `Placement: ${key} (${ord} ord, ${confidence} conf)` });
    } else if (action === "NEGATE / PAUSE") {
      cutCount++;
      if (confidence !== "LOW") priorityQueue.push({ score, type: "CUT", msg: `Placement: ${key} ($${spd.toFixed(2)} waste, ${confidence} conf)` });
    }

    output.push([key, imp, clk, `${tag} [${confidence}]`, action]);
  }

  output.push([""]);
  output.push([""]);

  // =========================
  // SEARCH TERM (PROFIT LAYER)
  // =========================
  const sData    = searchtermSheet.getDataRange().getValues();
  const sHeaders = sData[0].map(h => String(h).trim());
  
  const sKey = getIdx(sHeaders, "Customer Search Term");
  const sImp = getIdx(sHeaders, "Impressions");
  const sClk = getIdx(sHeaders, "Clicks");
  const sSpd = getIdx(sHeaders, "Spend");
  const sOrd = getIdx(sHeaders, "7 Day Total Orders (#)");
  const sSal = getIdx(sHeaders, "7 Day Total Sales");

  output.push(["TOP SEARCH TERMS (BY SPEND)"]);
  output.push(["Term", "Spend", "Orders", "Tag", "Action"]);

  // Sort search terms by spend to find waste/wins quickly
  const sortedST = sData.slice(1)
    .map(row => ({
      term: row[sKey],
      imp:  Number(row[sImp]) || 0,
      clk:  Number(row[sClk]) || 0,
      spd:  parseMoney(row[sSpd]),
      ord:  Number(row[sOrd]) || 0,
      sal:  parseMoney(row[sSal])
    }))
    .sort((a, b) => b.spd - a.spd)
    .slice(0, 15);

  sortedST.forEach(st => {
    const roas = st.spd ? st.sal / st.spd : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: st.clk, 
      orders: st.ord, 
      roas, 
      impressions: st.imp, 
      spend: st.spd 
    });
    const action = getSuggestedAction(tag);
    const score = (st.sal * 2) - st.spd;

    output.push([st.term, st.spd.toFixed(2), st.ord, `${tag} [${confidence}]`, action]);

    if (tag.includes("🔴") && confidence !== "LOW") {
       wasteList.push(st.term);
       if (st.spd > PPC_RULES.WASTE_SPEND_THRESHOLD) {
         priorityQueue.push({ score, type: "CUT", msg: `Term: ${st.term} ($${st.spd.toFixed(2)} waste, ${confidence} conf)` });
       }
    } else if (tag.includes("🟢") && confidence !== "LOW") {
      priorityQueue.push({ score, type: "SCALE", msg: `Term: ${st.term} (${st.ord} ord, ${confidence} conf)` });
    }
  });

  // =========================
  // DIAGNOSTICS
  // =========================
  output.push(["DIAGNOSTICS"]);
  if (ctr    <  0.5)  output.push(["⚠ CTR LOW"]);
  if (cvr    > 10)    output.push(["✅ CVR STRONG"]);
  if (roas   >  2)    output.push(["✅ ROAS PROFITABLE"]);
  if (orders <= 2)    output.push(["⚠ LOW DATA SAMPLE"]);

  const wastePct = spend ? (totalWasteSpend / spend) * 100 : 0;
  output.push([`💸 Waste: $${totalWasteSpend.toFixed(2)} (${wastePct.toFixed(1)}% of spend)`]);
  
  if (wasteList.length > 0) {
    output.push(["🚨 WASTE ALERT: Check " + wasteList.slice(0,3).join(", ") + "..."]);
  }

  // Prepend Executive Summary at the top of the output
  const totalDecisions = scaleCount + cutCount + holdCount;
  const holdPct = totalDecisions ? ((holdCount / totalDecisions) * 100).toFixed(0) : 0;

  // Rank priorities by financial impact (Sales for SCALE, Spend for CUT)
  const topActions = priorityQueue
    .sort((a, b) => b.score - a.score)
    .slice(0, PPC_RULES.TOP_ACTION_COUNT);

  const execHeader = [
    ["🔥 PRIORITY ACTIONS (TOP " + PPC_RULES.TOP_ACTION_COUNT + ")"],
    ...topActions.map(a => [
      (a.type === "SCALE" ? "🟢 " : "🔴 ") + a.msg
    ]),
    [""],
    ["DECISION SUMMARY"],
    [`🟢 SCALE: ${scaleCount} targets`],
    [`🔴 CUT: ${cutCount} targets`],
    [`🟡 HOLD: ${holdPct}% of inventory`],
    [""]
  ];
  output.unshift(...execHeader);

  output.push([""]);
  output.push([""]);

  // =========================
  // DELTA REPORT
  // NOTE: detectDeltas reads PPC_Tracker BEFORE logPPCSnapshot appends
  // the current run — so it always compares the two most recent prior runs.
  // =========================
  detectDeltas(ss, tMap, pMap).forEach(r => output.push(r));

  // =========================
  // SINGLE WRITE — much faster than row-by-row
  // =========================
  insightsSheet
    .getRange(1, 1, output.length, 5)
    .setValues(output.map(r => {
      // Pad each row to 5 columns so the range is rectangular
      while (r.length < 5) r.push("");
      return r;
    }));

  // Log a snapshot to PPC_Tracker for trend analysis
  logPPCSnapshot(ss, { impressions, clicks, orders, sales, spend, ctr, cvr, acos, roas });

  SpreadsheetApp.getUi().alert("✅ PPC Insights refreshed and snapshot logged!");
}

// =========================
// HELPERS
// =========================

/**
 * Tags a targeting/placement/search-term row as WIN, NEUTRAL, or LOSE.
 *
 * 🟢 WIN     — ≥1 order OR ROAS ≥ 2 (confirmed revenue signal)
 * 🔴 HIGH IMPRESSION NO CLICK — ≥1000 impressions AND 0 clicks (clear CTR failure)
 * 🔴 LOSE    — ≥10 clicks AND 0 orders (clear waste threshold)
 * 🟡 NEUTRAL — everything else (exploration / insufficient data)
 *
 * Why ≥10 clicks for LOSE:
 *   Amazon traffic buckets (close-match, rest-of-search, etc.) are mixed-intent
 *   containers, not isolated experiments. A low-click count is insufficient
 *   signal to call waste — it mislabels top-funnel exploration as failure.
 * 
 * @param {Object|number} a - Configuration object OR clicks (for positional calls)
 * @param {number} [b] - orders
 * @param {number} [c] - roas
 * @param {number} [d] - impressions
 * @param {number} [e] - spend
 * @returns {string} Emoji tag: 🟢 WIN / 🔴 HIGH IMPRESSION NO CLICK / 🔴 LOSE / 🟡 NEUTRAL
 */
function tagPerformance(a, b, c, d, e) {
  const clicks = (a && typeof a === "object") ? a.clicks : a;
  const orders = (a && typeof a === "object") ? a.orders : b;
  const roas = (a && typeof a === "object") ? a.roas : c;
  const impressions = (a && typeof a === "object") ? a.impressions : d;
  const spend = (a && typeof a === "object") ? a.spend : e;

  let tag = "🟡 NEUTRAL";
  // Signal check: Only call it a WIN if we have enough sample size
  const hasSignal = clicks >= PPC_RULES.MIN_CLICKS_FOR_SIGNAL && spend >= PPC_RULES.MIN_SPEND_FOR_SIGNAL;
  
  if (hasSignal && (orders >= 1 || roas >= PPC_RULES.WIN_ROAS)) {
    tag = "🟢 WIN";
  } else if (impressions >= PPC_RULES.HIGH_IMP_THRESHOLD && clicks === 0) {
    tag = "🔴 HIGH IMPRESSION NO CLICK";
  } else if (clicks >= PPC_RULES.WASTE_CLICKS && orders === 0) {
    tag = "🔴 LOSE";
  }

  let confidence = "LOW";
  if (clicks >= PPC_RULES.CONF_HIGH_CLICKS) {
    confidence = "HIGH";
  } else if (clicks >= PPC_RULES.CONF_MED_CLICKS) {
    confidence = "MED";
  }

  return { tag, confidence };
}

/**
 * Maps a performance tag to a concrete operational action.
 */
function getSuggestedAction(tag) {
  switch (tag) {
    case "🟢 WIN":                         return "PROTECT / SCALE";
    case "🔴 HIGH IMPRESSION NO CLICK":    return "REVISE CREATIVE/PRICE";
    case "🔴 LOSE":                        return "NEGATE / PAUSE";
    case "🟡 NEUTRAL":                     return "HOLD / MONITOR";
    default:                               return "N/A";
  }
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
// TRACKER
// =========================

/**
 * Appends a single timestamped metrics row to the PPC_Tracker sheet.
 * Auto-creates the sheet with headers if it doesn't exist yet.
 * Never overwrites — always appends. Safe to call on every run.
 *
 * Columns: Date | Impressions | Clicks | Orders | Sales | Spend
 *          | CTR% | CVR% | ACOS% | ROAS
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {Object} m - Metrics object from refreshPPCInsights
 */
function logPPCSnapshot(ss, m) {
  const TRACKER_TAB  = "PPC_Tracker";
  const HEADERS = [
    "Date", "Impressions", "Clicks", "Orders",
    "Sales", "Spend", "CTR %", "CVR %", "ACOS %", "ROAS"
  ];

  let tracker = ss.getSheetByName(TRACKER_TAB);

  // Auto-create sheet + freeze header row if it doesn't exist
  if (!tracker) {
    tracker = ss.insertSheet(TRACKER_TAB);
    tracker.appendRow(HEADERS);
    tracker.setFrozenRows(1);
    // Bold the header row
    tracker.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold");
  }

  tracker.appendRow([
    new Date(),
    m.impressions,
    m.clicks,
    m.orders,
    m.sales,
    m.spend,
    Number(m.ctr.toFixed(2)),
    Number(m.cvr.toFixed(2)),
    Number(m.acos.toFixed(2)),
    Number(m.roas.toFixed(2))
  ]);
}

// =========================
// DELTA DETECTION ENGINE
// =========================

/**
 * Compares the last two PPC_Tracker snapshots and returns an array of rows
 * describing metric deltas and layer attribution suspects.
 *
 * Call this BEFORE logPPCSnapshot so the current run is not yet in the tracker.
 *
 * Tracker column layout:
 *   0=Date, 1=Impressions, 2=Clicks, 3=Orders, 4=Sales,
 *   5=Spend, 6=CTR%, 7=CVR%, 8=ACOS%, 9=ROAS
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Object} tMap  - Targeting map  { key: { imp, clk } }
 * @param {Object} pMap  - Placement map  { key: { imp, clk } }
 * @returns {Array[]} rows to push into the output array
 */
function detectDeltas(ss, tMap, pMap) {
  const rows = [];
  rows.push(["DELTA REPORT"]);

  const tracker = ss.getSheetByName("PPC_Tracker");

  if (!tracker) {
    rows.push(["⚠ No tracker history yet — first snapshot logs today."]);
    return rows;
  }

  const data = tracker.getDataRange().getValues();

  // Need header + at least 2 data rows
  if (data.length < 3) {
    rows.push(["⚠ Need ≥2 snapshots to compute deltas — run again after your next data load."]);
    return rows;
  }

  const prev = data[data.length - 2]; // second-to-last snapshot
  const curr = data[data.length - 1]; // most recent snapshot

  // Format Date objects to readable strings
  const fmt = d => (d instanceof Date) ? d.toLocaleDateString() : String(d);
  rows.push(["Period", fmt(prev[0]) + " → " + fmt(curr[0])]);
  rows.push([""]);
  rows.push(["Metric", "Previous", "Current", "Δ Change", "Signal"]);

  const METRICS = [
    // { label, col, higherBetter (true/false/null=neutral), pctThreshold }
    { label: "ROAS",   col: 9, higherBetter: true,  pctThreshold: 10  },
    { label: "CTR %",  col: 6, higherBetter: true,  pctThreshold: 20  },
    { label: "CVR %",  col: 7, higherBetter: true,  pctThreshold: 20  },
    { label: "ACOS %", col: 8, higherBetter: false, pctThreshold: 10  },
    { label: "Spend",  col: 5, higherBetter: null,  pctThreshold: 15  },
    { label: "Orders", col: 3, higherBetter: true,  pctThreshold: null }, // use absolute diff
  ];

  for (const m of METRICS) {
    const p    = Number(prev[m.col]) || 0;
    const c    = Number(curr[m.col]) || 0;
    const diff = c - p;
    const pct  = p !== 0 ? (diff / p) * 100 : null;

    let signal = "—";

    if (m.pctThreshold === null) {
      // Absolute comparison (Orders)
      if (diff > 0)  signal = "✅ UP";
      if (diff < 0)  signal = "⚠ DOWN";
    } else if (pct !== null && Math.abs(pct) >= m.pctThreshold) {
      const improved = m.higherBetter === null ? null
                     : (m.higherBetter ? diff > 0 : diff < 0);
      if (improved === true)  signal = "✅ IMPROVED";
      if (improved === false) signal = "⚠ ALERT";
    }

    const changeStr = pct !== null
      ? (diff >= 0 ? "+" : "") + pct.toFixed(1) + "%"
      : (diff >= 0 ? "+" : "") + diff.toFixed(2);

    rows.push([m.label, p.toFixed(2), c.toFixed(2), changeStr, signal]);
  }

  // -------------------------
  // LAYER ATTRIBUTION
  // -------------------------
  rows.push([""]);
  rows.push(["LAYER ATTRIBUTION"]);
  rows.push(["If metrics shifted, check these first:"]);
  rows.push([""]);

  // Targeting suspects: highest-click entries (most likely to swing campaign metrics)
  const topTargeting = Object.entries(tMap)
    .sort(([, a], [, b]) => b.clk - a.clk)
    .slice(0, 3);

  rows.push(["🎯 Top targeting by clicks:"]);
  if (topTargeting.length) {
    for (const [key, val] of topTargeting) {
      const flag = val.clk >= 10 ? "⚠ investigate" : "";
      rows.push(["", key, val.clk + " clicks", flag]);
    }
  } else {
    rows.push(["", "No targeting data"]);
  }

  rows.push([""]);

  // Placement suspects: ranked by clicks
  const topPlacements = Object.entries(pMap)
    .sort(([, a], [, b]) => b.clk - a.clk)
    .slice(0, 3);

  rows.push(["📍 Top placements by clicks:"]);
  if (topPlacements.length) {
    for (const [key, val] of topPlacements) {
      const flag = val.clk >= 5 ? "⚠ check ACOS" : "";
      rows.push(["", key, val.clk + " clicks", flag]);
    }
  } else {
    rows.push(["", "No placement data"]);
  }

  return rows;
}

// =========================
// UI
// =========================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ PPC OPS")
    .addItem("🔄 Run PPC Insights",   "refreshPPCInsights")
    .addSeparator()
    .addItem("📸 Log Snapshot Only",  "logSnapshotOnly")
    .addItem("🔍 Delta Check",          "runDeltaCheck")
    .addToUi();
}

/**
 * Standalone wrapper — logs a snapshot without re-rendering the Insights tab.
 * Useful for logging on a schedule without disturbing the current view.
 */
function logSnapshotOnly() {
  const ss             = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet  = ss.getSheetByName("Sponsored_Products_Campaign_report");

  if (!campaignSheet) {
    throw new Error("Missing tab: Sponsored_Products_Campaign_report");
  }

  const cData    = campaignSheet.getDataRange().getValues();
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

  logPPCSnapshot(ss, { impressions, clicks, orders, sales, spend, ctr, cvr, acos, roas });

  SpreadsheetApp.getUi().alert("📸 Snapshot logged to PPC_Tracker!");
}

/**
 * Runs the Delta Detection logic independently and displays the results in a UI Alert.
 * This satisfies the menu item "🔍 Delta Check".
 */
function runDeltaCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetingSheet = ss.getSheetByName("Sponsored_Products_Targeting_re");
  const placementSheet = ss.getSheetByName("Sponsored_Products_Placement_re");

  if (!targetingSheet || !placementSheet) {
    SpreadsheetApp.getUi().alert("❌ Required sheets (Targeting or Placement) are missing.");
    return;
  }

  // Build tMap (Targeting Map) for the attribution engine
  const tData = targetingSheet.getDataRange().getValues();
  const tHeaders = tData[0].map(h => String(h).trim());
  const tKey = tHeaders.indexOf("Targeting");
  const tClk = tHeaders.indexOf("Clicks");

  const tMap = {};
  for (let i = 1; i < tData.length; i++) {
    const key = tData[i][tKey];
    if (key) {
      if (!tMap[key]) tMap[key] = { clk: 0 };
      tMap[key].clk += Number(tData[i][tClk]) || 0;
    }
  }

  // Build pMap (Placement Map) for the attribution engine
  const pData = placementSheet.getDataRange().getValues();
  const pHeaders = pData[0].map(h => String(h).trim());
  const pKey = pHeaders.indexOf("Placement");
  const pClk = pHeaders.indexOf("Clicks");

  const pMap = {};
  for (let i = 1; i < pData.length; i++) {
    const key = pData[i][pKey];
    if (key) {
      if (!pMap[key]) pMap[key] = { clk: 0 };
      pMap[key].clk += Number(pData[i][pClk]) || 0;
    }
  }

  const deltas = detectDeltas(ss, tMap, pMap);
  const alertBody = deltas.map(row => row.join("\t")).join("\n");

  SpreadsheetApp.getUi().alert("🔍 Delta Analysis", alertBody, SpreadsheetApp.getUi().ButtonSet.OK);
}