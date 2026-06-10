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
  CONF_MED_CLICKS: 5,       // Lowered to 5 to be more aggressive/responsive
  CONF_HIGH_CLICKS: 20,     // Clicks required for High confidence
  
  // Harvest Logic Thresholds (newly added for aggressive harvesting)
  SCALE_ROAS_THRESHOLD: 2.0,
  TEST_SCALE_ROAS_MIN: 1.3,
  TEST_SCALE_CTR_THRESHOLD: 1.0, // Percentage

  // Bid Adjustment Rules
  BID_SCALE_HIGH_ROAS: 3.0,     // ROAS threshold for +20% bid adjustment
  BID_SCALE_MED_ROAS: 2.0,      // ROAS threshold for +10% bid adjustment
  BID_SCALE_LOW_ROAS: 1.0,      // ROAS threshold for hold
  BID_CUT_FACTOR: 0.80,         // -20% bid for lose/waste targets
  BID_SCALE_HIGH_FACTOR: 1.20,  // +20% bid
  BID_SCALE_MED_FACTOR: 1.10,   // +10% bid
  
  // Budget Recycling Loop
  REALLOCATION_PERCENT: 0.50    // Redistribute 50% of saved waste budget to winners
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
  let totalCutWasteSpend = 0; // Spend saved by cutting waste
  let scaleCount = 0;
  let cutCount = 0;
  let holdCount = 0;

  const priorityQueue = []; // Actions to be ranked by impact
  const scaleCandidates = []; // Track high confidence SCALE targets for budget recycling

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
    impressions += parseNumber(cData[i][cImp]);
    clicks      += parseNumber(cData[i][cClicks]);
    spend       += parseNumber(cData[i][cSpend]);
    orders      += parseNumber(cData[i][cOrders]);
    sales       += parseNumber(cData[i][cSales]);
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
  // Calculate campaign metrics for snapshot logger
  const campaignMetrics = { impressions, clicks, orders, sales, spend, ctr, cvr, acos, roas };

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
    tMap[key].imp += parseNumber(tData[i][tImp]);
    tMap[key].clk += parseNumber(tData[i][tClk]);
    tMap[key].spd += parseNumber(tData[i][tSpd]);
    tMap[key].ord += parseNumber(tData[i][tOrd]);
    tMap[key].sal += parseNumber(tData[i][tSal]);
  }

  output.push(["TARGETING SUMMARY"]);
  output.push(["Targeting", "Impressions", "Clicks", "Tag", "Action", "Current CPC", "Suggested Bid"]);

  for (const key in tMap) {
    const { imp, clk, spd, ord, sal } = tMap[key];
    const roas = spd ? sal / spd : 0;
    const cpc = clk ? spd / clk : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: clk, 
      orders: ord, 
      roas, 
      impressions: imp, 
      spend: spd 
    });
    const action = getSuggestedAction(tag);
    const score = (sal * 2) - spd;
    const bidRec = calculateBidAdjustment(tag, roas, cpc);

    // Decision Counting
    if (action === "PROTECT / SCALE") {
      scaleCount++;
      if (confidence !== "LOW") {
        priorityQueue.push({ score, type: "SCALE", msg: `Target: ${key} (${ord} ord, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
        scaleCandidates.push({ key: `Target: ${key}`, score, ord });
      }
    } else if (action === "NEGATE / PAUSE") {
      cutCount++;
      if (confidence !== "LOW") {
        totalCutWasteSpend += spd; // Accumulate budget being cut
        priorityQueue.push({ score, type: "CUT", msg: `Target: ${key} ($${spd.toFixed(2)} waste, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
      }
    } else {
      holdCount++;
    }

    output.push([key, imp, clk, `${tag} [${confidence}]`, action, cpc ? `$${cpc.toFixed(2)}` : "—", bidRec.text]);
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
    pMap[key].imp += parseNumber(pData[i][pImp]);
    pMap[key].clk += parseNumber(pData[i][pClk]);
    pMap[key].spd += parseNumber(pData[i][pSpd]);
    pMap[key].ord += parseNumber(pData[i][pOrd]);
    pMap[key].sal += parseNumber(pData[i][pSal]);
  }

  output.push(["PLACEMENT SUMMARY"]);
  output.push(["Placement", "Impressions", "Clicks", "Tag", "Action", "Current CPC", "Suggested Bid"]);

  for (const key in pMap) {
    const { imp, clk, spd, ord, sal } = pMap[key];
    const roas = spd ? sal / spd : 0;
    const cpc = clk ? spd / clk : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: clk, 
      orders: ord, 
      roas, 
      impressions: imp, 
      spend: spd 
    });
    const action = getSuggestedAction(tag);
    const score = (sal * 2) - spd;
    const bidRec = calculateBidAdjustment(tag, roas, cpc);

    if (action === "PROTECT / SCALE") {
      scaleCount++;
      if (confidence !== "LOW") {
        priorityQueue.push({ score, type: "SCALE", msg: `Placement: ${key} (${ord} ord, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
        scaleCandidates.push({ key: `Placement: ${key}`, score, ord });
      }
    } else if (action === "NEGATE / PAUSE") {
      cutCount++;
      if (confidence !== "LOW") {
        totalCutWasteSpend += spd;
        priorityQueue.push({ score, type: "CUT", msg: `Placement: ${key} ($${spd.toFixed(2)} waste, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
      }
    }

    output.push([key, imp, clk, `${tag} [${confidence}]`, action, cpc ? `$${cpc.toFixed(2)}` : "—", bidRec.text]);
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
  output.push(["Term", "Spend", "Orders", "Tag", "Action", "Current CPC", "Suggested Bid"]);

  // Sort search terms by spend to find waste/wins quickly
  const sortedST = sData.slice(1)
    .map(row => ({
      term: row[sKey],
      imp:  parseNumber(row[sImp]),
      clk:  parseNumber(row[sClk]),
      spd:  parseNumber(row[sSpd]),
      ord:  parseNumber(row[sOrd]),
      sal:  parseNumber(row[sSal])
    }))
    .sort((a, b) => b.spd - a.spd)
    .slice(0, 15);

  sortedST.forEach(st => {
    const roas = st.spd ? st.sal / st.spd : 0;
    const cpc = st.clk ? st.spd / st.clk : 0;
    const { tag, confidence } = tagPerformance({ 
      clicks: st.clk, 
      orders: st.ord, 
      roas, 
      impressions: st.imp, 
      spend: st.spd 
    });
    const action = getSuggestedAction(tag);
    const score = (st.sal * 2) - st.spd;
    const bidRec = calculateBidAdjustment(tag, roas, cpc);

    output.push([st.term, st.spd.toFixed(2), st.ord, `${tag} [${confidence}]`, action, cpc ? `$${cpc.toFixed(2)}` : "—", bidRec.text]);

    if (tag.includes("🔴") && confidence !== "LOW") {
       wasteList.push(st.term);
       totalCutWasteSpend += st.spd;
       if (st.spd > PPC_RULES.WASTE_SPEND_THRESHOLD) {
         priorityQueue.push({ score, type: "CUT", msg: `Term: ${st.term} ($${st.spd.toFixed(2)} waste, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
       }
    } else if (tag.includes("🟢") && confidence !== "LOW") {
      priorityQueue.push({ score, type: "SCALE", msg: `Term: ${st.term} (${st.ord} ord, ${confidence} conf) → Suggest Bid: $${bidRec.bid ? bidRec.bid.toFixed(2) : "—"}` });
      scaleCandidates.push({ key: `Term: ${st.term}`, score, ord: st.ord });
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

  // Budget Recycling Loop calculation
  const budgetPool = totalCutWasteSpend * PPC_RULES.REALLOCATION_PERCENT;
  const sortedScaleCandidates = scaleCandidates.sort((a, b) => b.score - a.score);
  const recycleCount = Math.min(3, sortedScaleCandidates.length);
  const budgetPerTarget = recycleCount > 0 ? (budgetPool / recycleCount) : 0;

  const recyclingMsgRows = [
    ["♻️ BUDGET RECYCLING LOOP"],
    [`Saved Waste Spend (from CUT targets): $${totalCutWasteSpend.toFixed(2)}`],
    [`Reallocation Pool (${(PPC_RULES.REALLOCATION_PERCENT * 100).toFixed(0)}%): $${budgetPool.toFixed(2)}`]
  ];
  
  if (recycleCount > 0) {
    recyclingMsgRows.push([`Suggested Redistribution: Allocate +$${budgetPerTarget.toFixed(2)} spend budget to each of these top ${recycleCount} winners:`]);
    for (let i = 0; i < recycleCount; i++) {
      recyclingMsgRows.push([`   - ${sortedScaleCandidates[i].key} (${sortedScaleCandidates[i].ord} ord)`]);
    }
  } else {
    recyclingMsgRows.push(["Suggested Redistribution: No active SCALE priority winners to receive reallocated budget."]);
  }
  recyclingMsgRows.push([""]);

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
    [""],
    ...recyclingMsgRows
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

  // Find max columns to keep the range perfectly rectangular and prevent truncation
  const maxCols = output.reduce((max, r) => Math.max(max, r.length), 1);

  // =========================
  // SINGLE WRITE — much faster than row-by-row
  // =========================
  insightsSheet
    .getRange(1, 1, output.length, maxCols)
    .setValues(output.map(r => {
      // Pad each row to maxCols columns so the range is rectangular
      while (r.length < maxCols) r.push("");
      return r;
    }));
  // Log a snapshot to PPC_Tracker for trend analysis
  logPPCSnapshot(ss, campaignMetrics);
  SpreadsheetApp.getUi().alert("✅ PPC Insights refreshed and snapshot logged!");
}

// =========================
// HELPERS
// =========================

/**
 * Calculates a rule-based recommended bid adjustment based on performance tag, ROAS, and current CPC.
 * 
 * Rules:
 * - tag "🟢 WIN" with ROAS > 3.0: +20% adjustment to current CPC
 * - tag "🟢 WIN" with ROAS 2.0 to 3.0: +10% adjustment to current CPC
 * - tag "🟢 WIN" with ROAS 1.0 to 2.0: Hold (no action)
 * - tag "🟢 WIN" with ROAS < 1.0: -20% adjustment to current CPC
 * - tag "🔴 LOSE": -20% adjustment to current CPC
 * - tag "🔴 HIGH IMPRESSION NO CLICK": -20% adjustment to current CPC
 * - tag "🟡 NEUTRAL": Hold (no action)
 * 
 * @param {string} tag
 * @param {number} roas
 * @param {number} cpc
 * @returns {Object} { action: string, bid: number|null, text: string }
 */
function calculateBidAdjustment(tag, roas, cpc) {
  if (!cpc || cpc <= 0) {
    return { action: "HOLD", bid: null, text: "—" };
  }

  let factor = 1.0;
  let actionText = "HOLD";

  if (tag.includes("WIN")) {
    if (roas > PPC_RULES.BID_SCALE_HIGH_ROAS) {
      factor = PPC_RULES.BID_SCALE_HIGH_FACTOR;
      actionText = "+20%";
    } else if (roas >= PPC_RULES.BID_SCALE_MED_ROAS && roas <= PPC_RULES.BID_SCALE_HIGH_ROAS) {
      factor = PPC_RULES.BID_SCALE_MED_FACTOR;
      actionText = "+10%";
    } else if (roas >= PPC_RULES.BID_SCALE_LOW_ROAS && roas < PPC_RULES.BID_SCALE_MED_ROAS) {
      factor = 1.0;
      actionText = "HOLD";
    } else if (roas < PPC_RULES.BID_SCALE_LOW_ROAS) {
      factor = PPC_RULES.BID_CUT_FACTOR;
      actionText = "-20%";
    }
  } else if (tag.includes("LOSE") || tag.includes("HIGH IMPRESSION")) {
    factor = PPC_RULES.BID_CUT_FACTOR;
    actionText = "-20%";
  } else {
    factor = 1.0;
    actionText = "HOLD";
  }

  const suggestedBid = Number((cpc * factor).toFixed(2));
  return {
    action: actionText,
    bid: suggestedBid,
    text: actionText === "HOLD" ? "HOLD" : `${actionText} ($${suggestedBid.toFixed(2)})`
  };
}

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
 * Centralized parser to handle Amazon report values (currency, percentages, commas).
 * Strips symbols and returns a valid number.
 */
function parseNumber(value) {
  if (value == null || value === "") return 0;
  const clean = String(value).replace(/[$,%]/g, "").replace(/,/g, "");
  return Number(clean) || 0;
}

/**
 * Helper to validate headers and find their index.
 */
function getIdx(headers, col) {
  const i = headers.indexOf(col);
  if (i === -1) throw new Error(`Column "${col}" not found. Check your Amazon export format.`);
  return i;
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

/**
 * Analyzes the PPC_Tracker for recent campaign-level trends.
 * This serves as the "Learning Loop" for trend memory and predictive diagnostics.
 *
 * Tracker column layout:
 *   0=Date, 1=Impressions, 2=Clicks, 3=Orders, 4=Sales,
 *   5=Spend, 6=CTR%, 7=CVR%, 8=ACOS%, 9=ROAS
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Object} An object summarizing recent trends (e.g., { roas: 'improving', acos: 'stable' }).
 */
function getCampaignTrends(ss) {
  const tracker = ss.getSheetByName("PPC_Tracker");
  const trends = {};

  if (!tracker) {
    return trends; // No tracker, no trends
  }

  const data = tracker.getDataRange().getValues();
  // Need at least 3 data rows (header + 2 snapshots) to detect a trend over 2 periods
  if (data.length < 3) {
    return trends;
  }

  // Look at the last N snapshots for trend analysis.
  // Using 3 snapshots means we compare (S3 vs S2) and (S2 vs S1).
  const numSnapshotsForTrend = 3;
  // Slice from `1` to exclude header row.
  const recentSnapshots = data.slice(Math.max(data.length - numSnapshotsForTrend, 1));

  if (recentSnapshots.length < 2) {
      return trends; // Not enough data for a trend (e.g., only 1 snapshot after header)
  }

  // Helper to determine trend for a specific metric column
  // Returns 'consistently_improving', 'consistently_declining', 'mixed', 'stable', or 'insufficient_data'
  const analyzeMetricTrend = (colIndex, isHigherBetter) => {
    if (recentSnapshots.length < 2) return 'insufficient_data';

    let improvingCount = 0;
    let decliningCount = 0;

    for (let i = 0; i < recentSnapshots.length - 1; i++) {
      const val1 = Number(recentSnapshots[i][colIndex]) || 0;
      const val2 = Number(recentSnapshots[i+1][colIndex]) || 0;

      if (val2 > val1) {
        improvingCount++;
      } else if (val2 < val1) {
        decliningCount++;
      }
    }

    if (improvingCount === recentSnapshots.length - 1) {
      return isHigherBetter ? 'consistently_improving' : 'consistently_declining';
    } else if (decliningCount === recentSnapshots.length - 1) {
      return isHigherBetter ? 'consistently_declining' : 'consistently_improving';
    } else if (improvingCount > 0 || decliningCount > 0) {
      return 'mixed';
    }
    return 'stable';
  };

  trends.roas = analyzeMetricTrend(9, true);  // ROAS (col 9, higher better)
  trends.acos = analyzeMetricTrend(8, false); // ACOS (col 8, lower better)
  trends.orders = analyzeMetricTrend(3, true); // Orders (col 3, higher better)

  return trends;
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
    .addItem("🌱 Generate Harvest List", "generateHarvestReport")
    .addSeparator()
    .addItem("📸 Log Snapshot Only",  "logSnapshotOnly")
    .addItem("🔍 Delta Check",          "runDeltaCheck")
    .addToUi();
}

/**
 * Phase 1 Execution Layer: Keyword Harvesting
 * Scans Search Term report for Winners (to Scale) and Losers (to Negate).
 * Outputs to a dedicated "PPC_Harvest" sheet.
 */
function generateHarvestReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const HARVEST_TAB = "PPC_Harvest";
  
  const searchtermSheet = ss.getSheetByName("Sponsored_Products_Search_term_") || ss.getSheetByName("Sponsored_Products_Search_term_re");
  
  if (!searchtermSheet) {
    throw new Error("Missing Search Term report tab.");
  }

  let harvestSheet = ss.getSheetByName(HARVEST_TAB);
  if (!harvestSheet) {
    harvestSheet = ss.insertSheet(HARVEST_TAB);
  }
  harvestSheet.clearContents();

  const sData    = searchtermSheet.getDataRange().getValues();
  const sHeaders = sData[0].map(h => String(h).trim());

  const sKey   = getIdx(sHeaders, "Customer Search Term");
  const sCamp  = getIdx(sHeaders, "Campaign Name");
  const sGroup = getIdx(sHeaders, "Ad Group Name");
  const sImp   = getIdx(sHeaders, "Impressions");
  const sClk   = getIdx(sHeaders, "Clicks");
  const sSpd   = getIdx(sHeaders, "Spend");
  const sOrd   = getIdx(sHeaders, "7 Day Total Orders (#)");
  const sSal   = getIdx(sHeaders, "7 Day Total Sales");

  const harvestOutput = [
    ["Keyword / Search Term", "Source Campaign", "Ad Group", "Clicks", "Orders", "ROAS", "Confidence", "Current CPC", "Suggested Bid Action", "Suggested Bid", "Suggested Match Type"]
  ];

  for (let i = 1; i < sData.length; i++) {
    const row = sData[i];
    const term = row[sKey];
    if (!term || term.startsWith("*") || term.startsWith("b0")) continue; // Skip ASINs or empty terms

    const clk  = parseNumber(row[sClk]);
    const ord  = parseNumber(row[sOrd]);
    const spd  = parseNumber(row[sSpd]);
    const sal  = parseNumber(row[sSal]);
    const imp  = parseNumber(row[sImp]);
    const roas = spd ? sal / spd : 0;
    const cpc  = clk ? spd / clk : 0;

    const { tag, confidence } = tagPerformance({ 
      clicks: clk, 
      orders: ord, 
      roas, 
      impressions: imp, 
      spend: spd 
    });

    let action = "";
    let match  = "";
    const bidRec = calculateBidAdjustment(tag, roas, cpc);

    if (tag === "🟢 WIN") {
      action = (confidence === "LOW") ? "POTENTIAL WIN (WATCH)" : "PROXIMITY SCALE (HARVEST)";
      match  = "Exact";
    } else if (tag === "🔴 LOSE" || tag === "🔴 HIGH IMPRESSION NO CLICK") {
      action = (confidence === "LOW") ? "POTENTIAL WASTE (WATCH)" : "NEGATE / BLOCK";
      match  = "Negative Exact";
    } else {
      // Skip true Neutrals to keep the harvest sheet focused on actionable signals
      continue;
    }

    harvestOutput.push([
      term, 
      row[sCamp], 
      row[sGroup], 
      clk, 
      ord, 
      roas.toFixed(2), 
      confidence, 
      cpc ? `$${cpc.toFixed(2)}` : "—",
      bidRec.action,
      bidRec.bid ? `$${bidRec.bid.toFixed(2)}` : "—",
      match
    ]);
  }

  if (harvestOutput.length > 1) {
    harvestSheet.getRange(1, 1, harvestOutput.length, harvestOutput[0].length)
      .setValues(harvestOutput);
    
    // Formatting
    harvestSheet.getRange(1, 1, 1, harvestOutput[0].length).setFontWeight("bold").setBackground("#f3f3f3");
    harvestSheet.setFrozenRows(1);
    
    SpreadsheetApp.getUi().alert(`✅ Harvest complete! Found ${harvestOutput.length - 1} items in 'PPC_Harvest'. Check the Confidence column for signals.`);
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ Harvest complete: No Wins or Losers found (even at Low confidence).");
  }
  
  ss.setActiveSheet(harvestSheet);
}

/**
 * Standalone wrapper — logs a snapshot without re-rendering the Insights tab.
 * Useful for logging on a schedule without disturbing the current view.
 */
function logSnapshotOnly() {
  const ss             = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet  = ss.getSheetByName("Sponsored_Products_Campaign_report");

  if (!campaignSheet) {
    throw new Error("Missing tab: Sponsored_Products_Campaign_report.");
  }

  const cData    = campaignSheet.getDataRange().getValues();
  const cHeaders = cData[0].map(h => String(h).trim());

  const cImp    = getIdx(cHeaders, "Impressions");
  const cClicks = getIdx(cHeaders, "Clicks");
  const cSpend  = getIdx(cHeaders, "Spend");
  const cOrders = getIdx(cHeaders, "7 Day Total Orders (#)");
  const cSales  = getIdx(cHeaders, "7 Day Total Sales");

  let impressions = 0, clicks = 0, spend = 0, orders = 0, sales = 0;

  for (let i = 1; i < cData.length; i++) {
    impressions += parseNumber(cData[i][cImp]);
    clicks      += parseNumber(cData[i][cClicks]);
    spend       += parseNumber(cData[i][cSpend]);
    orders      += parseNumber(cData[i][cOrders]);
    sales       += parseNumber(cData[i][cSales]);
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
  const tKey = getIdx(tHeaders, "Targeting");
  const tClk = getIdx(tHeaders, "Clicks");

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
  const pHeaders = pData[0].map(h => String(h).trim()); // Already trimmed in getIdx
  const pKey = getIdx(pHeaders, "Placement");
  const pClk = getIdx(pHeaders, "Clicks");

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