# Current Position Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SignalCatch into a Bybit top-N current-position scanner with all-timeframe entry, SL, TP, recommendation, and split guidance.

**Architecture:** Add a focused Bybit universe adapter that ranks linear USDT perpetuals by turnover. Enrich scanner candidates with per-mode trade plans and recommendations, then render expandable per-symbol setup tables. Keep the historical backtest as a secondary tab and add an in-page guide for the primary live-analysis workflow.

**Tech Stack:** Static HTML, CSS, browser JavaScript modules, Bybit public REST API, Node test runner.

---

### Task 1: Bybit Top-N Universe

**Files:**
- Modify: `js/api/bybit.js`
- Modify: `js/app.js`
- Test: `tests/api.test.js`

- [ ] Add a failing adapter test that filters linear USDT perpetuals, rejects malformed turnover values, sorts descending, and returns the requested top N symbols.
- [ ] Run `node --test tests/api.test.js` and verify the new test fails because `fetchBybitTopSymbols` is missing.
- [ ] Implement `fetchBybitTopSymbols({ limit })` with a `10..200` limit and public Bybit instrument/ticker requests.
- [ ] Run `node --test tests/api.test.js` and verify it passes.
- [ ] Wire scanner execution to use the editable universe limit and retain the seven-symbol fallback on universe failure.

### Task 2: Current Position Setups

**Files:**
- Modify: `js/services/scanner.js`
- Modify: `js/ui/scanner.js`
- Test: `tests/services.test.js`
- Test: `tests/dom.test.js`

- [ ] Add a failing service test requiring per-mode `plan`, `recommendation`, and daily/swing split guidance.
- [ ] Run `node --test tests/services.test.js` and verify the new test fails.
- [ ] Enrich scanner candidates with trade plans for every timeframe using existing analysis modules.
- [ ] Add a failing renderer test requiring an expandable setup table with current price, direction, entry zone, SL, TP, label, and split guidance.
- [ ] Run `node --test tests/dom.test.js` and verify the new test fails.
- [ ] Render compact symbol rows plus expandable all-timeframe setup details.
- [ ] Run targeted tests and verify they pass.

### Task 3: Editable Universe And Usage Guide

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Test: `tests/dom.test.js`

- [ ] Add a failing DOM contract test for the top-N number input and expandable usage guide.
- [ ] Run `node --test tests/dom.test.js` and verify the new test fails.
- [ ] Add the scanner-size input with default `100`, minimum `10`, maximum `200`, and a concise in-page guide.
- [ ] Run targeted tests and verify they pass.

### Task 4: Verification And Deployment

**Files:**
- Modify: `README.md`
- Modify: `docs/temporary-hardening-plan.md`

- [ ] Document the top-N scanner and current-setup workflow.
- [ ] Run `npm.cmd test`.
- [ ] Run syntax checks and `git diff --check`.
- [ ] Commit the implementation.
- [ ] Push `HEAD:main`, wait for GitHub Pages refresh, and verify the public scanner in the browser.

