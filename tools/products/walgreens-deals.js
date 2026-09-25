export const DEFAULT_WALGREENS_FEED_URL =
  'https://www.walgreens.com/bin/search/articles/dow?categoryName=Deals+of+the+Week';

export const DEAL_OF_THE_WEEK_ATTRIBUTE = {
  code: 'deal_of_the_week',
  type: 'BOOLEAN',
  values: ['true'],
};

const text = (value) => (value == null ? '' : String(value).trim());

export function normalizeIdentifier(value) {
  return text(value).toUpperCase().replace(/[\s-]/g, '');
}

function first(record, names) {
  const name = names.find((candidate) => record[candidate] !== undefined
    && record[candidate] !== null && text(record[candidate]));
  return name ? text(record[name]) : '';
}

function offerKey(record) {
  const explicit = first(record, ['ezItemId', 'uid']);
  if (explicit) return explicit;
  return [
    first(record, ['apiwic', 'apiWic']),
    first(record, ['wic']),
    first(record, ['upc', 'gtin', 'barcode']),
    first(record, ['headline', 'title']),
    first(record, ['startDate', 'start']),
    first(record, ['endDate', 'end']),
  ].join('|').toLowerCase();
}

export function normalizeWalgreensFeed(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Walgreens Deals of the Week feed must be a JSON array.');
  }

  const seen = new Map();
  const duplicates = [];
  value.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`Walgreens feed record ${index + 1} must be an object.`);
    }
    const offer = {
      key: offerKey(record),
      apiwic: first(record, ['apiwic', 'apiWic', 'api_wic']),
      wic: first(record, ['wic']),
      upc: first(record, ['upc', 'gtin', 'barcode']),
      sku: first(record, ['sku', 'SKU']),
      headline: first(record, ['headline', 'title', 'name']),
      bodyCopy: first(record, ['bodyCopy', 'body', 'description']),
      offerText: first(record, ['offerText', 'offer', 'copy']),
      startDate: first(record, ['startDate', 'start', 'start_date']),
      endDate: first(record, ['endDate', 'end', 'end_date']),
      eventName: first(record, ['eventName', 'event', 'campaign']),
      imageUrl: first(record, ['imageUrl', 'image', 'imageURL']),
      offerUrl: first(record, ['offerUrl', 'url', 'link']),
    };
    if (!offer.key) offer.key = `record-${index + 1}`;
    const existing = seen.get(offer.key);
    if (existing) {
      existing.duplicateCount += 1;
      existing.duplicateDetails.push({ index, record });
      duplicates.push({ key: offer.key, index, record });
      return;
    }
    offer.duplicateCount = 1;
    offer.duplicateDetails = [];
    seen.set(offer.key, offer);
  });

  return { offers: [...seen.values()], duplicates };
}

export function isExpiredOffer(offer, now = new Date()) {
  if (!text(offer?.endDate)) return false;
  const end = new Date(offer.endDate);
  return !Number.isNaN(end.getTime()) && end < now;
}

export function isCurrentOffer(offer, now = new Date()) {
  if (isExpiredOffer(offer, now)) return false;
  if (!text(offer?.startDate)) return true;
  const start = new Date(offer.startDate);
  return Number.isNaN(start.getTime()) || start <= now;
}

function attributeEntries(product) {
  const entries = [];
  (product?.attributes || []).forEach((attribute) => {
    const code = text(attribute.code || attribute.name || attribute.attribute_code).toLowerCase();
    const values = Array.isArray(attribute.values)
      ? attribute.values
      : [attribute.value ?? attribute.values];
    values.filter((value) => text(value)).forEach((value) => entries.push({ code, value: text(value) }));
  });
  if (product?.sku) entries.push({ code: 'sku', value: text(product.sku) });
  return entries;
}

function productValues(product, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return attributeEntries(product)
    .filter(({ code }) => wanted.some((name) => code === name || code.includes(name)))
    .map(({ value }) => normalizeIdentifier(value))
    .filter(Boolean);
}

function mappedSkuFor(offer, mappings) {
  if (!mappings || typeof mappings !== 'object') return '';
  return text(mappings[offer.key] || mappings[offer.ezItemId] || mappings[offer.upc]);
}

export function matchWalgreensOffers(offers, products, mappings = {}, now = new Date()) {
  const catalog = Array.isArray(products) ? products : [];
  return (Array.isArray(offers) ? offers : []).map((offer) => {
    if (offer.duplicateCount > 1) {
      return { offer, status: 'duplicate', product: null, reason: 'Duplicate feed key.' };
    }
    if (isExpiredOffer(offer, now)) {
      return { offer, status: 'expired', product: null, reason: 'Offer end date has passed.' };
    }

    const strategies = [
      ['upc', ['upc', 'gtin', 'barcode'], offer.upc],
      ['apiwic', ['apiwic', 'api_wic'], offer.apiwic],
      ['wic', ['wic'], offer.wic],
    ];
    for (let index = 0; index < strategies.length; index += 1) {
      const [method, names, identifier] = strategies[index];
      const normalized = normalizeIdentifier(identifier);
      if (!normalized) continue;
      const matches = catalog.filter((product) => productValues(product, names).includes(normalized));
      if (matches.length === 1) return { offer, status: 'matched', method, product: matches[0] };
      if (matches.length > 1) {
        return { offer, status: 'ambiguous', method, product: null, candidates: matches };
      }
    }

    const mappedSku = mappedSkuFor(offer, mappings);
    if (mappedSku) {
      const matches = catalog.filter((product) => normalizeIdentifier(product.sku) === normalizeIdentifier(mappedSku));
      if (matches.length === 1) return { offer, status: 'matched', method: 'mapping', product: matches[0] };
      return { offer, status: 'unmatched', method: 'mapping', product: null, reason: 'Mapped SKU is unavailable.' };
    }

    if (offer.sku) {
      const matches = catalog.filter((product) => normalizeIdentifier(product.sku) === normalizeIdentifier(offer.sku));
      if (matches.length === 1) return { offer, status: 'matched', method: 'sku', product: matches[0] };
      if (matches.length > 1) return { offer, status: 'ambiguous', method: 'sku', product: null, candidates: matches };
    }
    return { offer, status: 'unmatched', product: null, reason: 'No deterministic identifier match.' };
  });
}

export function mergeDealOfWeekAttribute(attributes = []) {
  const existing = Array.isArray(attributes) ? attributes : [];
  const merged = existing
    .filter((attribute) => text(attribute?.code || attribute?.name).toLowerCase() !== DEAL_OF_THE_WEEK_ATTRIBUTE.code)
    .map((attribute) => {
      const code = text(attribute.code || attribute.name);
      const values = Array.isArray(attribute.values)
        ? attribute.values.map(text).filter(Boolean)
        : [text(attribute.value)].filter(Boolean);
      return { code, type: text(attribute.type).toUpperCase() || 'STRING', values };
    })
    .filter((attribute) => attribute.code && attribute.values.length);
  return [...merged, { ...DEAL_OF_THE_WEEK_ATTRIBUTE }];
}

export function buildDealOfWeekProductPayload(product) {
  return {
    sku: product.sku,
    source: { locale: 'en-US' },
    attributes: mergeDealOfWeekAttribute(product.attributes),
  };
}
