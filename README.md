# 📦 Google Apps Script Codes

A growing collection of Google Apps Script projects built for Amazon PPC operations, reporting, and automation.

Each project lives in its own folder with its own README.

---

## 📁 Projects

| Folder | Description | Status |
|--------|-------------|--------|
| [`PPC_Reports/`](./PPC_Reports/) | Amazon Sponsored Products PPC Insights engine with WIN/LOSE tagging | ✅ Active |

> More projects coming. Each one solves a specific ops problem.

---

## ⚙️ How to Use

These scripts run inside **Google Apps Script** — no installation needed beyond copying the code.

### Option A — Manual Copy
1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the contents of `code.gs` into the editor
4. Save and run

### Option B — clasp (CLI deploy)
```bash
npm install -g @google/clasp
clasp login
clasp clone <scriptId>
# copy your .gs files in, then:
clasp push
```

> ⚠️ Never commit `.clasprc.json` or `.clasp.json` — they contain auth tokens.

---

## 🗂️ Repo Structure

```
Appscript Codes/
├── .gitignore
├── README.md
├── CHANGELOG.md
└── PPC_Reports/
    ├── code.gs
    └── README.md
```

---

## 📋 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## 🧠 Author

Built for Amazon PPC ops. No fluff — just decision compression.
