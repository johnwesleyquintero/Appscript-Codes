# PPC Reports — Google Apps Script

Amazon Sponsored Products PPC Insights engine.
Reads raw Amazon report exports directly from Google Sheets tabs and compresses them into actionable decision data.

---

## 📊 What It Does

| Section | Output |
|---------|--------|
| **Metrics** | Impressions, Clicks, Orders, Sales, Spend, CTR%, CVR%, ACOS%, ROAS |
| **Targeting Summary** | Per-keyword/ASIN performance + 🟢/🟡/🔴 tag |
| **Placement Summary** | Per-placement performance + 🟢/🟡/🔴 tag |
| **Diagnostics** | CTR low, CVR strong, ROAS profitable, low data warnings |

---

## 🟢 WIN / 🟡 NEUTRAL / 🔴 LOSE Logic

| Tag | Condition |
|-----|-----------|
| 🟢 WIN | ≥1 order AND (ROAS ≥ 2 OR ACOS ≤ 40%) |
| 🔴 LOSE | ≥5 clicks AND 0 orders |
| 🟡 NEUTRAL | Everything else — observing |

> **V1 note:** Tags are currently behavior-based on clicks only (targeting-level order attribution not yet available). WIN tag will activate when sales-per-targeting data is wired in.

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

- [ ] V2 — Targeting-level order attribution (search term merge)
- [ ] Action Layer — Auto bid recommendations (scale / monitor / pause)
- [ ] Multi-campaign rollup
- [ ] Weekly snapshot logging

---

## 📁 Files

| File | Purpose |
|------|---------|
| `code.gs` | Main Apps Script — all logic in one file |
