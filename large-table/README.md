# large-table

Ten million rows in one window: scrolled, sorted and filtered without `uitable`, while MATLAB stays free.

The data is synthetic: random laboratory results generated for this demo. No real patients; values and reference ranges are illustrative, not clinical.

## Run

```matlab
cd large-table
largeTable
```

- **Scroll:** wheel, arrow keys, Page Up, Page Down, Home, End, or drag the bar on the right.
- **Sort:** click a column title; click it again to reverse.
- **Filter:** pick a test or a flag at the top.
- **Rows:** 1, 10 or 50 million; each size is generated once per window.

Each request prints its timings in the Command Window.

Without MATLAB, any static web server can serve `page` with a `table.json` and its block files next to it (format below); the page then scrolls them, without sorting or filtering.

## How it works

1. The page asks for rows (`query`): size, test, flag, sort column and direction. MATLAB starts `query` on `backgroundPool` with `parfeval` and returns at once.
2. `query` generates the rows the first time (`labResults`) and keeps them in a `.mat` file next to the page (`save -v6`, uncompressed), so later requests load them instead of generating them again. It filters with logical indexing; `sort` gives the row order.
3. `writeBlocks` writes the rows in that order as blocks of 65,536 rows. A block holds each column in turn: patient uint32, time int32, value single, then test, flag, age and sex uint8, 16 bytes a row, about 1 MB a block.
4. `afterEach` sends the page a description of the result. The page keeps only as many row elements as fit on screen, fetches the blocks those rows are in, wraps them in typed arrays without copying, and formats only the visible cells. Scrolling moves the same elements and refills their text. Blocks within a quarter block of the screen are fetched before they are needed; at most 64 blocks are kept.
5. The previous result's blocks are deleted once the new one is shown.

| File | Does |
|---|---|
| `largeTable.m` | the window, the messages with the page, and `query` |
| `labTests.m` | the 12 tests: name, unit, mean, spread, reference range, decimals |
| `labResults.m` | random rows: patients with an age and sex, a time in 2025 or 2026, a test, a value, and a low or high flag |
| `writeBlocks.m` | any struct of equal-length columns, in a given row order, to block files; usable on its own |
| `page/grid.js` | the virtual grid: a pool of row elements, wheel, keys, the bar, column titles that sort; knows nothing about the data |
| `page/app.js` | the blocks and their typed arrays, the cell texts, the controls, the messages with MATLAB |

**Block format.** The `table` event, or `table.json`: `{ prefix, rows, blockRows, columns: [{ name, type }], tests }`. Block `k` is `<prefix>-<k>.bin` with `min(blockRows, rows - k * blockRows)` rows, each column in turn, little-endian, of type `uint32`, `int32`, `single` or `uint8`.

## Measured

MATLAB R2026b on Windows, 4 cores. After every request the MATLAB thread is free again within 1 to 2 ms.

| Request | Until the rows show |
|---|---|
| open the window with 10M rows | 6.76 s, of which 1.3 s is work and the rest the first start of the page and the pool |
| sort 10M by value | 2.03 s |
| sort 10M by time | 1.88 s |
| one test, abnormal only (92 thousand rows) | 0.31 s |
| 50M rows | 7.00 s |
| sort 50M by value | 10.88 s |

In Chrome, with the blocks of 10M rows on a local web server: scrolling with the wheel ran at 60 frames a second (median 16.7 ms, slowest 17.1 ms) with no empty row on screen; dragging the bar to the middle filled the rows in 52 ms, End in 48 ms.

`uitable` in R2026b, after a warm-up, with the same seven columns:

| Rows | Create and draw | Scroll to the middle | Sort and redraw |
|---|---|---|---|
| 100,000 | 0.56 s | 0.06 s | 0.33 s |
| 1,000,000 | 0.69 s | 0.07 s | 0.30 s |
| 10,000,000 | 2.09 s | 0.04 s | 1.57 s |

`uitable` holds 10 million rows today, but all of that runs on the MATLAB thread, so the window waits; here the thread is free after every request, and the page runs without MATLAB too.
