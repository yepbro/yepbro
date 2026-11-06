import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultState,
  filterOffers,
  matchesSearch,
  providerHref,
  sortOffers,
} from "../vps/catalog.js";

function offer(overrides = {}) {
  return {
    source_row: 2,
    provider_site: "example.com",
    provider_name: "Example",
    provider_age_days: 10,
    tariff: "Start",
    price_rub: 100,
    ram_gb: 1,
    ram_raw: "1",
    ram_unknown: false,
    cpu_count: 1,
    cpu_freq_mhz: 2000,
    disk_size_gb: 20,
    disk_size_raw: "20 ГБ",
    disk_type: "SSD",
    traffic_tb: 1,
    traffic_unlimited: false,
    traffic_raw: "1 ТБ",
    speed_mbps: 100,
    speed_raw: "100 МБит/с",
    location: "Россия",
    virtualization: "KVM",
    ipv6: "да",
    payments: "Карта",
    ...overrides,
  };
}

test("price, disk type, and ipv6 combine with AND", () => {
  const rows = [
    offer({ source_row: 2, price_rub: 100, disk_type: "NVMe", ipv6: "да" }),
    offer({ source_row: 3, price_rub: 100, disk_type: "SSD", ipv6: "да" }),
    offer({ source_row: 4, price_rub: 500, disk_type: "NVMe", ipv6: "да" }),
    offer({ source_row: 5, price_rub: 100, disk_type: "NVMe", ipv6: "нет" }),
  ];
  const state = defaultState();
  state.price_rub = { from: 0, to: 200 };
  state.disk_type = ["NVMe"];
  state.ipv6 = ["да"];
  assert.deepEqual(filterOffers(rows, state).map((row) => row.source_row), [2]);
});

test("ranges are inclusive and an inverted range matches nothing", () => {
  const rows = [
    offer({ source_row: 2, price_rub: 100 }),
    offer({ source_row: 3, price_rub: 200 }),
    offer({ source_row: 4, price_rub: 300 }),
  ];
  const inside = defaultState();
  inside.price_rub = { from: 100, to: 200 };
  assert.deepEqual(filterOffers(rows, inside).map((row) => row.source_row), [2, 3]);

  const inverted = defaultState();
  inverted.price_rub = { from: 300, to: 100 };
  assert.deepEqual(filterOffers(rows, inverted), []);
});

test("unknown RAM is distinct from zero and from a numeric range", () => {
  const rows = [
    offer({ source_row: 2, ram_gb: 0, ram_raw: "0", ram_unknown: false }),
    offer({ source_row: 3, ram_gb: null, ram_raw: "1-May", ram_unknown: true }),
    offer({ source_row: 4, ram_gb: 2, ram_raw: "2", ram_unknown: false }),
  ];
  const range = defaultState();
  range.ram_gb = { from: 0, to: 0, unknown: false };
  assert.deepEqual(filterOffers(rows, range).map((row) => row.source_row), [2]);

  const onlyUnknown = defaultState();
  onlyUnknown.ram_gb = { from: null, to: null, unknown: true };
  assert.deepEqual(filterOffers(rows, onlyUnknown).map((row) => row.source_row), [3]);

  const either = defaultState();
  either.ram_gb = { from: 2, to: 2, unknown: true };
  assert.deepEqual(filterOffers(rows, either).map((row) => row.source_row), [3, 4]);
});

test("unlimited traffic is excluded from a range unless selected", () => {
  const rows = [
    offer({ source_row: 2, traffic_tb: 2, traffic_unlimited: false, traffic_raw: "2 ТБ" }),
    offer({ source_row: 3, traffic_tb: 10, traffic_unlimited: false, traffic_raw: "10 ТБ" }),
    offer({ source_row: 4, traffic_tb: null, traffic_unlimited: true, traffic_raw: "∞" }),
  ];
  const range = defaultState();
  range.traffic = { from: 1, to: 5, unlimited: false };
  assert.deepEqual(filterOffers(rows, range).map((row) => row.source_row), [2]);

  const both = defaultState();
  both.traffic = { from: 1, to: 5, unlimited: true };
  assert.deepEqual(filterOffers(rows, both).map((row) => row.source_row), [2, 4]);
});

test("empty checkbox groups add no constraint and choices AND with the range", () => {
  const rows = [
    offer({ source_row: 2, cpu_count: 1, virtualization: "KVM" }),
    offer({ source_row: 3, cpu_count: 2, virtualization: "OpenVZ" }),
    offer({ source_row: 4, cpu_count: 4, virtualization: "KVM" }),
  ];
  assert.equal(filterOffers(rows, defaultState()).length, 3);

  const state = defaultState();
  state.cpu_count = { from: 1, to: 2, choices: [2, 4] };
  state.virtualization = ["KVM", "XEN"];
  assert.deepEqual(filterOffers(rows, state).map((row) => row.source_row), []);

  state.cpu_count = { from: 1, to: 4, choices: [2, 4] };
  assert.deepEqual(filterOffers(rows, state).map((row) => row.source_row), [4]);
});

test("search matches provider, tariff, site, and location without case", () => {
  const row = offer({
    provider_name: "FirstByte",
    tariff: "MSK-KVM",
    provider_site: "firstbyte.ru",
    location: "Россия",
  });
  assert.equal(matchesSearch(row, "  firstbyte "), true);
  assert.equal(matchesSearch(row, "msk-kvm"), true);
  assert.equal(matchesSearch(row, "РОССИЯ"), true);
  assert.equal(matchesSearch(row, "missing"), false);
  assert.equal(matchesSearch(row, "   "), true);

  const state = defaultState();
  state.search = "missing";
  assert.deepEqual(filterOffers([row], state), []);
});

test("disk size and traffic sort numerically, not lexically", () => {
  const rows = [
    offer({ source_row: 2, disk_size_gb: 100, disk_size_raw: "100 ГБ", traffic_tb: 10, traffic_raw: "10 ТБ" }),
    offer({ source_row: 3, disk_size_gb: 20, disk_size_raw: "20 ГБ", traffic_tb: 2, traffic_raw: "2 ТБ" }),
    offer({ source_row: 4, disk_size_gb: 9, disk_size_raw: "9 ГБ", traffic_tb: 9, traffic_raw: "9 ТБ" }),
  ];
  const lexical = rows.map((row) => row.disk_size_raw).sort();
  const numeric = sortOffers(rows, "disk_size", "asc").map((row) => row.disk_size_raw);
  assert.deepEqual(numeric, ["9 ГБ", "20 ГБ", "100 ГБ"]);
  assert.notDeepEqual(lexical, numeric);
  assert.deepEqual(
    sortOffers(rows, "traffic", "asc").map((row) => row.traffic_raw),
    ["2 ТБ", "9 ТБ", "10 ТБ"],
  );
});

test("infinity sorts after finite traffic ascending and before it descending", () => {
  const rows = [
    offer({ source_row: 2, traffic_tb: 10, traffic_unlimited: false, traffic_raw: "10 ТБ" }),
    offer({ source_row: 3, traffic_tb: null, traffic_unlimited: true, traffic_raw: "∞" }),
    offer({ source_row: 4, traffic_tb: 2, traffic_unlimited: false, traffic_raw: "2 ТБ" }),
  ];
  assert.deepEqual(sortOffers(rows, "traffic", "asc").map((row) => row.traffic_raw), ["2 ТБ", "10 ТБ", "∞"]);
  assert.deepEqual(sortOffers(rows, "traffic", "desc").map((row) => row.traffic_raw), ["∞", "10 ТБ", "2 ТБ"]);
});

test("unknown RAM sorts last in both directions and equal prices stay stable", () => {
  const rows = [
    offer({ source_row: 2, ram_gb: 1, ram_unknown: false, price_rub: 100 }),
    offer({ source_row: 3, ram_gb: null, ram_unknown: true, ram_raw: "1-May", price_rub: 100 }),
    offer({ source_row: 4, ram_gb: 8, ram_unknown: false, price_rub: 50 }),
  ];
  assert.deepEqual(sortOffers(rows, "ram_gb", "asc").map((row) => row.source_row), [2, 4, 3]);
  assert.deepEqual(sortOffers(rows, "ram_gb", "desc").map((row) => row.source_row), [4, 2, 3]);
  assert.deepEqual(sortOffers(rows, "price_rub", "asc").map((row) => row.source_row), [4, 2, 3]);
  assert.deepEqual(sortOffers(rows, null, "asc").map((row) => row.source_row), [2, 3, 4]);
});

test("provider links are https hostnames only", () => {
  assert.equal(providerHref("core.eu"), "https://core.eu");
  assert.equal(providerHref(" firstbyte.ru "), "https://firstbyte.ru");
  assert.equal(providerHref(null), null);
  assert.equal(providerHref(""), null);
  assert.equal(providerHref("javascript:alert(1)"), null);
  assert.equal(providerHref("https://example.com"), null);
});
