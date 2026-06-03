import assert from "node:assert/strict";
import test from "node:test";

import { createManualSearchService } from "../js/services/manual-search.js";
import { createScannerSearchService } from "../js/services/scanner-search.js";

test("scanner search reuses an existing candidate without rescanning", async () => {
  let scans = 0;
  const search = createScannerSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    scanSymbols: async () => {
      scans += 1;
      return [];
    },
    getCandidates: () => [{ symbol: "HBAR" }],
  });

  const result = await search.search("hbar");
  assert.equal(result.kind, "existing");
  assert.equal(result.symbol, "HBAR");
  assert.equal(scans, 0);
});

test("scanner search appends a supported symbol outside the current universe", async () => {
  const search = createScannerSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    scanSymbols: async () => [{ symbol: "HBAR", status: "ready" }],
    getCandidates: () => [],
  });

  const result = await search.search("HBAR");
  assert.equal(result.kind, "added");
  assert.equal(result.candidate.symbol, "HBAR");
});

test("scanner search reports unsupported Bybit symbols", async () => {
  const search = createScannerSearchService({
    searchSymbols: async () => {
      throw Object.assign(new Error("missing"), { kind: "not-found" });
    },
    scanSymbols: async () => [],
    getCandidates: () => [],
  });

  const result = await search.search("SHAHARA");
  assert.deepEqual(result, { kind: "unsupported", symbol: "SHAHARA" });
});

test("manual search verifies support before explicit asset creation", async () => {
  const added = [];
  const search = createManualSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    addAsset: async (asset) => {
      added.push(asset);
      return asset;
    },
  });

  const result = await search.verify({ symbol: "hbar", exchange: "bybit" });
  assert.equal(result.kind, "verified");
  assert.equal(result.symbol, "HBAR");
  assert.deepEqual(added, []);

  await search.confirm(result);
  assert.deepEqual(added, [{ symbol: "HBAR", exchange: "bybit" }]);
});

test("manual search reports unsupported symbols without creating cards", async () => {
  let addCalls = 0;
  const search = createManualSearchService({
    searchSymbols: async () => {
      throw Object.assign(new Error("missing"), { kind: "not-found" });
    },
    addAsset: async () => {
      addCalls += 1;
    },
  });

  const result = await search.verify({ symbol: "SHAHARA", exchange: "bybit" });
  assert.deepEqual(result, { kind: "unsupported", symbol: "SHAHARA", exchange: "bybit" });
  assert.equal(addCalls, 0);
});
