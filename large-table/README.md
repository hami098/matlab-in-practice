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
4. As soon as the first block is written, `query` sends the description of the result through a `parallel.pool.DataQueue`, and MATLAB passes it to the page; the other blocks are written after it, and `afterEach` on the job reports when all are done. The page shows the first rows at once; a block that is not written yet is asked for again after 100 ms.
5. The page keeps only as many row elements as fit on screen, fetches the blocks those rows are in, wraps them in typed arrays without copying, and formats only the visible cells. Scrolling moves the same elements and refills their text. Blocks within a quarter block of the screen are fetched before they are needed; at most 64 blocks are kept.
6. Blocks of earlier results are deleted when a new result is announced and again when it is complete, which also catches blocks a cancelled job wrote late.

| File | Does |
|---|---|
| `largeTable.m` | the window, the messages with the page, and `query` |
| `labTests.m` | the 12 tests: name, unit, mean, spread, reference range, decimals |
| `labResults.m` | random rows: patients with an age and sex, a time in 2025 or 2026, a test, a value, and a low or high flag |
| `writeBlocks.m` | any struct of equal-length columns, in a given row order, to block files; usable on its own |
| `page/grid.js` | the virtual grid: a pool of row elements, wheel, keys, the bar, column titles that sort; knows nothing about the data |
| `page/app.js` | the blocks and their typed arrays, the cell texts, the controls, the messages with MATLAB |

Text goes to the page as `char`: `sendEventToHTMLSource` sends a MATLAB string as a one-element array (`["v1"]`), where `jsonencode` gives `"v1"`. Comparing two such arrays in JavaScript is always false, which once kept the page from noticing that a result was complete.

**Block format.** The `table` event, or `table.json`: `{ prefix, rows, blockRows, columns: [{ name, type }], tests }`. Block `k` is `<prefix>-<k>.bin` with `min(blockRows, rows - k * blockRows)` rows, each column in turn, little-endian, of type `uint32`, `int32`, `single` or `uint8`.

## Measured

MATLAB R2026b on Windows, 4 cores. After every request the MATLAB thread is free again within 6 to 22 ms, most of it spent creating the request's `DataQueue`.

| Request | First rows | All blocks written |
|---|---|---|
| open the window with 10M rows | 6.42 s, mostly the first start of the page and the pool | 6.87 s |
| sort 10M by value | 1.05 s | 2.05 s |
| sort 10M by time | 0.76 s | 1.86 s |
| sort 10M by test | 0.51 s | 0.96 s |
| one test, abnormal only (92 thousand rows) | 0.33 s | 0.33 s |
| 50M rows | 3.76 s | 6.53 s |
| sort 50M by value | 5.37 s | 11.70 s |

### Optimization log

| Change | Sort 10M by value | Sort 10M by test | Sort 50M by value |
|---|---|---|---|
| start: all blocks written, then the page told | 2.03 s | 1.77 s | 10.88 s |
| page told after the first block; the test key as `uint8` instead of `double` | 1.05 s | 0.51 s | 5.37 s |

Times until the first rows show.

In Chrome, with the blocks of 10M rows on a local web server: scrolling with the wheel ran at 60 frames a second (median 16.7 ms, slowest 17.1 ms) with no empty row on screen; dragging the bar to the middle filled the rows in 52 ms, End in 48 ms.

`uitable` in R2026b, after a warm-up, with the same seven columns:

| Rows | Create and draw | Scroll to the middle | Sort and redraw |
|---|---|---|---|
| 100,000 | 0.56 s | 0.06 s | 0.33 s |
| 1,000,000 | 0.69 s | 0.07 s | 0.30 s |
| 10,000,000 | 2.09 s | 0.04 s | 1.57 s |

`uitable` holds 10 million rows today, but all of that runs on the MATLAB thread, so the window waits; here the thread is free after every request, and the page runs without MATLAB too.
