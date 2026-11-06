# VPS catalog design

Static Russian catalog of the public VPS/VDS snapshot, published at `/vps/` on GitHub Pages for `yepbro/yepbro`. The profile `README.md` on `main` stays unchanged.

## Goal

A visitor can compare all 3038 tariff rows in the browser: filter, sort, and open a provider site when the snapshot has one. There is no backend and no account. Prices are a saved snapshot, not a live quote.

## Source

- Public file: <https://disk.yandex.ru/i/y1pidZ0n-ur9_Q>
- Sheet: `vds`
- Data rows: 3038 (header plus 3038). Columns used, in order: `provider_site`, `provider_name`, `provider_age_days`, `tariff`, `price_rub`, `ram_gb`, `cpu_count`, `cpu_freq_mhz`, `disk_size`, `disk_type`, `traffic`, `speed`, `location`, `virtualization`, `ipv6`, `payments`
- Workbook property `modified`: `2026-03-10T19:34:39`. That timestamp is the snapshot clock. The page must not say the prices were checked again.
- Duplicate rows are real rows. Keep all 3038. Do not dedupe.
- Empty extra columns past `payments` are ignored.
- The committed workbook is `data/vds.xlsx`. `vps/data.json` is generated from it and is what the page loads.

## Publishing

- Repository: `yepbro/yepbro` (project site, not a `*.github.io` user site).
- Expected public URL shape: `https://yepbro.github.io/yepbro/vps/`
- Pages source, once enabled: branch `main`, folder `/` (repository root). The catalog lives in `vps/`, so the profile README is not replaced.
- Assets are relative to the page (`./styles.css`, `./app.js`, `./data.json`, and `fetch` via `import.meta.url`). No `<base>` tag. No absolute site-root paths. The same files must work if the site is later moved under another prefix.
- Add a root `.nojekyll` so Pages serves `data.json` as a static file.
- Do not claim the URL is live until an HTTP fetch of the deployed page and `data.json` succeeds.
- Work lands on a branch and pull request. Merging and enabling Pages are attempted only when the token can do so without rewriting history or replacing `README.md`. If either step is blocked, the pull request stays open and the blocker is reported.

## Stack

- Converter: Python 3, `openpyxl==3.1.5` (`requirements.txt`).
- Page: HTML, CSS, and ES modules. No bundler, no framework, no external font, script, or stylesheet host.
- Tests: `python3 -m unittest` and `node --test`.

## Normalized offer

Each offer keeps the source row number (`source_row`, first data row is 2) and the original display strings.

| Field | Rule |
| --- | --- |
| `provider_site` | Hostname string, or `null` when the cell is empty (760 rows). |
| `provider_name` | String. Always present. |
| `provider_age_days` | Integer, or `null` when the site cell is empty. The snapshot keeps these nulls aligned with site and payments. |
| `tariff` | String. |
| `price_rub` | Integer rubles. Always present. Range in this snapshot: 75–217715. |
| `ram_gb` | Number when the cell is numeric, or `null` when unknown. |
| `ram_raw` | Display text. Numbers stay decimal (`0.5`, `0.6`, `0.75`, `8`). Date cells become the Excel `d-mmm` text `1-May` or `2-May`. |
| `ram_unknown` | `true` only for the eight date cells. |
| `cpu_count` | Integer. |
| `cpu_freq_mhz` | Integer megahertz, including the six rows whose value is `2`. Do not rewrite them. |
| `disk_size_gb` | Number parsed from `N ГБ` (dot or comma decimal). |
| `disk_size_raw` | Original string, for example `40 ГБ`. |
| `disk_type` | `NVMe`, `SSD`, or `HDD`. |
| `traffic_tb` | Number of terabytes, or `null` when unlimited. |
| `traffic_unlimited` | `true` when the cell is exactly `∞` (1803 rows). |
| `traffic_raw` | Original string (`20 ТБ`, `0.2 ТБ`, `∞`). |
| `speed_mbps` | Number parsed from `N МБит/с`. |
| `speed_raw` | Original string. |
| `location` | String. |
| `virtualization` | `KVM`, `VMware`, `OpenVZ`, `XEN`, or `Hyper-V`. |
| `ipv6` | `да` or `нет`. |
| `payments` | String, or `null`. |

Unknown is not zero. A numeric `0` would stay `0` and `ram_unknown: false`. This snapshot has no numeric zeros; tests still cover a synthetic `0` against a null.

The converter rejects a row it cannot parse. It does not drop the row and does not invent a number.

### Damaged RAM

Eight `ram_gb` cells are Excel dates with number format `d-mmm`:

- six cells display `1-May` (openpyxl datetime month 5, day 1)
- two cells display `2-May`

They are stored as `ram_unknown: true`, `ram_gb: null`, `ram_raw` `1-May` or `2-May`. They are not converted to `1.5` or `2.5`. The month abbreviation is English, matching the `d-mmm` examples, not the process locale.

String values `0.5` (35), `0.75` (9), and `0.6` (1) parse as those decimals. Integer cells stay integers.

## Filters

Filters are AND across fields. Inside one checkbox group, selected values are OR. An empty checkbox group adds no constraint. Range bounds are inclusive. An empty bound is open. If the lower bound is greater than the upper bound, the numeric side matches nothing.

A missing numeric value never counts as zero. It fails a range or a numeric checkbox comparison. A separate control can include it.

| Field | Controls |
| --- | --- |
| `price_rub` | From / to. 1187 distinct values, so no value checklist. |
| `ram_gb` | From / to, plus one checkbox `Неизвестно`. 53 numeric values, so no value checklist. |
| `cpu_count` | From / to, plus a checkbox per distinct value. 37 values, which is at or under the cutoff of 40. |
| `cpu_freq_mhz` | From / to, plus a checkbox per distinct value. 33 values. |
| `disk_size` | From / to, in GB. 127 values. |
| `traffic` | From / to, in TB, plus one checkbox `Безлимит (∞)`. 45 finite values, above the cutoff. |
| `speed` | From / to, in Mbit/s. 46 values. |
| `disk_type` | Checkboxes `NVMe`, `SSD`, `HDD`. No range. |
| `virtualization` | Checkboxes `KVM`, `VMware`, `OpenVZ`, `XEN`, `Hyper-V`. No range. |
| `ipv6` | Checkboxes `да`, `нет`. No range. |

The cutoff of 40 is the definition of "few discrete values" for this page. `traffic` (45) and `speed` (46) stay range-only apart from the unlimited switch.

On one numeric field, the finite constraints AND together, and the special checkbox is a separate alternative:

- no range, no value checks, special off: every row
- range only: known numbers inside the range; unknown or unlimited rows drop out
- special only (`Неизвестно` or `Безлимит`): only those rows
- range and/or value checks, plus special: (known number that satisfies every finite constraint) OR special row
- value checks and a range, special off: known number in the set AND in the range

Text search is one field. It is a case-insensitive substring over `provider_name`, `tariff`, `location`, and `provider_site` (empty site is an empty string). It ANDs with the other filters. Surrounding spaces are ignored. An empty query matches everything.

`Сбросить` restores the default state: empty search, open ranges, no checkboxes, original source order, no sort column.

The status line is `Показано N из 3038`. When N is 0, the table body is replaced by `Ничего не найдено. Измените фильтры или сбросьте их.`

## Sort

These headers sort, and only these: price, RAM, CPU count, CPU frequency, disk size, traffic, speed. The control is a button in the header. The first activation sorts ascending; each further activation of the same header flips between descending and ascending. Activating a different header starts at ascending. Only `Сбросить` returns to source order. `aria-sort` is `ascending`, `descending`, or `none`.

Comparison is numeric, using `price_rub`, `ram_gb`, `cpu_count`, `cpu_freq_mhz`, `disk_size_gb`, `traffic_tb`, and `speed_mbps`. Equal keys keep source order.

`traffic_unlimited` sorts as positive infinity: ascending places `∞` after every finite traffic value, descending places it first. This is not a string sort of `∞` or of `10 ТБ` versus `2 ТБ`.

Unknown RAM (`ram_gb === null`) sorts after every known RAM value in both directions. It is not treated as 0.

Disk, traffic, and speed must not use lexical order. Numeric order is `9 ГБ`, `20 ГБ`, `100 ГБ`, and `2 ТБ` before `10 ТБ`.

## Table and links

Visible columns, left to right: provider, site, age in days, tariff, price, RAM, CPU count, CPU frequency, disk size, disk type, traffic, speed, location, virtualization, IPv6, payments. Empty site, age, or payments render as `—`.

A site link is rendered only for a hostname of letters, digits, dots, and hyphens with a dot and a letter TLD. The href is `https://` plus that hostname. Any other site value is plain text. This snapshot's 148 hostnames all match.

Unknown RAM shows `ram_raw`, then a focusable warning control whose accessible name and `title` are: `В исходной таблице это значение сохранено как дата Excel (формат d-mmm), а не как число гигабайт. Оно не пересчитано и не участвует в числовом сравнении.`

Numbers in the price column use Russian grouping. Other numeric columns show the original measurement string when one exists (`40 ГБ`, `20 ТБ`, `1000 МБит/с`) and a plain integer otherwise.

## Page copy

- Document title: `Каталог VPS`
- `lang`: `ru`
- Heading: `Каталог VPS`
- Lead: `Сравнение тарифов из публичного снимка. Цифры ниже не перепроверялись.`
- Source paragraph: `Источник: публичный файл на Яндекс.Диске, лист «vds», 3038 строк. В свойствах книги указано изменение 10 марта 2026 года. Это сохранённый снимок: цены и характеристики не проверялись заново и могут отличаться от сайтов провайдеров.` The URL is the link.
- Search label: `Поиск по провайдеру, тарифу, сайту или локации`
- Range labels: `от` and `до`
- Reset: `Сбросить`

## Layout and access

- Filters sit above the table in a wrapping grid.
- Checkbox lists for CPU count and frequency scroll inside the fieldset (`max-height` about 9rem) so the page stays usable.
- The table sits in a region with `overflow-x: auto` and a wide minimum table width, so a narrow viewport scrolls horizontally instead of crushing columns.
- Every filter is a native labeled control (`input` or `checkbox`). Sort and reset are `button` elements. Focus is visible. Status uses `aria-live="polite"`.
- Colors are a light paper background, near-black text, and a dark green accent. Contrast of text on paper is at least 4.5:1. No remote assets.

## Tests

1. Conversion of `data/vds.xlsx` yields 3038 offers, the RAM date counts and raw labels above, the fractional RAM counts, 1803 unlimited traffic rows, decimal traffic such as `0.2`, and no guessed `1.5` / `2.5`.
2. A synthetic workbook proves an unparseable disk, traffic, or speed cell raises, and a numeric RAM of `0` stays zero and known.
3. `vps/data.json` equals a fresh conversion.
4. Filter tests: single range, inclusive bounds, unknown excluded from a RAM range, unknown included only by its checkbox, `0` distinct from unknown, unlimited traffic the same way, checkbox OR, cross-field AND, search, empty result, from-greater-than-to.
5. Sort tests: numeric disk and traffic versus lexical order, infinity first on descending traffic and last on ascending, unknown RAM last both ways, stable tie order.
6. `providerHref` accepts the snapshot host form and rejects `javascript:` and empty values.
7. `vps/index.html` and `vps/app.js` reference only relative assets, and `app.js` loads data from `import.meta.url`.
8. Browser smoke, when a browser is available: open the page under a `/vps/` prefix, see 3038 rows, apply a filter, sort traffic so `∞` leads descending, see an unknown-RAM warning, reset, and capture a screenshot.

## Out of scope

Payments, age, provider, tariff, and location are not separate filters beyond the text search. There is no pagination, account, price refresh, or correction of suspicious frequency values.
