# VPS catalog implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a static Russian VPS catalog for all 3038 rows of the public snapshot at `/vps/` without changing the profile README.

**Architecture:** Python converts `data/vds.xlsx` into `vps/data.json`. The browser loads that JSON with a relative URL and filters it with `vps/catalog.js`. GitHub Pages serves the repository root, so the page URL is `https://yepbro.github.io/yepbro/vps/` after Pages is enabled on `main`.

**Tech Stack:** Python 3, openpyxl 3.1.5, unittest, vanilla HTML/CSS/ES modules, Node.js built-in test runner.

## Global Constraints

- UI copy and field rules are the spec `docs/superpowers/specs/2026-11-06-vps-catalog-design.md`. Do not restate a different rule here.
- No guessed RAM decimals (`1.5`, `2.5`). Date cells stay `1-May` / `2-May` and `ram_unknown: true`.
- Unknown numeric values are not zero. Unlimited traffic is not a finite number during filtering and sorts as +infinity.
- Keep all 3038 rows, including duplicates.
- Relative asset URLs only. No remote assets. No `<base>` tag.
- Do not edit `README.md`.
- Checkbox lists only for fields with 40 or fewer distinct numbers: `cpu_count` and `cpu_freq_mhz`, plus the fixed sets for disk type, virtualization, and IPv6, plus the two special checkboxes (unknown RAM, unlimited traffic).
- Do not describe the page as live until `https://yepbro.github.io/yepbro/vps/` and its `data.json` both return the catalog.

---

### Task 1: Convert the workbook

**Files:**
- Create: `requirements.txt`
- Create: `data/vds.xlsx` (copy of the attached snapshot)
- Create: `scripts/convert_vds.py`
- Create: `tests/test_convert.py`
- Create: `vps/data.json` (generated)
- Create: `.gitignore`

**Interfaces:**
- Consumes: sheet `vds` of the workbook.
- Produces: `convert_workbook(path: Path) -> dict` with `source` and `offers`. `write_catalog(xlsx, json_path) -> dict`. Offer keys, in order: `source_row`, `provider_site`, `provider_name`, `provider_age_days`, `tariff`, `price_rub`, `ram_gb`, `ram_raw`, `ram_unknown`, `cpu_count`, `cpu_freq_mhz`, `disk_size_gb`, `disk_size_raw`, `disk_type`, `traffic_tb`, `traffic_unlimited`, `traffic_raw`, `speed_mbps`, `speed_raw`, `location`, `virtualization`, `ipv6`, `payments`.

- [ ] **Step 1: Write the failing conversion tests**

Cover the real workbook (3038 rows, 8 unknown RAM labels, fractional RAM counts 35 / 9 / 1, 1803 unlimited rows, a `0.2 ТБ` row, no `1.5` or `2.5` RAM) and a synthetic workbook (RAM `0` stays known, a bad disk string raises `ValueError`). Assert `vps/data.json` deep-equals `convert_workbook`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `python3 -m unittest tests.test_convert -v`

Expected: import or file failure before the converter exists.

- [ ] **Step 3: Implement the converter and generate JSON**

Parse with `data_only=False`. Map date cells through English month abbreviations from the datetime day and month. Parse `N ГБ`, `N ТБ`, and `N МБит/с` with a dot or comma. `∞` is unlimited. Reject anything else. Write compact UTF-8 JSON with a trailing newline.

CLI: `python3 scripts/convert_vds.py data/vds.xlsx vps/data.json`

- [ ] **Step 4: Re-run the conversion tests**

Expected: all tests in `tests.test_convert` pass.

- [ ] **Step 5: Commit**

`git add` the files in this task. Message: `feat: convert VPS snapshot into catalog JSON`.

### Task 2: Filter and sort

**Files:**
- Create: `vps/catalog.js`
- Create: `tests/catalog.test.mjs`

**Interfaces:**
- Consumes: offer objects from Task 1.
- Produces:
  - `defaultState() -> State`
  - `filterOffers(offers, state) -> offers`
  - `sortOffers(offers, field | null, "asc" | "desc") -> offers`
  - `providerHref(site) -> string | null`
  - `matchesSearch(offer, query) -> boolean`

`State` keys: `search`, `price_rub`, `ram_gb`, `cpu_count`, `cpu_freq_mhz`, `disk_size`, `traffic`, `speed`, `disk_type`, `virtualization`, `ipv6`.

Range objects use `from` and `to` (`null` means open). `ram_gb.unknown` and `traffic.unlimited` are booleans. `cpu_count.choices` and `cpu_freq_mhz.choices` are number arrays. The three category fields are string arrays.

- [ ] **Step 1: Write the failing catalog tests**

Include AND of price range, disk type, and IPv6; inclusive bounds; from > to; RAM unknown versus RAM `0`; unlimited traffic OR a finite range; empty checkbox groups; search case and site; empty result; disk `9/20/100` numeric versus lexical; traffic `2` before `10`; infinity first when traffic sorts descending and last when ascending; unknown RAM last in both directions; stable equal keys; `providerHref` for `core.eu` and rejection of `javascript:alert(1)`.

- [ ] **Step 2: Run `node --test tests/catalog.test.mjs` and confirm failure**

- [ ] **Step 3: Implement `vps/catalog.js`**

Special rows match a field only when that field's special checkbox is on. Finite constraints on the same field AND together. Missing sort keys sort after real numbers in both directions. Unlimited traffic's sort key is `Number.POSITIVE_INFINITY`. Ties keep input order.

- [ ] **Step 4: Re-run `node --test tests/catalog.test.mjs`**

Expected: pass.

- [ ] **Step 5: Commit** `feat: filter and sort VPS offers in the browser`.

### Task 3: Russian page

**Files:**
- Create: `vps/index.html`
- Create: `vps/styles.css`
- Create: `vps/app.js`
- Create: `tests/test_page_assets.py`
- Create: `.nojekyll`

**Interfaces:**
- Consumes: `defaultState`, `filterOffers`, `sortOffers`, `providerHref`, and `./data.json`.
- Produces: a page that builds CPU checkboxes from the loaded offers, rerenders on every filter and sort input, and resets from one button.

- [ ] **Step 1: Write `tests/test_page_assets.py`**

Fail if `vps/index.html` or `vps/app.js` contain `src="/`, `href="/`, or `fetch("/`. Require `import.meta.url`, `./data.json`, `./catalog.js`, `./styles.css`, `lang="ru"`, and the source URL. Require `.nojekyll` to exist.

- [ ] **Step 2: Run `python3 -m unittest tests.test_page_assets -v` and confirm failure**

- [ ] **Step 3: Implement the page**

Filters above the table. Native inputs with labels. Sort buttons for the seven numeric columns only. `aria-sort` and `aria-live`. Warning control for unknown RAM uses the spec tooltip as both `title` and accessible name. Table wrapper scrolls horizontally. Empty state uses the spec sentence. `Сбросить` clears the form and sort. Data load uses `fetch(new URL("./data.json", import.meta.url))`.

- [ ] **Step 4: Re-run asset tests plus both previous suites**

- [ ] **Step 5: Commit** `feat: add the Russian VPS catalog page`.

### Task 4: Browser smoke, pull request, Pages

- [ ] Serve the repo root and open `/vps/`.
- [ ] Confirm the status shows 3038 of 3038, a price filter narrows the count, reset restores it, descending traffic starts with `∞`, and an unknown RAM cell exposes the warning.
- [ ] Save a screenshot of the filtered or sorted table.
- [ ] Open a pull request into `main`. Do not change `README.md`.
- [ ] If the token can merge without rewriting history, merge the pull request and enable Pages from `main` `/`. Then fetch the public `/vps/` URL and `/vps/data.json`. Report the verified status code and a snippet of the body. If merge or Pages settings are forbidden, leave the pull request open and report the exact API error.

## Self-review

- Spec coverage: conversion, damaged RAM, fractions, infinity, ranges, checkboxes, AND/OR, search, reset, numeric sort, lexical trap, unknown-last, relative URLs, README preservation, Pages verification. Each item is a task above.
- No placeholder tasks. UI strings stay in the spec so they are not copied two ways.
- Names match across tasks: `convert_workbook`, `filterOffers`, `sortOffers`, `providerHref`, `ram_unknown`, `traffic_unlimited`.
