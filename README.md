# Ledger — Personal Finance Tracker

A lightweight, database-free personal finance tracker built with plain HTML, CSS, and JavaScript. Data is saved locally in your browser via `localStorage` with built-in JSON backup/restore and CSV export.

## Features

- **Main Balance Hero**: Always displays your current cash balance (defaults to `SGD / S$`), starting balance + income − expenses breakdown, net worth, total expenses, and total investments.
- **Expenses Tab**:
  - **5 Categories & Subcategories**:
    1. **Food** (`Meals`, `Snacks`)
    2. **Shopping** (`Groceries`, `Books`)
    3. **Leisure** (`Movies`, `Friends`)
    4. **Transport** (`Public`, `Private`)
    5. **Bills** (`Apple`, `Google`, `Xbox`, `Car`, `Work`)
  - **2 Tags**: `Personal` and `Family`
  - Tag split bar, category/subcategory breakdown, and filtering by tag, category, month, and search text.
- **Investments Tab (3-Fold)**:
  - **Bonds**: Track bond holdings, amount invested, yield %, and maturity date.
  - **ETFs**: Create ETFs, log individual funds/tranches invested within each ETF, and optionally update market value.
  - **Stocks**: Track company name, ticker, number of shares, current price per share, and optional avg buy price.
- **Analysis Tab**:
  - Category & subcategory summarization (totals, shares, Personal vs Family split, monthly trend, net cash flow & savings rate).
  - Investment growth tracking (cost basis vs current value, projected annual bond yield, and portfolio growth chart via snapshots).
- **No Database Required**: Persists automatically in `localStorage`, with JSON export/import and CSV export.

## Run Locally

```sh
npm run dev
```

Then open `http://localhost:3000`.

## Run Tests

```sh
npm test
```

## Deploy to Vercel

This is a zero-build static site:

1. Push this repository to GitHub (or deploy directly with the Vercel CLI: `npx vercel`).
2. In Vercel, import the project with **Framework Preset: Other** and leave Build Command empty (Output Directory: `.`).
