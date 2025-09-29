# Test Suite Timing Report

**Generated:** 2025-09-29
**Total Test Files:** 16
**Full Suite Timeout:** 3+ minutes (incomplete)

## Test Execution Time Breakdown

### ⚠️ CRITICAL - Extremely Slow Tests (>60s)

| Test File | Duration | Status | Issue |
|-----------|----------|--------|-------|
| `tests/integration/cli-search-integration.test.js` | **119.1s** | ❌ FAIL | 1 test failed (timing flake: 1010ms vs 1000ms limit) |
| `tests/integration/integration.test.js` | **76.4s** | ✅ PASS | Slow but functional |
| `tests/search/highlighting-regression.test.js` | **>60s** | ⏱️ TIMEOUT | Test suite times out |
| `tests/search/minisearch-engine.test.js` | **>60s** | ⏱️ TIMEOUT | Test suite times out |

### Slow Tests (10-60s)

| Test File | Duration | Status | Notes |
|-----------|----------|--------|-------|
| `tests/setup/setup-system.test.js` | **13.9s** | ✅ PASS | Fixed incremental updates test |
| `tests/smoke.test.js` | **5.8s** | ✅ PASS | - |
| `tests/cli/cli-interaction.test.js` | **5.4s** | ✅ PASS | - |

### Fast Tests (<1s)

| Test File | Duration | Status | Notes |
|-----------|----------|--------|-------|
| `tests/basic.test.js` | <1s | ✅ PASS | 31 tests |
| `tests/utils.test.js` | <1s | ✅ PASS | - |
| `tests/date-filters.test.js` | <1s | ✅ PASS | - |
| `tests/cli/filter-menu.test.js` | <1s | ✅ PASS | 18 tests |
| `tests/export/export-functionality.test.js` | <1s | ✅ PASS | - |
| `tests/setup/empty-conversation-handling.test.js` | <1s | ✅ PASS | 8 tests |
| `tests/integration/cli-export-integration.test.js` | <1s | ✅ PASS | - |
| `tests/integration/cli-filter-integration.test.js` | <1s | ✅ PASS | - |
| `tests/integration/cli-setup-integration.test.js` | <1s | ✅ PASS | - |

## Summary Statistics

```
Total test files:        16
Completed within 3 min:  14
Timed out:               2
Passing:                 13
Failing:                 1
Time out before running: 2

Total duration: 180+ seconds (3+ minutes)
Quick tests duration: 1 second
```

## Identified Issues

### 🚨 BLOCKING ISSUES:

1. **tests/search/highlighting-regression.test.js** - Times out at 60s
   - Likely infinite loop or very slow operation
   - Never completes

2. **tests/search/minisearch-engine.test.js** - Times out at 60s
   - Likely testing old JSONL architecture
   - May be incompatible with new markdown indexing

3. **tests/integration/cli-search-integration.test.js** - Takes 119s and fails
   - Test: "should complete search within reasonable time"
   - Expected: <1000ms
   - Actual: 1010ms (timing flake, not real failure)

### ⚠️ PERFORMANCE ISSUES:

4. **tests/integration/integration.test.js** - Takes 76s
   - 18 integration tests creating real files/indexes
   - Slowest tests:
     - "should handle CLI arguments correctly" - 19.6s
     - "should handle concurrent operations" - 17.7s
     - "should work through CLI commands" - 15.7s

## Recommendations

### Immediate Fixes Needed:
1. Investigate why `highlighting-regression.test.js` times out
2. Investigate why `minisearch-engine.test.js` times out
3. Increase timeout for flaky search timing test (1010ms vs 1000ms)

### Performance Improvements:
1. Mock file I/O in integration tests instead of creating real files
2. Use smaller datasets in performance tests
3. Consider splitting large integration test files into focused suites

### Test Organization:
```
Fast unit tests (<1s):    9 files - Use for pre-commit
Medium tests (1-15s):     3 files - Run on demand
Slow integration (60s+):  4 files - CI only
```

## Pre-Commit Test Strategy

**Current:** `npm run test:quick` runs 3 fast test files (1 second)

**Recommended:** Keep current strategy - slow integration tests are for CI, not local dev