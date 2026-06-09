# Changelog

All notable changes to this repo are documented here.
Format: [Project] vX.X — Description

---

## [PPC_Reports] v2.4 — 2026-06-09
### Added
- **`PPC_Tracker` sheet**: auto-created with bold frozen header row on first run — never overwrites, always appends
- **`logPPCSnapshot()`**: appends one timestamped row per run with 10 metrics (Date, Impressions, Clicks, Orders, Sales, Spend, CTR%, CVR%, ACOS%, ROAS)
- **`logSnapshotOnly()`**: standalone function to log without re-rendering the Insights tab — useful for scheduled triggers
- **Menu separator + 📸 Log Snapshot Only** item added to ⚙️ PPC OPS menu
- **Auto-logging on refresh**: `refreshPPCInsights()` now calls `logPPCSnapshot()` automatically on every run

### Notes
- `PPC_Tracker` is pivot-ready — filter by date range, chart ROAS over time, or export for analysis
- Run `logSnapshotOnly` daily via Apps Script time-trigger for trend data without touching the Insights view

---

## [PPC_Reports] v2.3 — 2026-06-09
### Fixed
- **LOSE threshold raised**: `clicks >= 5` → `clicks >= 10` — prevents mislabeling high-volume exploration traffic (close-match, rest-of-search) as waste
- **WIN condition relaxed**: `orders >= 1 AND (roas >= 2 OR acos <= 40)` → `orders >= 1 OR roas >= 2` — avoids false negatives when only one signal is available
- **ACOS removed from tagPerformance**: not available at targeting level in V1; removed param to avoid false precision
- **Updated both call sites**: targeting and placement loops now pass 3 args instead of 4

### Notes
- Amazon traffic buckets are mixed-intent containers, not isolated experiments — low click counts must be treated as insufficient signal, not failure
- ACOS re-enters in V2 when search-term attribution is wired in

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
