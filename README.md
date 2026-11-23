# Colombo CSE Portfolio & AI Trading Assistant

A zero-mock, real-time portfolio tracker, technical watchlist radar, and dividend intelligence dashboard tailored specifically for the **Colombo Stock Exchange (CSE)** and **ATrad** investors.

## Key Features

- **Live Portfolio & P&L Tracking:** Syncs real-time CSE share prices, 14-day RSI, and SMA-50 indicators, with automated **ATrad Excel** and **Contract Note** parsing.
- **AI Watchlist & Buy Zone Radar:** Calculates technical pullback entry prices from 14D RSI and SMA-50, automatically pinning and highlighting stocks within a **+3% Near-Target buffer** or confirming **RSI >30 Reversal Bounces** (avoiding falling knives at RSI ≤ 30).
- **Dividend Radar & Seasonality Book:**
  - Enforces **2.24% CSE Round-Trip Fee Guards** (1.12% Buy + 1.12% Sell) to filter out low-yield dividend traps.
  - Validates **Pre-XD Share Eligibility** from trade history so payouts are calculated strictly for shares held prior to the Ex-Dividend date.
  - Archives completed payouts into a permanent **Month-by-Month Seasonality Book**.
- **Realized Profit & Ledger Management:** Tracks realized gains/losses, 70/30 profit splits, custom ledgers, and a monthly P&L calendar.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Data Proxy:** Node.js / Express (`server.ts`) fetching live CSE market quotes and technical indicators
- **Persistence:** Client-side `localStorage` with JSON backup export/import