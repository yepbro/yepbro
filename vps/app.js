import { defaultState, filterOffers, providerHref, sortOffers } from "./catalog.js";

const RAM_WARNING = "В исходной таблице это значение сохранено как дата Excel (формат d-mmm), а не как число гигабайт. Оно не пересчитано и не участвует в числовом сравнении.";
const EMPTY = "Ничего не найдено. Измените фильтры или сбросьте их.";
const priceFormat = new Intl.NumberFormat("ru-RU");

const form = document.querySelector("#filters");
const tbody = document.querySelector("#rows");
const count = document.querySelector("#count");
const resetButton = document.querySelector("#reset");

let offers = [];
let sortField = null;
let sortDirection = "asc";

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", render);
resetButton.addEventListener("click", () => {
  form.reset();
  sortField = null;
  sortDirection = "asc";
  updateSortHeaders();
  render();
});

for (const button of document.querySelectorAll("[data-sort]")) {
  button.addEventListener("click", () => {
    const field = button.dataset.sort;
    if (sortField === field) sortDirection = sortDirection === "asc" ? "desc" : "asc";
    else {
      sortField = field;
      sortDirection = "asc";
    }
    updateSortHeaders();
    render();
  });
}

try {
  const response = await fetch(new URL("./data.json", import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const catalog = await response.json();
  offers = catalog.offers;
  buildChoices("cpu-count-choices", "cpu_count", uniqueNumbers(offers, "cpu_count"));
  buildChoices("cpu-freq-choices", "cpu_freq_mhz", uniqueNumbers(offers, "cpu_freq_mhz"));
  updateSortHeaders();
  render();
} catch (error) {
  count.textContent = "Не удалось загрузить данные.";
  console.error(error);
}

function uniqueNumbers(rows, field) {
  return [...new Set(rows.map((row) => row[field]))].sort((left, right) => left - right);
}

function buildChoices(containerId, name, values) {
  const container = document.getElementById(containerId);
  for (const value of values) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = String(value);
    label.append(input, document.createTextNode(` ${value}`));
    container.append(label);
  }
}

function readNumber(name) {
  const value = form.elements[name].value.trim();
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readChecks(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function readState() {
  const state = defaultState();
  state.search = form.elements.search.value;
  state.price_rub = { from: readNumber("price_rub_from"), to: readNumber("price_rub_to") };
  state.ram_gb = {
    from: readNumber("ram_gb_from"),
    to: readNumber("ram_gb_to"),
    unknown: form.elements.ram_unknown.checked,
  };
  state.cpu_count = {
    from: readNumber("cpu_count_from"),
    to: readNumber("cpu_count_to"),
    choices: readChecks("cpu_count").map(Number),
  };
  state.cpu_freq_mhz = {
    from: readNumber("cpu_freq_mhz_from"),
    to: readNumber("cpu_freq_mhz_to"),
    choices: readChecks("cpu_freq_mhz").map(Number),
  };
  state.disk_size = { from: readNumber("disk_size_from"), to: readNumber("disk_size_to") };
  state.traffic = {
    from: readNumber("traffic_from"),
    to: readNumber("traffic_to"),
    unlimited: form.elements.traffic_unlimited.checked,
  };
  state.speed = { from: readNumber("speed_from"), to: readNumber("speed_to") };
  state.disk_type = readChecks("disk_type");
  state.virtualization = readChecks("virtualization");
  state.ipv6 = readChecks("ipv6");
  return state;
}

function render() {
  const visible = sortOffers(filterOffers(offers, readState()), sortField, sortDirection);
  count.textContent = `Показано ${visible.length} из ${offers.length}`;
  const fragment = document.createDocumentFragment();
  if (visible.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 16;
    cell.className = "empty";
    cell.textContent = EMPTY;
    row.append(cell);
    fragment.append(row);
  } else {
    for (const offer of visible) fragment.append(renderRow(offer));
  }
  tbody.replaceChildren(fragment);
}

function renderRow(offer) {
  const row = document.createElement("tr");
  row.append(
    textCell(offer.provider_name),
    siteCell(offer),
    textCell(offer.provider_age_days),
    textCell(offer.tariff, "wrap"),
    textCell(priceFormat.format(offer.price_rub)),
    ramCell(offer),
    textCell(offer.cpu_count),
    textCell(offer.cpu_freq_mhz),
    textCell(offer.disk_size_raw),
    textCell(offer.disk_type),
    textCell(offer.traffic_raw),
    textCell(offer.speed_raw),
    textCell(offer.location, "wrap"),
    textCell(offer.virtualization),
    textCell(offer.ipv6),
    textCell(offer.payments, "wrap"),
  );
  return row;
}

function textCell(value, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
  return cell;
}

function siteCell(offer) {
  const cell = document.createElement("td");
  const href = providerHref(offer.provider_site);
  if (!offer.provider_site) {
    cell.textContent = "—";
    return cell;
  }
  if (!href) {
    cell.textContent = offer.provider_site;
    return cell;
  }
  const link = document.createElement("a");
  link.href = href;
  link.textContent = offer.provider_site;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  cell.append(link);
  return cell;
}

function ramCell(offer) {
  const cell = document.createElement("td");
  cell.append(document.createTextNode(offer.ram_raw));
  if (!offer.ram_unknown) return cell;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "warn";
  button.title = RAM_WARNING;
  button.setAttribute("aria-label", RAM_WARNING);
  button.textContent = "!";
  cell.append(button);
  return cell;
}

function updateSortHeaders() {
  for (const button of document.querySelectorAll("[data-sort]")) {
    const active = button.dataset.sort === sortField;
    button.closest("th").setAttribute(
      "aria-sort",
      active ? (sortDirection === "asc" ? "ascending" : "descending") : "none",
    );
    if (active) button.dataset.direction = sortDirection;
    else delete button.dataset.direction;
  }
}
