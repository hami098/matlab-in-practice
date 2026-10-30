# large-table

Ten million rows in one window: every column searchable, alone or together, new rows arriving live, without `uitable`, while MATLAB stays free.

The data is synthetic: random laboratory results generated for this demo. No real patients; values and reference ranges are illustrative, not clinical.

## Run

```matlab
cd large-table
largeTable
```

- **Search:** type under any column title; all filled boxes apply together, after a quarter second of quiet.
  - text columns: any part of the name, `card` finds Cardiology
  - numbers: `50`, `4.5` (to the shown precision), `>5`, `<=7`, `1..9`
  - time: `2026`, `2026-10`, `2026-10-30`, `2026-10-30 19`, `2026-10-30 19:22`, or a range like `2025-03..2025-05`
  - patient: the start of the number, `P012` or `012`
  - a red underline marks text that cannot be read; that box is left out
- **Live:** new rows arrive at the top, 1,000 a second, filtered like the rest. Scrolled down, the view stays put and a button counts the new rows; it brings you back to the top. Sorted by another column, the button offers a refresh instead. **Live** pauses and resumes.
- **Sort:** click a column title, again to reverse. The default is newest first.
- **Reset:** clears every box and the sort.
- **Scroll:** wheel, arrow keys, Page Up, Page Down, Home, End, or the bar on the right.
- **Rows:** 1, 10 or 50 million rows of history, generated once per window.

Each request prints its timings in the Command Window.

## How it works

1. The rows live in one file per column, appended to and never rewritten (`appendColumns`). History is generated once, in time order; live rows are appended to the same files. `readColumns` reads as many rows as every column already holds.
2. The page turns each search box into either a range (numbers, time, patient) or a set of category codes (text columns), so MATLAB only ever applies two kinds of test (`filterRows`): `data >= low & data <= high`, or a 256-entry lookup table indexed by the code. All tests are combined with `&`.
3. `query` runs on `backgroundPool`. Newest first needs no sort: the rows are already in time order, so the matching rows are taken in reverse. Other orders use `sort`.
4. `writeBlocks` writes the result as blocks of 65,536 rows, each column in turn: 23 bytes a row, 1.5 MB a block. The description of the result goes to the page through a `parallel.pool.DataQueue` as soon as the first block is written; the rest follow.
5. The page keeps only as many row elements as fit on screen, fetches the blocks those rows are in, wraps them in typed arrays without copying, and formats only the visible cells.
6. A second background job, `produce`, appends 500 rows every half second and hands them to MATLAB through another `DataQueue`. MATLAB filters them with the current boxes and, for newest first, writes them as a small block the page puts on top; rows already in the current result are told apart by their position in the files.

| File | Does |
|---|---|
| `largeTable.m` | the window, the messages with the page, `query` and `produce` |
| `labCatalog.m` | the 12 tests and the category names: departments, priorities, specimens, statuses, analyzers |
| `labResults.m` | random rows; a patient's age and sex follow from the patient number, so live rows agree with history |
| `appendColumns.m`, `readColumns.m` | the column files |
| `filterRows.m` | ranges and code sets, combined |
| `writeBlocks.m` | any struct of equal-length columns, in a given row order, to block files |
| `page/grid.js` | the virtual grid: a pool of row elements, wheel, keys, the bar, sortable titles, rows added on top without moving the view |
| `page/app.js` | the columns, the search syntax, the blocks and live chunks, the messages with MATLAB |

Text goes to the page as `char`: `sendEventToHTMLSource` sends a MATLAB string as a one-element array (`["v1"]`), where `jsonencode` gives `"v1"`.

**Block format.** The `table` event, or `table.json` next to the page: `{ prefix, rows, blockRows, columns: [{ name, type }], tests, categories }`. Block `k` is `<prefix>-<k>.bin` with `min(blockRows, rows - k * blockRows)` rows, each column in turn, little-endian, of type `uint32`, `int32`, `single`, `uint16` or `uint8`. Without MATLAB, any static web server can serve `page` with these files; the page then scrolls them, without searching.

## Measured

MATLAB R2026b on Windows, 4 cores, 10M rows. After every request the MATLAB thread is free again within 6 to 22 ms.

| Request | Until all blocks are written |
|---|---|
| open the window | about 4 s to the first rows, most of it the first start of the page and the pool; generating 10M rows 1.8 to 2.0 s, newest first 0.05 s |
| Cardiology or Emergency, value > 100 (539,044 rows, sorted by value) | 0.53 s |
| age 50..60, female (768,247 rows) | 0.27 s |
| collected in March 2026 (424,770 rows, sorted by time) | 0.22 s |
| patients P012, glucose, high (2,242 rows) | 0.24 s |
| STAT, turnaround >= 60 (168,733 rows, sorted by turnaround) | 0.30 s |

Every count above equals the same condition written out by hand in MATLAB. Live: 1,000 rows a second reached the page in half-second chunks, under the current filters.

In Chrome, with the blocks on a local web server: scrolling with the wheel ran at 60 frames a second (median 16.7 ms, slowest 17.1 ms) with no empty row on screen; dragging the bar to the middle of 10M rows filled the rows in 52 ms.

### Optimization log

| Change | Sort 10M by value | Sort 50M by value |
|---|---|---|
| all blocks written, then the page told | 2.03 s | 10.88 s |
| page told after the first block | 1.05 s | 5.37 s |

Times until the first rows show.

### Next to `uitable`

`uitable` in R2026b, after a warm-up, with seven of these columns:

| Rows | Create and draw | Scroll to the middle | Sort and redraw |
|---|---|---|---|
| 100,000 | 0.56 s | 0.06 s | 0.33 s |
| 1,000,000 | 0.69 s | 0.07 s | 0.30 s |
| 10,000,000 | 2.09 s | 0.04 s | 1.57 s |

`uitable` holds 10 million rows today, but all of that runs on the MATLAB thread, so the window waits; here the thread is free after every request, rows keep arriving, and the page runs without MATLAB too.
