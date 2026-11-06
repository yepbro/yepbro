const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const SORT_KEYS = {
  price_rub: (offer) => offer.price_rub,
  ram_gb: (offer) => (offer.ram_unknown ? null : offer.ram_gb),
  cpu_count: (offer) => offer.cpu_count,
  cpu_freq_mhz: (offer) => offer.cpu_freq_mhz,
  disk_size: (offer) => offer.disk_size_gb,
  traffic: (offer) => (offer.traffic_unlimited ? Number.POSITIVE_INFINITY : offer.traffic_tb),
  speed: (offer) => offer.speed_mbps,
};

export function defaultState() {
  return {
    search: "",
    price_rub: { from: null, to: null },
    ram_gb: { from: null, to: null, unknown: false },
    cpu_count: { from: null, to: null, choices: [] },
    cpu_freq_mhz: { from: null, to: null, choices: [] },
    disk_size: { from: null, to: null },
    traffic: { from: null, to: null, unlimited: false },
    speed: { from: null, to: null },
    disk_type: [],
    virtualization: [],
    ipv6: [],
  };
}

export function matchesSearch(offer, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  const haystack = [offer.provider_name, offer.tariff, offer.location, offer.provider_site ?? ""]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

export function providerHref(site) {
  if (typeof site !== "string") return null;
  const host = site.trim();
  if (!HOSTNAME.test(host)) return null;
  return `https://${host}`;
}

export function filterOffers(offers, state) {
  return offers.filter((offer) => offerMatches(offer, state));
}

export function sortOffers(offers, field, direction) {
  if (!field) return offers.slice();
  const keyOf = SORT_KEYS[field];
  if (!keyOf) throw new Error(`Unknown sort field: ${field}`);
  const sign = direction === "desc" ? -1 : 1;
  return offers
    .map((offer, index) => ({ offer, index, key: keyOf(offer) }))
    .sort((left, right) => compareKeys(left, right, sign))
    .map((item) => item.offer);
}

function offerMatches(offer, state) {
  if (!matchesSearch(offer, state.search)) return false;
  if (!numericField(offer.price_rub, false, state.price_rub)) return false;
  if (!numericField(offer.ram_unknown ? null : offer.ram_gb, offer.ram_unknown, {
    from: state.ram_gb.from,
    to: state.ram_gb.to,
    special: state.ram_gb.unknown,
  })) return false;
  if (!numericField(offer.cpu_count, false, state.cpu_count)) return false;
  if (!numericField(offer.cpu_freq_mhz, false, state.cpu_freq_mhz)) return false;
  if (!numericField(offer.disk_size_gb, false, state.disk_size)) return false;
  if (!numericField(offer.traffic_unlimited ? null : offer.traffic_tb, offer.traffic_unlimited, {
    from: state.traffic.from,
    to: state.traffic.to,
    special: state.traffic.unlimited,
  })) return false;
  if (!numericField(offer.speed_mbps, false, state.speed)) return false;
  if (!selected(offer.disk_type, state.disk_type)) return false;
  if (!selected(offer.virtualization, state.virtualization)) return false;
  if (!selected(offer.ipv6, state.ipv6)) return false;
  return true;
}

function numericField(value, unknown, { from = null, to = null, choices = [], special = false } = {}) {
  const hasRange = from !== null && from !== undefined || to !== null && to !== undefined;
  const hasChoices = Array.isArray(choices) && choices.length > 0;
  if (!hasRange && !hasChoices && !special) return true;
  if (unknown) return Boolean(special);
  if (special && !hasRange && !hasChoices) return false;
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  if (from !== null && from !== undefined && value < from) return false;
  if (to !== null && to !== undefined && value > to) return false;
  if (hasChoices && !choices.includes(value)) return false;
  return true;
}

function selected(value, choices) {
  if (!choices || choices.length === 0) return true;
  return choices.includes(value);
}

function compareKeys(left, right, sign) {
  const leftMissing = left.key === null || left.key === undefined || Number.isNaN(left.key);
  const rightMissing = right.key === null || right.key === undefined || Number.isNaN(right.key);
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return left.index - right.index;
    return leftMissing ? 1 : -1;
  }
  if (left.key === right.key) return left.index - right.index;
  return left.key < right.key ? -sign : sign;
}
