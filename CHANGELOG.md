# Changelog

All notable changes to this repo are documented here.
Format: [Project] vX.X — Description

---

## [PPC_Reports] v2.2 — 2026-06-09
### Improved
- **Batched writes**: all output rows collected in memory and written in a single `setValues()` call — dramatically faster on large datasets, avoids Apps Script timeout
- **Source sheet guards**: all 4 required tabs validated upfront; missing tabs throw a clear error listing which ones are absent
- **Header normalization**: all headers trimmed with `.trim()` before `indexOf()` — handles Amazon's trailing-space column names robustly
- **Success alert**: UI alert fires on completion so the user knows the run finished
- **Menu cleanup**: removed duplicate "Refresh All Data" menu item; kept single "🔄 Run PPC Insights" entry
- **JSDoc comments**: added doc blocks to `tagPerformance()` and `parseMoney()`

---

## [PPC_Reports] v2.1 — 2026-06-09
### Added
- `tagPerformance()` helper: WIN / NEUTRAL / LOSE behavioral tagging
- Targeting summary now outputs 4 columns (+ Tag)
- Placement summary now outputs 4 columns (+ Tag)

### Notes
- V1 tagging is click-signal only (targeting-level order attribution pending)
- WIN tag will activate when sales-per-targeting data is wired in

---

## [PPC_Reports] v2.0 — 2026-06-09
### Added
- Campaign-level metrics: Impressions, Clicks, Orders, Sales, Spend, CTR%, CVR%, ACOS%, ROAS
- Targeting summary (normalized by targeting key)
- Placement summary (normalized by placement key)
- Diagnostics section: CTR low, CVR strong, ROAS profitable, low data warnings
- `parseMoney()` helper for `$`-formatted currency strings
- `onOpen()` UI menu: ⚙️ PPC OPS

---

## Upcoming
- [ ] [PPC_Reports] V2 targeting-level order attribution
- [ ] [PPC_Reports] Action Layer: bid recommendations
- [ ] New project TBD
