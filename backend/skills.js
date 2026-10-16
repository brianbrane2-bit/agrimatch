// ============================================================
// SkillLink — Trade Registry
// The master list of trades supported by the platform.
// Each trade has a code (for USSD shortcuts) and a category.
// ============================================================

const CATEGORIES = {
  construction: { code: '1', label: 'Construction & Trades' },
  beauty:       { code: '2', label: 'Beauty & Personal Care' },
  repair:       { code: '3', label: 'Repair & Maintenance' },
  home:         { code: '4', label: 'Home Services' },
  agriculture:  { code: '5', label: 'Agriculture' },
  other:        { code: '6', label: 'Other Services' },
};

// Each trade belongs to one category.
// 'key' is the internal identifier (lowercase, no spaces).
// 'label' is what shows to users.
// 'category' links it to CATEGORIES above.
const TRADES = [
  // Construction & Trades
  { key: 'bricklayer',     label: 'Bricklayer',           category: 'construction' },
  { key: 'carpenter',      label: 'Carpenter',            category: 'construction' },
  { key: 'plumber',        label: 'Plumber',              category: 'construction' },
  { key: 'electrician',    label: 'Electrician',          category: 'construction' },
  { key: 'tiler',          label: 'Tiler',                category: 'construction' },
  { key: 'painter',        label: 'Painter',              category: 'construction' },
  { key: 'welder',         label: 'Welder',               category: 'construction' },
  { key: 'mason',          label: 'Mason',                category: 'construction' },

  // Beauty & Personal Care
  { key: 'barber',         label: 'Barber',               category: 'beauty' },
  { key: 'hairdresser',    label: 'Hairdresser',          category: 'beauty' },
  { key: 'nail_tech',      label: 'Nail Technician',      category: 'beauty' },
  { key: 'makeup_artist',  label: 'Makeup Artist',        category: 'beauty' },
  { key: 'tailor',         label: 'Tailor',               category: 'beauty' },

  // Repair & Maintenance
  { key: 'mechanic',       label: 'Mechanic',             category: 'repair' },
  { key: 'generator_rep',  label: 'Generator Repairer',   category: 'repair' },
  { key: 'phone_rep',      label: 'Phone Repairer',       category: 'repair' },
  { key: 'appliance_rep',  label: 'Appliance Repairer',   category: 'repair' },
  { key: 'ac_tech',        label: 'AC Technician',        category: 'repair' },

  // Home Services
  { key: 'cleaner',        label: 'Cleaner',              category: 'home' },
  { key: 'cook',           label: 'Cook',                 category: 'home' },
  { key: 'gardener',       label: 'Gardener',             category: 'home' },
  { key: 'security',       label: 'Security Guard',       category: 'home' },

  // Agriculture
  { key: 'farm_hand',      label: 'Farm Hand',            category: 'agriculture' },
  { key: 'tractor_op',     label: 'Tractor Operator',     category: 'agriculture' },

  // Other
  { key: 'driver',         label: 'Driver',               category: 'other' },
  { key: 'porter',         label: 'Porter / Loader',      category: 'other' },
];

// ============================================================
// HELPERS
// ============================================================

function getTradesByCategory(categoryKey) {
  return TRADES.filter((t) => t.category === categoryKey);
}

function getTradeByKey(key) {
  return TRADES.find((t) => t.key === key) || null;
}

function getTradeByLabel(label) {
  const normalized = String(label).trim().toLowerCase();
  return TRADES.find((t) => t.label.toLowerCase() === normalized) || null;
}

function getCategoryByCode(code) {
  const entry = Object.entries(CATEGORIES).find(([_, c]) => c.code === code);
  return entry ? { key: entry[0], ...entry[1] } : null;
}

function getTradeByNumberInCategory(categoryKey, numberInCategory) {
  const trades = getTradesByCategory(categoryKey);
  const idx = parseInt(numberInCategory, 10) - 1;
  if (idx < 0 || idx >= trades.length) return null;
  return trades[idx];
}

function isValidTradeKey(key) {
  return !!getTradeByKey(key);
}

function listCategoryLabels() {
  return Object.values(CATEGORIES).map((c) => c.label);
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  CATEGORIES,
  TRADES,
  getTradesByCategory,
  getTradeByKey,
  getTradeByLabel,
  getCategoryByCode,
  getTradeByNumberInCategory,
  isValidTradeKey,
  listCategoryLabels,
};