# PPC Reports — Google Apps Script

Amazon Sponsored Products PPC Insights engine.
Reads raw Amazon report exports directly from Google Sheets tabs and compresses them into actionable decision data.

---

## 📊 What It Does

| Section | Output |
|---------|--------|
| **Metrics** | Impressions, Clicks, Orders, Sales, Spend, CTR%, CVR%, ACOS%, ROAS |
| **Priority Actions** | Top N financially impactful actions (SCALE/CUT) with Confidence |
| **Targeting Summary** | Per-keyword/ASIN performance + 🟢/🟡/🔴 tag |
| **Placement Summary** | Per-placement performance + 🟢/🟡/🔴 tag |
| **Diagnostics** | CTR low, CVR strong, ROAS profitable, low data warnings, waste alerts |

---

## 🟢 WIN / 🟡 NEUTRAL / 🔴 LOSE Logic (with Confidence)

The system now uses a `PPC_RULES` configuration block for all thresholds, making it highly configurable.
Each performance tag is now accompanied by a **Confidence Score** (LOW, MED, HIGH) based on click volume, ensuring decisions are made on statistically significant data.

| Tag | Condition | Confidence |
|-----|-----------|------------|
| 🟢 WIN | `clicks >= MIN_CLICKS_FOR_SIGNAL` AND `spend >= MIN_SPEND_FOR_SIGNAL` AND (`orders >= 1` OR `ROAS >= WIN_ROAS`) | LOW (2-7 clicks), MED (8-19 clicks), HIGH (20+ clicks) |
| 🔴 HIGH IMPRESSION NO CLICK | `impressions >= HIGH_IMP_THRESHOLD` AND `clicks === 0` | LOW (always, due to 0 clicks) |
| 🔴 LOSE | `clicks >= WASTE_CLICKS` AND `orders === 0` | LOW (2-7 clicks), MED (8-19 clicks), HIGH (20+ clicks) |
| 🟡 NEUTRAL | Everything else — observing | LOW (always, due to insufficient data) |

**Priority Queue Scoring:**
Actions in the "PRIORITY ACTIONS" list are ranked by a **Weighted Profit Pressure Index (WPPI)**: `(Sales * 2) - Spend`. This prioritizes actions that maximize profit and minimize waste, ensuring the most financially impactful decisions are surfaced first. Only actions with `MED` or `HIGH` confidence are added to the priority queue.

---

## 📋 Required Sheet Tabs

Your Google Sheet must have these tabs (exact names):

| Tab Name | Source |
|----------|--------|
| `PPC_Insights` | Output tab (auto-created content, must exist) |
| `Sponsored_Products_Campaign_report` | Amazon Campaign report export |
| `Sponsored_Products_Targeting_re` | Amazon Targeting report export |
| `Sponsored_Products_Placement_re` | Amazon Placement report export |

---

## 📋 Required Column Headers

**Campaign report:**
- `Impressions`, `Clicks`, `Spend`, `7 Day Total Orders (#)`, `7 Day Total Sales `

**Targeting report:**
- `Targeting`, `Impressions`, `Clicks`

**Placement report:**
- `Placement`, `Impressions`, `Clicks`

---

## ⚙️ Setup

1. Open your Google Sheet
2. **Extensions → Apps Script**
3. Paste `code.gs` contents into the editor
4. Save (`Ctrl+S`)
5. Reload your spreadsheet — a **⚙️ PPC OPS** menu will appear
6. Click **Run PPC Insights**

---

## 🗺️ Roadmap

- [x] V2 — Targeting-level order attribution (search term merge)
- [x] Action Layer — Auto bid recommendations (Decision Engine with Priority Queue)
- [x] Confidence Scoring (LOW/MED/HIGH)
- [ ] Budget Rebalancer (suggested budget shifts)
- [ ] Learning Loop (trend memory, predictive tagging)
- [ ] Multi-campaign rollup
- [ ] Weekly snapshot logging

---

## 📁 Files

| File | Purpose |
|------|---------|
| `code.gs` | Main Apps Script — all logic in one file |
