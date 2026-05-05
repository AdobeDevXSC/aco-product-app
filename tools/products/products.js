import DA_SDK from 'https://da.live/nx/utils/sdk.js';

/**
 * Same keys as aco-sample-catalog-data-ingestion `.env`, plus catalog view for GraphQL
 * and optional default price book id for prices/search.
 * Values are read from localStorage first; non-secret URL parts fall back to demo defaults.
 */
const ACO_LS_KEYS = {
  CLIENT_ID: 'CLIENT_ID',
  CLIENT_SECRET: 'CLIENT_SECRET',
  /** Bearer for Data Ingestion only; use when browser cannot call IMS (CORS). From Developer Console → Generate Access Token. */
  INGESTION_ACCESS_TOKEN: 'INGESTION_ACCESS_TOKEN',
  TENANT_ID: 'TENANT_ID',
  REGION: 'REGION',
  ENVIRONMENT: 'ENVIRONMENT',
  CATALOG_VIEW_ID: 'CATALOG_VIEW_ID',
  PRICE_BOOK_ID: 'PRICE_BOOK_ID',
};

/** commerce/settings.json row keys (often lowercase snake_case) → localStorage env names */
const COMMERCE_SETTINGS_JSON_KEYS = {
  client_id: ACO_LS_KEYS.CLIENT_ID,
  client_secret: ACO_LS_KEYS.CLIENT_SECRET,
  ingestion_access_token: ACO_LS_KEYS.INGESTION_ACCESS_TOKEN,
  tenant_id: ACO_LS_KEYS.TENANT_ID,
  tenet_id: ACO_LS_KEYS.TENANT_ID,
  region: ACO_LS_KEYS.REGION,
  env: ACO_LS_KEYS.ENVIRONMENT,
  environment: ACO_LS_KEYS.ENVIRONMENT,
  catalog_view_id: ACO_LS_KEYS.CATALOG_VIEW_ID,
  price_book_id: ACO_LS_KEYS.PRICE_BOOK_ID,
};

const DEFAULT_TENANT_ID = 'NZwP3wKPFXBCTLGqxYWZne';
const DEFAULT_REGION = 'na1';
const DEFAULT_ENVIRONMENT = 'sandbox';
const DEFAULT_CATALOG_VIEW_ID = '426ffe32-e0a9-4c53-8ec9-3f7118cbf6b2';

const PAGE_SIZE = 25;
const DEFAULT_LOCALE = 'en-US';
/** Fallback when PRICE_BOOK_ID is not set in Commerce settings */
const DEFAULT_PRICE_BOOK_FALLBACK = 'wknd_global';
/** Extra ids kept in the catalog filter dropdown alongside your configured default */
const SAMPLE_PRICE_BOOKS = ['wknd_global', 'wknd_vip'];

/**
 * Paste-grid columns aligned with FeedProduct objects in
 * https://github.com/adobe-commerce/aco-sample-catalog-data-ingestion/blob/main/data/products.json
 * (plus price / priceBookId, which live in separate sample files but are submitted together here).
 */
const PASTE_GRID_COLUMNS = [
  { field: 'sku', header: 'SKU', placeholder: 'aur-flu-bat-mid-2013' },
  { field: 'locale', header: 'Locale', placeholder: DEFAULT_LOCALE },
  { field: 'name', header: 'Name', placeholder: 'Product name' },
  { field: 'slug', header: 'Slug', placeholder: 'url-slug (optional)' },
  { field: 'status', header: 'Status', placeholder: 'ENABLED' },
  { field: 'shortDescription', header: 'Short description', textarea: true, rows: 2 },
  { field: 'description', header: 'Description', textarea: true, rows: 3 },
  { field: 'visibleIn', header: 'VisibleIn', placeholder: 'CATALOG,SEARCH' },
  { field: 'metaTitle', header: 'Meta title', placeholder: 'metaTags.title' },
  { field: 'metaDescription', header: 'Meta description', textarea: true, rows: 2 },
  {
    field: 'metaKeywords',
    header: 'Meta keywords',
    placeholder: 'comma-separated (JSON files use keywords[])',
  },
  { field: 'imageUrl', header: 'Image URL', inputType: 'url', placeholder: 'images[0].url' },
  { field: 'imageLabel', header: 'Image label', placeholder: 'images[0].label' },
  {
    field: 'imageRoles',
    header: 'Image roles',
    placeholder: 'THUMBNAIL,BASE,SMALL',
  },
  {
    field: 'attributesJson',
    header: 'Attributes JSON',
    textarea: true,
    rows: 3,
    placeholder: '[{"code":"brand","type":"STRING","values":["Aurora"]}]',
  },
  {
    field: 'linksJson',
    header: 'Links JSON',
    textarea: true,
    rows: 2,
    placeholder: '[{"sku":"related-sku","type":"related"}]',
  },
  {
    field: 'routesJson',
    header: 'Routes JSON',
    textarea: true,
    rows: 2,
    placeholder: '[{"path":"battery"},{"path":"battery/brand"}]',
  },
  { field: 'price', header: 'Price', placeholder: 'from prices.json / manual' },
  {
    field: 'priceBookId',
    header: 'Price book',
    placeholder: 'Per-row override (optional)',
  },
];

/** When the paste grid Attributes JSON column is empty, ingestion still gets a minimal `brand` attribute. */
const PASTE_GRID_DEFAULT_BRAND = 'Unknown';

/**
 * Best-effort brand label from a product title (e.g. "Tide Laundry Detergent, 3-in-1…" → "Tide").
 */
function guessBrandFromProductName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';

  const beforeComma = raw.split(',')[0].trim();
  const parts = beforeComma.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length && /^(a|an|the)$/i.test(parts[i])) {
    i += 1;
  }
  const w = parts[i] || '';
  const cleaned = w.replace(/[^\w&'-]/g, '');
  if (cleaned.length < 2) return '';
  return cleaned;
}

function defaultBrandAttributesArray(brandValue) {
  const v = String(brandValue || '').trim() || PASTE_GRID_DEFAULT_BRAND;
  // Data Ingestion ProductAttribute: { code, values } only (see @adobe-commerce/aco-ts-sdk)
  return [{ code: 'brand', values: [v] }];
}

function defaultBrandAttributesJson(brandValue) {
  return JSON.stringify(defaultBrandAttributesArray(brandValue));
}

/**
 * Coerce paste / form / JSON attribute rows to ingestion ProductAttribute[] ({ code, values: string[] }).
 * Fixes scalar `values` (e.g. "Tide") which previously became [""], and drops non-schema fields like `type`.
 */
function normalizeAttributesForIngestion(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const out = [];
  rawList.forEach((attr) => {
    if (!attr || typeof attr !== 'object' || Array.isArray(attr)) return;

    const code = String(attr.code ?? attr.name ?? attr.attribute_code ?? '').trim();
    if (!code) return;

    let values = [];
    if (Array.isArray(attr.values)) {
      values = attr.values.map((v) => (v == null ? '' : String(v).trim()));
    } else if (attr.values !== undefined && attr.values !== null && String(attr.values).trim() !== '') {
      values = [String(attr.values).trim()];
    } else if (attr.value !== undefined && attr.value !== null && String(attr.value).trim() !== '') {
      values = [String(attr.value).trim()];
    }

    values = values.filter((s) => s !== '');
    if (!values.length) return;

    out.push({ code, values });
  });
  return out;
}

function readLocalStorageTrimmed(key) {
  try {
    const v = localStorage.getItem(key);
    return v != null && String(v).trim() !== '' ? String(v).trim() : '';
  } catch {
    return '';
  }
}

/** Default `priceBookId` for paste grid empty cells, add-product form, and initial catalog filter */
function getDefaultPriceBook() {
  return readLocalStorageTrimmed(ACO_LS_KEYS.PRICE_BOOK_ID) || DEFAULT_PRICE_BOOK_FALLBACK;
}

/** Price books shown in the PLP filter (your default first, then sample ids without duplicates). */
function getPriceBookOptionsForFilter() {
  const primary = getDefaultPriceBook();
  const out = [primary];
  SAMPLE_PRICE_BOOKS.forEach((pb) => {
    if (!out.includes(pb)) out.push(pb);
  });
  return out;
}

/**
 * REGION values from sheets/env often use short codes ("na"); IMS + Commerce API hosts expect na1, eu1, etc.
 */
function normalizeCommerceRegionForHosts(raw) {
  const r = String(raw ?? '').trim().toLowerCase();
  if (!r) return DEFAULT_REGION;
  const shorthand = {
    na: 'na1',
    eu: 'eu1',
    ap: 'ap1',
    apac: 'ap1',
    asia: 'ap1',
    latam: 'la1',
  };
  return shorthand[r] || r;
}

/**
 * Build Commerce Optimizer + IMS endpoints from localStorage (sample ingestion README shape).
 */
function buildAcoRuntimeConfig() {
  const clientId = readLocalStorageTrimmed(ACO_LS_KEYS.CLIENT_ID);
  const clientSecret = readLocalStorageTrimmed(ACO_LS_KEYS.CLIENT_SECRET);
  const tenantIdLs = readLocalStorageTrimmed(ACO_LS_KEYS.TENANT_ID);
  const regionLs = readLocalStorageTrimmed(ACO_LS_KEYS.REGION);
  const environmentLs = readLocalStorageTrimmed(ACO_LS_KEYS.ENVIRONMENT);
  const catalogViewLs = readLocalStorageTrimmed(ACO_LS_KEYS.CATALOG_VIEW_ID);

  const tenantId = tenantIdLs || DEFAULT_TENANT_ID;
  const region = normalizeCommerceRegionForHosts(regionLs || DEFAULT_REGION);
  const environment = environmentLs || DEFAULT_ENVIRONMENT;
  const catalogViewId = catalogViewLs || DEFAULT_CATALOG_VIEW_ID;

  const acoBaseUrl = `https://${region}-${environment}.api.commerce.adobe.com/${tenantId}`;
  const imsTokenUrl = `https://ims-${region}.adobelogin.com/ims/token/v3`;

  return {
    clientId,
    clientSecret,
    tenantId,
    region,
    environment,
    catalogViewId,
    catalogViewFromStorage: Boolean(catalogViewLs),
    acoBaseUrl,
    graphqlUrl: `${acoBaseUrl}/graphql`,
    productsEndpoint: `${acoBaseUrl}/v1/catalog/products`,
    productsDeleteEndpoint: `${acoBaseUrl}/v1/catalog/products/delete`,
    pricesEndpoint: `${acoBaseUrl}/v1/catalog/products/prices`,
    imsTokenUrl,
    hasImsClientCredentials: Boolean(clientId && clientSecret),
  };
}

let acoRuntime = buildAcoRuntimeConfig();

// Store access token (DA SDK or IMS client credentials)
let accessToken = null;

/**
 * Request an access token from Adobe IMS using client credentials
 * @returns {Promise<string>} The access token
 */
async function requestAccessToken() {
  if (!acoRuntime.hasImsClientCredentials) {
    throw new Error(
      'Missing CLIENT_ID or CLIENT_SECRET. Use Commerce settings to save them (same as sample repo .env).',
    );
  }

  console.log('Requesting access token from Adobe IMS...');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', acoRuntime.clientId);
  params.append('client_secret', acoRuntime.clientSecret);
  // Data Ingestion API requires commerce.aco.ingestion (Adobe Developer project: Commerce Optimizer Ingestion API)
  params.append('scope', 'openid,AdobeID,profile,email,commerce.aco.ingestion');

  try {
    const response = await fetch(acoRuntime.imsTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token request failed:', response.status, errorText);
      throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Access token received successfully');
    console.log('Token expires in:', data.expires_in, 'seconds');

    return data.access_token;
  } catch (error) {
    console.error('Error requesting access token:', error);
    const isNetwork =
      error instanceof TypeError ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('fetch'));
    if (isNetwork) {
      throw new Error(
        `Could not reach Adobe IMS (${acoRuntime.imsTokenUrl}). `
          + 'Browsers usually cannot call the IMS token endpoint from this page (CORS). '
          + 'Use Commerce settings → INGESTION_ACCESS_TOKEN: in Developer Console open your Commerce Optimizer Ingestion project, '
          + 'OAuth Server-to-Server → Generate Access Token, paste the bearer here (~24h). '
          + 'Or exchange client_credentials from curl/CLI/server and paste the access_token.',
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Ensure we have a valid access token
 * Requests a new token via IMS if none exists and credentials are configured
 */
async function ensureAccessToken() {
  if (!accessToken) {
    if (acoRuntime.hasImsClientCredentials) {
      accessToken = await requestAccessToken();
    } else {
      throw new Error(
        'No access token available. Use Commerce settings for CLIENT_ID and CLIENT_SECRET, or open this tool signed in with DA.',
      );
    }
  }
  return accessToken;
}

/**
 * Bearer token for Data Ingestion (POST/PATCH catalog). IMS OAuth must include commerce.aco.ingestion;
 * the DA SDK user token is not sufficient for writes.
 * Pasted INGESTION_ACCESS_TOKEN wins (browser IMS client_credentials is often blocked by CORS).
 */
async function getBearerForCatalogWrite() {
  const pastedIngestion = readLocalStorageTrimmed(ACO_LS_KEYS.INGESTION_ACCESS_TOKEN);
  if (pastedIngestion) return pastedIngestion;

  if (acoRuntime.hasImsClientCredentials) {
    return requestAccessToken();
  }
  await ensureAccessToken();
  if (!accessToken) {
    throw new Error(
      'No access token for catalog writes. Add INGESTION_ACCESS_TOKEN (Generate Access Token in Developer Console) '
        + 'or CLIENT_ID plus CLIENT_SECRET (token exchange must run outside the browser if CORS blocks IMS).',
    );
  }
  return accessToken;
}

// State
const state = {
  products: [],
  filteredProducts: [],
  searchTerm: '',
  sortBy: 'featured',
  selectedCategory: 'all',
  selectedPriceBook: getDefaultPriceBook(),
  currentPage: 1,
  totalCount: 0,
  isLoading: false,
  categories: [],
};

// Utility functions
function formatPrice(priceType) {
  if (!priceType?.amount) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: priceType.amount.currency || 'USD',
  }).format(priceType.amount.value);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function showDiscount(price, globalPrice = null) {
  if (!price) return false;
  if (price.regular?.amount?.value !== price.final?.amount?.value) {
    return true;
  }
  if (globalPrice && globalPrice.final?.amount?.value !== price.final?.amount?.value) {
    return true;
  }
  return false;
}

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// GraphQL query for product search
const PRODUCT_SEARCH_QUERY = `
  query Products($search: String!, $pageSize: Int!, $currentPage: Int!) {
    productSearch(
      phrase: $search
      filter: []
      sort: [{ attribute: "relevance", direction: DESC }]
      page_size: $pageSize
      current_page: $currentPage
    ) {
      total_count
      items {
        productView {
          sku
          name
          description
          shortDescription
          images {
            url
          }
          ... on SimpleProductView {
            attributes {
              label
              name
              value
            }
            price {
              regular {
                amount {
                  value
                  currency
                }
              }
              final {
                amount {
                  value
                  currency
                }
              }
              roles
            }
          }
        }
      }
    }
  }
`;

// Fetch products from ACO API
async function searchProducts(catalogId, locale, priceBook, searchTerm, pageSize, page) {
  const graphqlUrl = acoRuntime.graphqlUrl;
  if (!graphqlUrl) {
    console.warn('ACO GraphQL URL not configured');
    return { products: [], totalCount: 0 };
  }

  try {
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ac-price-book-id': priceBook,
        'ac-source-locale': locale,
        'ac_environment_id': catalogId,
        'go-compute': '1',
      },
      body: JSON.stringify({
        query: PRODUCT_SEARCH_QUERY,
        variables: {
          search: searchTerm || '',
          pageSize,
          currentPage: page,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const searchResult = data?.data?.productSearch;

    if (!searchResult) {
      console.error('No search results in response:', data);
      return { products: [], totalCount: 0 };
    }

    // Transform API response to match expected format
    const products = searchResult.items.map((item) => {
      const product = item.productView;
      // Extract category from attributes if available
      const categoryAttr = product.attributes?.find((attr) => attr.name === 'category');

      return {
        sku: product.sku,
        name: product.name,
        description: product.description,
        shortDescription: product.shortDescription,
        category: categoryAttr?.value || '',
        images: product.images || [],
        price: product.price || { regular: null, final: null },
        attributes: product.attributes || [],
      };
    });

    return {
      products,
      totalCount: searchResult.total_count || 0,
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { products: [], totalCount: 0 };
  }
}

// DOM Creation helpers
function createIcon(name) {
  const icons = {
    search: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    sort: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
    grid: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    list: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
    loader: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = icons[name] || '';
  return span;
}

// Modal state
const modalState = {
  isSubmitting: false,
  editingProduct: null, // Store the product being edited
};

// Modal functions
function closeModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

// Paste Product Modal functions
function openPasteModal() {
  const modal = document.getElementById('paste-product-modal');
  if (modal) {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const form = modal.querySelector('form');
    if (form) form.reset();
    const textarea = modal.querySelector('#paste-html');
    if (textarea) textarea.value = '';
    const source = modal.querySelector('.plp-paste-modal-source');
    const toggleBtn = modal.querySelector('#paste-source-toggle');
    const parseBtn = modal.querySelector('#paste-grid-parse');
    if (source) source.classList.remove('is-collapsed');
    if (toggleBtn) toggleBtn.textContent = 'Collapse paste box';
    if (parseBtn) parseBtn.disabled = false;
    fillPasteGridTableFromParsed(modal, []);
    if (textarea) textarea.focus();
  }
}

function closePasteModal() {
  const modal = document.getElementById('paste-product-modal');
  if (modal) {
    modal.classList.remove('is-open');
    const jsonOpen = document.getElementById('ingestion-json-preview-modal')?.classList.contains('is-open');
    document.body.style.overflow = jsonOpen ? 'hidden' : '';
  }
}

function normalizePossiblyProtocolRelativeUrl(src) {
  const s = String(src ?? '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

/**
 * Walgreens coupon / product list cards (e.g. .item.card.card__product).
 * Only runs when root is a single card element — not a full Document.
 */
function tryParseWalgreensProductCard(root) {
  if (!root || typeof root.querySelector !== 'function' || root.nodeType !== 1) return null;
  if (!root.matches?.('.card__product')) return null;

  const extracted = {
    sku: '',
    name: '',
    description: '',
    price: '0',
    image: '',
  };

  const storeLinks = root.querySelectorAll('a[href*="/store/c/"]');
  for (const link of storeLinks) {
    const href = link.getAttribute('href') || '';
    const idMatch = href.match(/\/ID=([^/?#]+)-product/i);
    if (idMatch) {
      extracted.sku = idMatch[1].trim();
      break;
    }
  }

  if (!extracted.sku) {
    const skuInId = /sku(\d{4,})/i;
    for (const el of root.querySelectorAll('[id]')) {
      const m = el.id.match(skuInId);
      if (m) {
        extracted.sku = m[1];
        break;
      }
    }
  }

  const titleEl = root.querySelector('.product__title[title]');
  if (titleEl) {
    extracted.name = (titleEl.getAttribute('title') || '').trim();
  }
  if (!extracted.name) {
    for (const link of storeLinks) {
      const sr = link.querySelector(':scope > .sr-only, .sr-only');
      if (sr) {
        const t = sr.textContent.replace(/\s+/g, ' ').trim();
        if (t.length > 3) {
          extracted.name = t;
          break;
        }
      }
    }
  }
  if (!extracted.name) {
    const titleLink = root.querySelector('.product__title a[href*="/store/c/"]');
    if (titleLink) {
      extracted.name = (titleLink.getAttribute('title') || titleLink.textContent || '').replace(/\s+/g, ' ').trim();
    }
  }

  const sizeEl = root.querySelector('[name="wagproductsize"]');
  if (sizeEl) {
    extracted.description = sizeEl.textContent.replace(/\s+/g, ' ').trim();
  }

  const saleBox = root.querySelector('[name="sales-price"], span[id^="sales-price"]');
  if (saleBox) {
    const red = saleBox.querySelector('.color__text-red');
    const txt = (red?.textContent || saleBox.textContent || '').replace(/\s+/g, ' ');
    const dollarMatches = txt.match(/\$[\d,.]+/g);
    if (dollarMatches?.length) {
      const last = dollarMatches[dollarMatches.length - 1];
      extracted.price = last.replace(/[^\d.]/g, '') || '0';
    }
  }

  let imgSrc = '';
  const figImg = root.querySelector('figure.product__img img[src]');
  if (figImg) imgSrc = figImg.getAttribute('src') || '';
  if (!imgSrc) {
    const w = root.querySelector('img[src*="pics.walgreens.com"]');
    if (w) imgSrc = w.getAttribute('src') || '';
  }
  if (!imgSrc) {
    const any = root.querySelector('img[src]');
    if (any) imgSrc = any.getAttribute('src') || '';
  }
  extracted.image = normalizePossiblyProtocolRelativeUrl(imgSrc);

  if (extracted.name) {
    extracted.name = extracted.name.replace(/\s+/g, ' ').trim();
  }

  if (!extracted.sku || !extracted.name) return null;
  extracted.brand = guessBrandFromProductName(extracted.name);
  return extracted;
}

function parseDomToProduct(root) {
  const wag = tryParseWalgreensProductCard(root);
  if (wag) return wag;

  const extracted = {
    sku: '',
    name: '',
    description: '',
    price: '0',
    image: '',
  };

  // ===== EXTRACT SKU =====
  // Try data attributes first
  const skuEl = root.querySelector('[data-sku], [data-product-sku], [data-product-id], [data-item-id]');
  if (skuEl) {
    extracted.sku = skuEl.dataset.sku || skuEl.dataset.productSku || skuEl.dataset.productId || skuEl.dataset.itemId;
  }

  // Try to extract SKU/ID from URLs (common pattern like /product/12345 or /p/name/12345)
  if (!extracted.sku) {
    const links = root.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      // Match patterns like /p/product-name/0001111097872 or /product/12345
      const skuMatch = href.match(/\/(?:p|product|item|products)\/[^/]*\/(\d{6,})|\/(\d{6,})(?:\?|$)/);
      if (skuMatch) {
        extracted.sku = skuMatch[1] || skuMatch[2];
        break;
      }
    }
  }

  // Try extracting from image URLs
  if (!extracted.sku) {
    const img = root.querySelector('img[src]');
    if (img) {
      const src = img.getAttribute('src') || '';
      const skuMatch = src.match(/\/(\d{10,})/);
      if (skuMatch) {
        extracted.sku = skuMatch[1];
      }
    }
  }

  // Fallback to class-based selectors
  if (!extracted.sku) {
    const skuTextEl = root.querySelector('.sku, .product-sku, #sku, [class*="sku"]');
    if (skuTextEl) {
      extracted.sku = skuTextEl.textContent.trim();
    }
  }

  // ===== EXTRACT NAME =====
  // Try aria-label on main container (common in modern e-commerce)
  const containerWithLabel = root.querySelector('[aria-label]');
  if (containerWithLabel) {
    const label = containerWithLabel.getAttribute('aria-label');
    // Check if it looks like a product name (not a generic label)
    if (label && label.length > 10 && !label.toLowerCase().includes('sign in') && !label.toLowerCase().includes('add to')) {
      extracted.name = label;
    }
  }

  // Try data-testid patterns (common in React apps)
  if (!extracted.name) {
    const testIdEl = root.querySelector('[data-testid="product-title"], [data-testid="product-name"], [data-testid="cart-page-item-description"], [data-testid*="description"], [data-testid*="title"]');
    if (testIdEl) {
      extracted.name = testIdEl.textContent.trim();
    }
  }

  // Try heading elements and common classes
  if (!extracted.name) {
    const nameEl = root.querySelector('h1, h2, h3, .product-name, .product-title, [data-product-name], .title, .name');
    if (nameEl) {
      extracted.name = nameEl.dataset.productName || nameEl.textContent.trim();
    }
  }

  // ===== EXTRACT DESCRIPTION =====
  // Try data-testid for sizing/details
  const sizingEl = root.querySelector('[data-testid="product-item-sizing"], [data-testid*="sizing"], [data-testid*="size"]');
  if (sizingEl) {
    extracted.description = sizingEl.textContent.trim();
  }

  // Try common description selectors
  if (!extracted.description) {
    const descEl = root.querySelector('.description, .product-description, [data-description], p.desc, .details, [class*="description"]');
    if (descEl) {
      extracted.description = descEl.dataset.description || descEl.textContent.trim();
    }
  }

  // If we have a name, use sizing as additional info
  if (extracted.name && sizingEl && !extracted.description) {
    extracted.description = sizingEl.textContent.trim();
  }

  // ===== EXTRACT PRICE =====
  // Try <data> element with value attribute (semantic price markup)
  const dataEl = root.querySelector('data[value], data[typeof="Price"]');
  if (dataEl) {
    const value = dataEl.getAttribute('value');
    if (value) {
      extracted.price = value;
    }
  }

  // Try data-testid for price
  if (!extracted.price) {
    const priceTestId = root.querySelector('[data-testid*="price"], [data-testid*="cost"]');
    if (priceTestId) {
      const priceText = priceTestId.textContent.trim();
      const priceMatch = priceText.match(/\$?([\d,.]+)/);
      if (priceMatch) {
        extracted.price = priceMatch[1].replace(/,/g, '');
      }
    }
  }

  // Try common price classes
  if (!extracted.price) {
    const priceEl = root.querySelector('.price, .product-price, [data-price], .cost, .amount, [class*="Price"], [class*="price"]');
    if (priceEl) {
      const priceText = priceEl.dataset.price || priceEl.getAttribute('value') || priceEl.textContent.trim();
      const priceMatch = priceText.match(/\$?([\d,.]+)/);
      if (priceMatch) {
        extracted.price = priceMatch[1].replace(/,/g, '');
      }
    }
  }

  // ===== EXTRACT IMAGE =====
  // Try product image with data-testid
  const productImg = root.querySelector('[data-testid="product-image"] img, [data-testid="product-image-loaded"], .product-image img');
  if (productImg) {
    extracted.image = productImg.getAttribute('src') || productImg.dataset.src || '';
  }

  // Try any image
  if (!extracted.image) {
    const imgEl = root.querySelector('img[src]');
    if (imgEl) {
      extracted.image = imgEl.getAttribute('src') || imgEl.dataset.src || imgEl.dataset.image || '';
    }
  }

  // Clean up extracted data
  if (extracted.name) {
    // Remove extra whitespace
    extracted.name = extracted.name.replace(/\s+/g, ' ').trim();
  }

  const brandEl = root.querySelector(
    '[data-brand], [itemprop="brand"], .product-brand, .pdp-brand, [class*="ProductBrand"]',
  );
  let brand = '';
  if (brandEl) {
    brand = (
      brandEl.getAttribute('content')
      || brandEl.getAttribute('data-brand')
      || brandEl.textContent
      || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!brand) brand = guessBrandFromProductName(extracted.name);
  extracted.brand = brand;

  return extracted;
}

function normalizeFeedProductRowFromJson(item, idx) {
  const meta = item.metaTags || {};
  const kw = meta.keywords;
  const metaKeywords = Array.isArray(kw)
    ? kw.join(', ')
    : kw != null && kw !== ''
      ? String(kw)
      : '';
  const img0 = Array.isArray(item.images) && item.images.length ? item.images[0] : null;
  const vis = item.visibleIn;
  const visibleIn = Array.isArray(vis)
    ? vis.join(',')
    : typeof vis === 'string'
      ? vis
      : '';

  const price =
    item.price !== undefined && item.price !== null && item.price !== ''
      ? String(item.price).replace(/[^\d.]/g, '') || '0'
      : '0';

  const locale =
    item.source && typeof item.source === 'object' && item.source.locale != null
      ? String(item.source.locale).trim()
      : String(item.locale ?? '').trim();

  const attrs = item.attributes;
  const attributesJson =
    Array.isArray(attrs) && attrs.length > 0 ? JSON.stringify(attrs) : '';

  const lnks = item.links;
  const linksJson = Array.isArray(lnks) && lnks.length > 0 ? JSON.stringify(lnks) : '';

  const rts = item.routes;
  const routesJson = Array.isArray(rts) && rts.length > 0 ? JSON.stringify(rts) : '';

  return {
    sku: String(item.sku ?? '').trim(),
    locale: locale || DEFAULT_LOCALE,
    name: String(item.name ?? '').trim(),
    slug: String(item.slug ?? '').trim(),
    status: String(item.status ?? 'ENABLED').trim(),
    shortDescription: String(item.shortDescription ?? '').trim(),
    description: String(item.description ?? '').trim(),
    visibleIn: visibleIn || 'CATALOG,SEARCH',
    metaTitle: String(meta.title ?? '').trim(),
    metaDescription: String(meta.description ?? '').trim(),
    metaKeywords,
    imageUrl: String(img0?.url ?? item.imageUrl ?? item.image ?? '').trim(),
    imageLabel: String(img0?.label ?? '').trim(),
    imageRoles: Array.isArray(img0?.roles)
      ? img0.roles.join(',')
      : String(img0?.roles ?? '').trim(),
    attributesJson,
    linksJson,
    routesJson,
    price,
    priceBookId: String(item.priceBookId ?? '').trim(),
    _row: idx + 1,
  };
}

function normalizeSparsePasteRow(product, index) {
  const merged = {
    locale: DEFAULT_LOCALE,
    status: 'ENABLED',
    visibleIn: 'CATALOG,SEARCH',
    imageRoles: 'THUMBNAIL,BASE,SMALL',
    shortDescription: '',
    description: '',
    slug: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    imageUrl: '',
    imageLabel: '',
    attributesJson: '',
    linksJson: '',
    routesJson: '',
    price: '0',
    priceBookId: '',
    ...product,
  };

  if (merged.image && !merged.imageUrl) merged.imageUrl = String(merged.image).trim();

  const sku =
    merged.sku?.trim() ||
    (merged.name?.trim() ? `GRID-${Date.now()}-${index + 1}` : '');
  merged.sku = sku;
  merged.price =
    merged.price !== undefined && merged.price !== null && merged.price !== ''
      ? String(merged.price).replace(/[^\d.]/g, '') || '0'
      : '0';

  if (!String(merged.attributesJson ?? '').trim()) {
    const brandVal =
      String(merged.brand ?? '').trim()
      || guessBrandFromProductName(merged.name)
      || PASTE_GRID_DEFAULT_BRAND;
    merged.attributesJson = defaultBrandAttributesJson(brandVal);
  }
  delete merged.brand;

  return merged;
}

function parseProductGridInput(rawInput) {
  const input = rawInput.trim();
  if (!input) return [];

  try {
    const parsed = JSON.parse(input);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [];
    if (list.length > 0) {
      return list.map((item, idx) => normalizeFeedProductRowFromJson(item, idx)).filter((r) => r.sku && r.name);
    }
  } catch (e) {
    // not JSON; continue with HTML parsing
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  const selectorGroups = [
    '.item.card.card__product, .card__product',
    '[data-sku], [data-product-sku], [data-product-id], [data-item-id]',
    '.product-card, .product-item, .product-tile, .product',
    'article.product, article[data-product-id], li.product, li.product-item',
  ];

  let selectedNodes = [];
  selectorGroups.forEach((selector) => {
    const nodes = Array.from(doc.querySelectorAll(selector));
    if (nodes.length > selectedNodes.length) selectedNodes = nodes;
  });

  if (selectedNodes.length <= 1) {
    selectedNodes = Array.from(doc.querySelectorAll('table tbody tr, table tr')).filter((tr) => tr.querySelectorAll('td').length >= 2);
  }

  let products = [];

  if (selectedNodes.length > 0) {
    products = selectedNodes.map((node, idx) => {
      if (node.matches('tr')) {
        const cells = Array.from(node.querySelectorAll('td')).map((td) => td.textContent.trim());
        const sku = (cells.find((v) => /^[A-Z0-9._-]{4,}$/i.test(v)) || '').trim();
        const priceRaw = (cells.find((v) => /\$?\s*\d+([.,]\d{1,2})?/.test(v)) || '0').replace(/[^\d.]/g, '') || '0';
        const nameCandidate = (cells.find((v) => v && v !== sku && !/\$?\s*\d+([.,]\d{1,2})?/.test(v)) || '').trim();
        return {
          sku,
          name: nameCandidate,
          description: '',
          price: priceRaw,
          imageUrl: '',
          brand: guessBrandFromProductName(nameCandidate),
          _row: idx + 1,
        };
      }
      const dom = parseDomToProduct(node);
      return {
        sku: dom.sku,
        name: dom.name,
        description: dom.description,
        price: dom.price,
        imageUrl: dom.image,
        brand: dom.brand || '',
        _row: idx + 1,
      };
    });
  } else {
    const dom = parseDomToProduct(doc);
    products = [
      {
        sku: dom.sku,
        name: dom.name,
        description: dom.description,
        price: dom.price,
        imageUrl: dom.image,
        brand: dom.brand || '',
        _row: 1,
      },
    ];
  }

  return products.map((product, index) => normalizeSparsePasteRow(product, index)).filter((r) => r.sku && r.name);
}

function clearPasteGridTable(modal) {
  const tbody = modal.querySelector('#paste-grid-tbody');
  if (tbody) tbody.innerHTML = '';
}

function appendPasteGridRow(modal, product = {}) {
  const tbody = modal.querySelector('#paste-grid-tbody');
  if (!tbody) return;

  const defaults = {
    locale: DEFAULT_LOCALE,
    status: 'ENABLED',
    visibleIn: 'CATALOG,SEARCH',
    imageRoles: 'THUMBNAIL,BASE,SMALL',
    shortDescription: '',
    description: '',
    slug: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    imageUrl: '',
    imageLabel: '',
    attributesJson: '',
    linksJson: '',
    routesJson: '',
    price: '',
    priceBookId: '',
  };
  const p = { ...defaults, ...product };
  if (p.image && !p.imageUrl) p.imageUrl = String(p.image).trim();

  const tr = document.createElement('tr');
  tr.className = 'plp-paste-grid-row';

  PASTE_GRID_COLUMNS.forEach((col) => {
    const td = document.createElement('td');
    let el;
    if (col.textarea) {
      el = document.createElement('textarea');
      el.rows = col.rows || 2;
      el.className = 'plp-form-input plp-paste-grid-input plp-paste-grid-textarea';
    } else {
      el = document.createElement('input');
      el.type = col.inputType || 'text';
      el.className = 'plp-form-input plp-paste-grid-input';
    }
    el.dataset.gridField = col.field;
    el.value = p[col.field] != null ? String(p[col.field]) : '';
    if (col.field === 'priceBookId') {
      el.placeholder = getDefaultPriceBook();
    } else if (col.placeholder) {
      el.placeholder = col.placeholder;
    }
    td.appendChild(el);
    tr.appendChild(td);
  });

  const actionsTd = document.createElement('td');
  actionsTd.className = 'plp-paste-grid-actions-cell';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'plp-button plp-button-secondary plp-paste-grid-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    tr.remove();
    const tbodyNow = modal.querySelector('#paste-grid-tbody');
    if (tbodyNow && !tbodyNow.querySelector('tr')) {
      appendPasteGridRow(modal, {});
    }
  });
  actionsTd.appendChild(removeBtn);
  tr.appendChild(actionsTd);

  tbody.appendChild(tr);
}

function fillPasteGridTableFromParsed(modal, products) {
  clearPasteGridTable(modal);
  if (!products.length) {
    appendPasteGridRow(modal, {});
    return;
  }
  products.forEach((p) => appendPasteGridRow(modal, p));
}

function getProductsFromPasteGridModal(modal) {
  const rows = modal.querySelectorAll('#paste-grid-tbody tr');
  const out = [];
  rows.forEach((tr) => {
    const row = {};
    PASTE_GRID_COLUMNS.forEach((col) => {
      const el = tr.querySelector(`[data-grid-field="${col.field}"]`);
      row[col.field] = el ? el.value.trim() : '';
    });
    if (!row.sku && !row.name) return;
    const skuFinal = row.sku || (row.name ? `GRID-${Date.now()}-${out.length + 1}` : '');
    if (!skuFinal || !row.name) return;
    row.sku = skuFinal;
    out.push(row);
  });
  return out;
}

function togglePasteSourceSection() {
  const modal = document.getElementById('paste-product-modal');
  if (!modal) return;

  const source = modal.querySelector('.plp-paste-modal-source');
  const toggleBtn = modal.querySelector('#paste-source-toggle');
  const parseBtn = modal.querySelector('#paste-grid-parse');
  const textarea = modal.querySelector('#paste-html');
  if (!source || !toggleBtn) return;

  const willCollapse = !source.classList.contains('is-collapsed');
  source.classList.toggle('is-collapsed', willCollapse);
  toggleBtn.textContent = willCollapse ? 'Expand paste box' : 'Collapse paste box';
  if (parseBtn) parseBtn.disabled = willCollapse;
  if (!willCollapse && textarea) textarea.focus();
}

function handleParseHtml() {
  const modal = document.getElementById('paste-product-modal');
  const textarea = modal.querySelector('#paste-html');
  const html = textarea.value.trim();

  if (!html) {
    alert('Paste JSON or HTML first.');
    return;
  }

  const parsedProducts = parseProductGridInput(html);
  if (!parsedProducts.length) {
    alert('No products detected. Check your paste format or add rows manually.');
    return;
  }
  fillPasteGridTableFromParsed(modal, parsedProducts);
  console.log('Parsed product grid → table:', parsedProducts);
}

const PASTE_GRID_DEFAULT_VISIBLE = ['CATALOG', 'SEARCH'];

function parsePasteGridJsonArray(raw, label) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  let v;
  try {
    v = JSON.parse(s);
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${e.message})`);
  }
  if (!Array.isArray(v)) throw new Error(`${label}: expected a JSON array`);
  return v;
}

function visibleInFromPasteCell(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Build product + price payloads for one paste grid row (same shape as API / ingestion samples).
 * @throws {Error} on invalid JSON in Attributes / Links / Routes columns
 */
function buildPayloadsFromPasteGridRow(product) {
  let attributes = parsePasteGridJsonArray(product.attributesJson, `SKU ${product.sku}: Attributes JSON`);
  if (!attributes.length) {
    attributes = defaultBrandAttributesArray(PASTE_GRID_DEFAULT_BRAND);
  }
  const links = parsePasteGridJsonArray(product.linksJson, `SKU ${product.sku}: Links JSON`);
  const routes = parsePasteGridJsonArray(product.routesJson, `SKU ${product.sku}: Routes JSON`);

  const vis = visibleInFromPasteCell(product.visibleIn);
  const visibleInFinal = vis.length ? vis : PASTE_GRID_DEFAULT_VISIBLE;

  const images = [];
  if (product.imageUrl?.trim()) {
    images.push({
      url: product.imageUrl.trim(),
      label: (product.imageLabel || product.name || '').trim(),
      roles: (product.imageRoles || 'THUMBNAIL, BASE, SMALL').trim(),
    });
  }

  const productPayload = buildProductPayload({
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    status: product.status,
    locale: product.locale,
    description: product.description || '',
    shortDescription: product.shortDescription || '',
    visibleIn: visibleInFinal,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    metaKeywords: product.metaKeywords,
    attributes,
    links,
    routes,
    images,
  });
  const priceBookId = product.priceBookId?.trim() || getDefaultPriceBook();
  const pricePayload = buildPricePayload(product.sku, product.price || '0', priceBookId);
  return { productPayload, pricePayload };
}

/**
 * Current ingestion-shaped arrays from the paste grid (mirrors data/products.json + data/prices.json).
 * Rows with invalid JSON are omitted and listed in errors.
 */
function buildIngestionPreviewFromPasteGrid() {
  const pasteModalEl = document.getElementById('paste-product-modal');
  const gridProducts = pasteModalEl ? getProductsFromPasteGridModal(pasteModalEl) : [];
  const products = [];
  const prices = [];
  const errors = [];

  gridProducts.forEach((product) => {
    try {
      const { productPayload, pricePayload } = buildPayloadsFromPasteGridRow(product);
      products.push(productPayload);
      prices.push(pricePayload);
    } catch (e) {
      errors.push(`${product.sku}: ${e.message || String(e)}`);
    }
  });

  return { products, prices, errors };
}

function closeIngestionJsonPreviewModal() {
  const modal = document.getElementById('ingestion-json-preview-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  const pasteOpen = document.getElementById('paste-product-modal')?.classList.contains('is-open');
  document.body.style.overflow = pasteOpen ? 'hidden' : '';
}

function openIngestionJsonPreview(kind) {
  const modal = document.getElementById('ingestion-json-preview-modal');
  if (!modal) return;

  const { products, prices, errors } = buildIngestionPreviewFromPasteGrid();
  const titleEl = modal.querySelector('#ingestion-json-preview-title');
  const hintEl = modal.querySelector('#ingestion-json-preview-hint');
  const errEl = modal.querySelector('#ingestion-json-preview-errors');
  const pre = modal.querySelector('#ingestion-json-preview-pre');

  const isProducts = kind === 'products';
  if (titleEl) {
    titleEl.textContent = isProducts ? 'data/products.json (current)' : 'data/prices.json (current)';
  }
  const arr = isProducts ? products : prices;
  if (pre) pre.textContent = JSON.stringify(arr, null, 2);

  if (hintEl) {
    hintEl.textContent =
      products.length === 0 && errors.length === 0
        ? 'No rows with both SKU and name in the Paste Product Grid. Open that flow, parse or edit the table, then view again.'
        : `Reflects ${products.length} row(s) from the grid as JSON would be sent (ingestion-style arrays).`;
  }

  if (errEl) {
    if (errors.length) {
      errEl.hidden = false;
      errEl.textContent = `Skipped ${errors.length} row(s) (fix JSON columns):\n${errors.join('\n')}`;
    } else {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }

  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

async function copyIngestionJsonPreview() {
  const pre = document.getElementById('ingestion-json-preview-pre');
  const btn = document.getElementById('ingestion-json-preview-copy');
  if (!pre) return;
  try {
    await navigator.clipboard.writeText(pre.textContent);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1800);
    }
  } catch (e) {
    console.warn('Clipboard failed:', e);
    alert('Could not copy to clipboard.');
  }
}

function createIngestionJsonPreviewModal() {
  const modal = document.createElement('div');
  modal.id = 'ingestion-json-preview-modal';
  modal.className = 'plp-modal plp-modal-json-preview';

  const overlay = document.createElement('div');
  overlay.className = 'plp-modal-overlay';
  overlay.addEventListener('click', closeIngestionJsonPreviewModal);

  const dialog = document.createElement('div');
  dialog.className = 'plp-modal-dialog plp-modal-dialog-xlarge plp-modal-dialog-json-preview';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'ingestion-json-preview-title');

  const header = document.createElement('div');
  header.className = 'plp-modal-header';

  const title = document.createElement('h2');
  title.id = 'ingestion-json-preview-title';
  title.className = 'plp-modal-title';
  title.textContent = 'JSON preview';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'plp-modal-close';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', closeIngestionJsonPreviewModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'plp-modal-body plp-json-preview-body';

  const hint = document.createElement('p');
  hint.id = 'ingestion-json-preview-hint';
  hint.className = 'plp-form-help plp-json-preview-hint';

  const errBox = document.createElement('pre');
  errBox.id = 'ingestion-json-preview-errors';
  errBox.className = 'plp-json-preview-errors';
  errBox.hidden = true;

  const pre = document.createElement('pre');
  pre.id = 'ingestion-json-preview-pre';
  pre.className = 'plp-json-preview-pre';
  pre.setAttribute('tabindex', '0');

  body.appendChild(hint);
  body.appendChild(errBox);
  body.appendChild(pre);

  const footer = document.createElement('div');
  footer.className = 'plp-modal-footer plp-json-preview-footer';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.id = 'ingestion-json-preview-copy';
  copyBtn.className = 'plp-button plp-button-secondary';
  copyBtn.textContent = 'Copy JSON';

  const closeFooterBtn = document.createElement('button');
  closeFooterBtn.type = 'button';
  closeFooterBtn.className = 'plp-button';
  closeFooterBtn.textContent = 'Close';
  closeFooterBtn.addEventListener('click', closeIngestionJsonPreviewModal);

  copyBtn.addEventListener('click', () => copyIngestionJsonPreview());

  footer.appendChild(copyBtn);
  footer.appendChild(closeFooterBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);

  modal.appendChild(overlay);
  modal.appendChild(dialog);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeIngestionJsonPreviewModal();
    }
  });

  return modal;
}

async function handlePasteSubmit() {
  if (modalState.isSubmitting) return;

  const pasteModalEl = document.getElementById('paste-product-modal');
  const form = pasteModalEl?.querySelector('form');
  const gridProducts = getProductsFromPasteGridModal(pasteModalEl);

  if (!gridProducts.length) {
    alert('Use Parse Grid to fill the table with at least one product (SKU and name).');
    return;
  }

  // Get submit button and update state
  const submitBtn = form?.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : 'Add Products';

  try {
    modalState.isSubmitting = true;

    // Update button state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = `Adding ${gridProducts.length}...`;
    }

    // Ensure we have an access token
    await ensureAccessToken();

    if (!accessToken) {
      throw new Error(
        'No access token available. Use Commerce settings (CLIENT_ID / CLIENT_SECRET) or sign in with DA.',
      );
    }

    const failures = [];
    let successCount = 0;

    // Submit products sequentially so one bad row does not stop all rows
    for (const product of gridProducts) {
      try {
        const { productPayload, pricePayload } = buildPayloadsFromPasteGridRow(product);
        await submitProductToACO(productPayload, pricePayload);
        successCount += 1;
      } catch (error) {
        failures.push({ product, error: error.message || String(error) });
      }
    }

    closePasteModal();

    if (failures.length === 0) {
      showSuccessMessage(`Added ${successCount} products from pasted grid.`);
    } else {
      const failedPreview = failures
        .slice(0, 5)
        .map((f) => `${f.product.sku}: ${f.error}`)
        .join('\n');
      alert(
        `Added ${successCount} products. ${failures.length} failed.\n\n${failedPreview}${failures.length > 5 ? '\n...' : ''}`,
      );
    }

    // Refresh product list
    state.currentPage = 1;
    await loadProducts();
  } catch (error) {
    console.error('Failed to create product:', error);
    alert(`Failed to create product: ${error.message}`);
  } finally {
    modalState.isSubmitting = false;
    // Restore button state
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

function persistLocalStorageTrimmed(storageKey, raw) {
  const v = String(raw ?? '').trim();
  try {
    if (v) localStorage.setItem(storageKey, v);
    else localStorage.removeItem(storageKey);
  } catch (e) {
    console.error('localStorage write failed:', e);
    throw new Error('Could not save settings to localStorage.');
  }
}

/** Removes only keys written by this tool (see ACO_LS_KEYS). Does not call localStorage.clear(). */
function removeCommerceAppLocalStorageKeys() {
  Object.values(ACO_LS_KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      console.warn('localStorage remove failed:', k, e);
    }
  });
}

/** True if this app has saved any Commerce Optimizer field (required before loading the catalog). */
function hasAnyCommerceLocalStorage() {
  return Object.values(ACO_LS_KEYS).some((key) => readLocalStorageTrimmed(key) !== '');
}

/**
 * Sheet UI deep link (matches da.live commerce settings spreadsheet path).
 * @see https://da.live/sheet#/<org>/<repo>/commerce/settings
 */
function buildDaCommerceSettingsSheetDeepLink(org, repo) {
  return `https://da.live/sheet#/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/commerce/settings`;
}

function mergeCommerceSheetRows(parsed) {
  const rows = [];
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
    parsed.data.forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row);
    });
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    rows.push(parsed);
  }
  const merged = {};
  rows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (k.startsWith(':')) return;
      merged[k] = row[k];
    });
  });
  return merged;
}

/** Map sheet row keys (CLIENT_ID or client_id, tenet_id, env, …) → env-style LS keys. */
function normalizedCommerceSettingsRow(merged) {
  const out = {};
  Object.entries(merged).forEach(([k, v]) => {
    const key = String(k).trim();
    if (!key || key.startsWith(':')) return;

    let lsKey = null;
    if (Object.values(ACO_LS_KEYS).includes(key)) {
      lsKey = key;
    } else {
      const snake = key.toLowerCase().replace(/\s+/g, '_');
      lsKey = COMMERCE_SETTINGS_JSON_KEYS[snake];
      if (!lsKey) {
        const guessed = snake.split('_').map((w) => w.toUpperCase()).join('_');
        if (Object.values(ACO_LS_KEYS).includes(guessed)) lsKey = guessed;
      }
    }
    if (lsKey) out[lsKey] = v;
  });
  return out;
}

/** Persist commerce sheet fields using CLIENT_ID-style keys or lowercase snake_case aliases. */
function applyCommerceSheetJsonToLocalStorage(parsed) {
  const merged = mergeCommerceSheetRows(parsed);
  const normalized = normalizedCommerceSettingsRow(merged);
  let count = 0;
  Object.values(ACO_LS_KEYS).forEach((storageKey) => {
    const raw = normalized[storageKey];
    if (raw == null || String(raw).trim() === '') return;
    try {
      persistLocalStorageTrimmed(storageKey, String(raw));
      count += 1;
    } catch (e) {
      console.warn('Commerce sheet: could not persist', storageKey, e);
    }
  });
  return count;
}

/**
 * When URL query includes org & repo, load published commerce settings JSON from content.da.live
 * (e.g. https://content.da.live/adobedrago/walgreens-storefront/commerce/settings.json).
 * Requires a bearer token (DA SDK or IMS).
 */
async function hydrateCommerceSettingsFromQueryParams() {
  let org = '';
  let repo = '';
  try {
    const params = new URLSearchParams(window.location.search);
    org = (params.get('org') || '').trim();
    repo = (params.get('repo') || '').trim();
  } catch {
    return { ok: false, reason: 'params' };
  }

  if (!org || !repo) return { ok: false, reason: 'missing-org-repo' };
  if (!accessToken) {
    console.warn('Commerce settings sheet: skip hydrate (no access token yet).');
    return { ok: false, reason: 'no-token' };
  }

  const sheetUi = buildDaCommerceSettingsSheetDeepLink(org, repo);
  const url = `https://content.da.live/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/commerce/settings.json`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!res.ok) {
      console.warn('Commerce settings sheet:', url, res.status);
      return { ok: false, reason: 'not-found', sheetUi };
    }
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn('Commerce settings sheet: invalid JSON', e);
      return { ok: false, reason: 'invalid-json', sheetUi };
    }
    const applied = applyCommerceSheetJsonToLocalStorage(parsed);
    if (applied > 0) {
      console.log(`Commerce settings hydrated from ${url} (${applied} fields). Sheet: ${sheetUi}`);
      return { ok: true, applied, sheetUi };
    }
  } catch (e) {
    console.warn('Commerce settings sheet fetch failed:', url, e);
    return { ok: false, reason: 'fetch-error', sheetUi };
  }

  console.warn('Commerce settings sheet: no matching fields in JSON.', sheetUi);
  return { ok: false, reason: 'no-fields', sheetUi };
}

function fillAcoSettingsForm(form) {
  if (!form) return;
  const set = (id, key) => {
    const el = form.querySelector(id);
    if (el) el.value = readLocalStorageTrimmed(key);
  };
  set('#aco-settings-client-id', ACO_LS_KEYS.CLIENT_ID);
  set('#aco-settings-client-secret', ACO_LS_KEYS.CLIENT_SECRET);
  set('#aco-settings-ingestion-access-token', ACO_LS_KEYS.INGESTION_ACCESS_TOKEN);
  set('#aco-settings-tenant-id', ACO_LS_KEYS.TENANT_ID);
  set('#aco-settings-region', ACO_LS_KEYS.REGION);
  set('#aco-settings-environment', ACO_LS_KEYS.ENVIRONMENT);
  set('#aco-settings-catalog-view-id', ACO_LS_KEYS.CATALOG_VIEW_ID);
  set('#aco-settings-price-book-id', ACO_LS_KEYS.PRICE_BOOK_ID);
}

function openAcoSettingsModal() {
  const modal = document.getElementById('aco-settings-modal');
  if (modal) {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const form = modal.querySelector('form');
    fillAcoSettingsForm(form);
    const first = form?.querySelector('#aco-settings-client-id');
    if (first) first.focus();
  }
}

function closeAcoSettingsModal() {
  const modal = document.getElementById('aco-settings-modal');
  if (modal) {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

async function handleAcoSettingsSubmit(form) {
  const val = (sel) => (form.querySelector(sel)?.value ?? '').trim();

  persistLocalStorageTrimmed(ACO_LS_KEYS.CLIENT_ID, val('#aco-settings-client-id'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.CLIENT_SECRET, val('#aco-settings-client-secret'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.INGESTION_ACCESS_TOKEN, val('#aco-settings-ingestion-access-token'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.TENANT_ID, val('#aco-settings-tenant-id'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.REGION, val('#aco-settings-region'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.ENVIRONMENT, val('#aco-settings-environment'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.CATALOG_VIEW_ID, val('#aco-settings-catalog-view-id'));
  persistLocalStorageTrimmed(ACO_LS_KEYS.PRICE_BOOK_ID, val('#aco-settings-price-book-id'));

  acoRuntime = buildAcoRuntimeConfig();

  if (!getPriceBookOptionsForFilter().includes(state.selectedPriceBook)) {
    state.selectedPriceBook = getDefaultPriceBook();
  }

  if (acoRuntime.hasImsClientCredentials) {
    try {
      accessToken = await requestAccessToken();
      console.log('Refreshed IMS access token after settings save');
    } catch (e) {
      console.warn('Could not refresh IMS token after settings save:', e);
    }
  }

  const listContainer = document.getElementById('product-list-container');
  if (listContainer) renderAcoConfigBanner(listContainer);

  state.currentPage = 1;
  refreshPriceBookFilterSelect();
  await loadProducts();

  closeAcoSettingsModal();
  showSuccessMessage('Commerce Optimizer settings saved.');
}

/**
 * Remove Commerce Optimizer keys stored by this app (ACO_LS_KEYS only). Refreshes in-app defaults.
 */
async function handleClearAppLocalStorage() {
  if (
    !confirm(
      'Remove all Commerce Optimizer settings saved by this tool (CLIENT_ID, CLIENT_SECRET, INGESTION_ACCESS_TOKEN, TENANT_ID, REGION, ENVIRONMENT, CATALOG_VIEW_ID, PRICE_BOOK_ID)? Other sites’ localStorage data will not be touched.',
    )
  ) {
    return;
  }

  removeCommerceAppLocalStorageKeys();

  acoRuntime = buildAcoRuntimeConfig();

  const settingsForm = document.querySelector('#aco-settings-modal form');
  fillAcoSettingsForm(settingsForm);

  if (!getPriceBookOptionsForFilter().includes(state.selectedPriceBook)) {
    state.selectedPriceBook = getDefaultPriceBook();
  }

  state.currentPage = 1;
  refreshPriceBookFilterSelect();

  const listContainer = document.getElementById('product-list-container');
  if (listContainer) renderAcoConfigBanner(listContainer);

  await loadProducts();
  showSuccessMessage('Saved Commerce Optimizer keys cleared.');
}

async function handleAcoSettingsClear(form) {
  if (!confirm('Remove all saved Commerce Optimizer keys from this browser?')) return;

  removeCommerceAppLocalStorageKeys();

  acoRuntime = buildAcoRuntimeConfig();
  fillAcoSettingsForm(form);

  if (acoRuntime.hasImsClientCredentials) {
    try {
      accessToken = await requestAccessToken();
    } catch (e) {
      console.warn('IMS token after clear:', e);
    }
  }

  const listContainer = document.getElementById('product-list-container');
  if (listContainer) renderAcoConfigBanner(listContainer);

  if (!getPriceBookOptionsForFilter().includes(state.selectedPriceBook)) {
    state.selectedPriceBook = getDefaultPriceBook();
  }

  state.currentPage = 1;
  refreshPriceBookFilterSelect();
  await loadProducts();
  showSuccessMessage('Saved Commerce Optimizer keys cleared.');
}

function createAcoSettingsField(
  form,
  { id, label, help, type = 'text', placeholder = '', autocomplete = 'off', textarea = false, rows = 4 },
) {
  const group = document.createElement('div');
  group.className = 'plp-form-group';

  const lab = document.createElement('label');
  lab.className = 'plp-form-label';
  lab.setAttribute('for', id);
  lab.textContent = label;

  const helpEl = document.createElement('p');
  helpEl.className = 'plp-form-help';
  helpEl.textContent = help;

  let control;
  if (textarea) {
    control = document.createElement('textarea');
    control.id = id;
    control.className = 'plp-form-textarea';
    control.placeholder = placeholder;
    control.rows = rows;
    control.spellcheck = false;
    control.autocomplete = 'off';
  } else {
    control = document.createElement('input');
    control.id = id;
    control.className = 'plp-form-input';
    control.type = type;
    control.placeholder = placeholder;
    control.autocomplete = autocomplete;
  }

  group.appendChild(lab);
  group.appendChild(helpEl);
  group.appendChild(control);
  form.appendChild(group);
}

function createAcoSettingsModal() {
  const modal = document.createElement('div');
  modal.id = 'aco-settings-modal';
  modal.className = 'plp-modal';

  const overlay = document.createElement('div');
  overlay.className = 'plp-modal-overlay';
  overlay.addEventListener('click', closeAcoSettingsModal);

  const dialog = document.createElement('div');
  dialog.className = 'plp-modal-dialog plp-modal-dialog-large';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'aco-settings-modal-title');

  const header = document.createElement('div');
  header.className = 'plp-modal-header';

  const title = document.createElement('h2');
  title.id = 'aco-settings-modal-title';
  title.className = 'plp-modal-title';
  title.textContent = 'Commerce Optimizer settings';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'plp-modal-close';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', closeAcoSettingsModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'plp-modal-body';

  const intro = document.createElement('p');
  intro.className = 'plp-form-help plp-settings-intro';
  intro.textContent =
    'Values are stored in localStorage under the same names as aco-sample-catalog-data-ingestion .env (plus PRICE_BOOK_ID and optional INGESTION_ACCESS_TOKEN). For catalog writes from this page, paste INGESTION_ACCESS_TOKEN from Developer Console (Generate Access Token)—the browser usually cannot call Adobe IMS for client_credentials due to CORS.';

  const form = document.createElement('form');
  form.className = 'plp-modal-form';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const prev = submitBtn?.textContent;
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }
      await handleAcoSettingsSubmit(form);
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prev || 'Save';
      }
    }
  });

  body.appendChild(intro);
  body.appendChild(form);

  createAcoSettingsField(form, {
    id: 'aco-settings-client-id',
    label: 'CLIENT_ID',
    help: 'IMS OAuth client id from Adobe Developer Console (Server-to-Server).',
    placeholder: 'my-client-id',
    autocomplete: 'username',
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-client-secret',
    label: 'CLIENT_SECRET',
    type: 'password',
    help: 'IMS client secret. Stored only in this browser’s localStorage.',
    placeholder: '••••••••',
    autocomplete: 'current-password',
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-ingestion-access-token',
    label: 'INGESTION_ACCESS_TOKEN',
    textarea: true,
    rows: 4,
    help:
      'Optional. Bearer for Data Ingestion REST (commerce.aco.ingestion). Required for paste/submit from the browser: Developer Console → your Ingestion API → OAuth Server-to-Server → Generate Access Token. Valid ~24h; leave empty if you only use non-browser token exchange.',
    placeholder: 'Paste bearer token (eyJ…)',
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-tenant-id',
    label: 'TENANT_ID',
    help: 'Commerce Optimizer tenant id from Cloud Manager / API URLs.',
    placeholder: DEFAULT_TENANT_ID,
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-region',
    label: 'REGION',
    help: 'Region segment in the API host (e.g. na1).',
    placeholder: DEFAULT_REGION,
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-environment',
    label: 'ENVIRONMENT',
    help: 'sandbox or production.',
    placeholder: DEFAULT_ENVIRONMENT,
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-catalog-view-id',
    label: 'CATALOG_VIEW_ID',
    help: 'Catalog view UUID used as ac_environment_id for product search GraphQL.',
    placeholder: DEFAULT_CATALOG_VIEW_ID,
  });
  createAcoSettingsField(form, {
    id: 'aco-settings-price-book-id',
    label: 'PRICE_BOOK_ID',
    help:
      'Default price book id sent with price ingestion (paste grid row override optional). Same identifier used as ac-price-book-id when browsing products.',
    placeholder: DEFAULT_PRICE_BOOK_FALLBACK,
  });

  const footer = document.createElement('div');
  footer.className = 'plp-modal-footer plp-settings-modal-footer';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'plp-button plp-button-secondary';
  clearBtn.textContent = 'Clear saved keys';
  clearBtn.addEventListener('click', async () => {
    try {
      await handleAcoSettingsClear(form);
    } catch (err) {
      alert(err?.message || String(err));
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'plp-button plp-button-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeAcoSettingsModal);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'plp-button';
  submitBtn.textContent = 'Save';

  footer.appendChild(clearBtn);
  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);
  form.appendChild(footer);

  dialog.appendChild(header);
  dialog.appendChild(body);
  modal.appendChild(overlay);
  modal.appendChild(dialog);

  return modal;
}

// Edit Modal functions
function openEditModal(product) {
  modalState.editingProduct = product;
  const modal = document.getElementById('edit-product-modal');
  if (modal) {
    // Populate form with product data
    const form = modal.querySelector('form');
    if (form) {
      form.querySelector('#edit-product-name').value = product.name || '';
      form.querySelector('#edit-product-sku').value = product.sku || '';
      form.querySelector('#edit-product-price').value = product.price?.final?.amount?.value || '';
      form.querySelector('#edit-product-category').value = product.category || '';
      form.querySelector('#edit-product-short-description').value = product.shortDescription || '';
      form.querySelector('#edit-product-image').value = product.images?.[0]?.url || '';
      form.querySelector('#edit-product-description').value = product.description || '';

      // Populate attributes
      const attributesContainer = form.querySelector('#edit-product-attributes-list');
      if (attributesContainer) {
        // Clear existing attribute rows
        attributesContainer.innerHTML = '';

        // Add rows for each attribute
        if (product.attributes && product.attributes.length > 0) {
          product.attributes.forEach((attr) => {
            const itemRow = createDynamicListItem('edit-product-attributes', [
              { name: 'code', placeholder: 'Attribute code (e.g., brand)', type: 'text' },
              {
                name: 'type',
                placeholder: 'Type',
                type: 'select',
                options: [
                  { value: 'STRING', label: 'String' },
                  { value: 'NUMBER', label: 'Number' },
                  { value: 'BOOLEAN', label: 'Boolean' },
                ],
              },
              { name: 'value', placeholder: 'Value', type: 'text' },
            ]);

            // Set values
            const codeInput = itemRow.querySelector('input[name="edit-product-attributes-code"]');
            const typeSelect = itemRow.querySelector('select[name="edit-product-attributes-type"]');
            const valueInput = itemRow.querySelector('input[name="edit-product-attributes-value"]');

            if (codeInput) codeInput.value = attr.code || attr.name || '';
            if (typeSelect) typeSelect.value = attr.type || 'STRING';
            if (valueInput) valueInput.value = attr.value || (attr.values && attr.values[0]) || '';

            attributesContainer.appendChild(itemRow);
          });
        }
      }

      // Populate meta tags
      if (product.metaTags) {
        const metaTitleInput = form.querySelector('#edit-product-meta-title');
        const metaDescInput = form.querySelector('#edit-product-meta-description');
        const metaKeywordsInput = form.querySelector('#edit-product-meta-keywords');

        if (metaTitleInput) metaTitleInput.value = product.metaTags.title || '';
        if (metaDescInput) metaDescInput.value = product.metaTags.description || '';
        if (metaKeywordsInput && product.metaTags.keywords) {
          // Convert keywords array back to comma-separated string
          metaKeywordsInput.value = Array.isArray(product.metaTags.keywords)
            ? product.metaTags.keywords.join(', ')
            : product.metaTags.keywords;
        }
      }
    }

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
}

function closeEditModal() {
  const modal = document.getElementById('edit-product-modal');
  if (modal) {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    modalState.editingProduct = null;
  }
}

/**
 * Build the product update payload for ACO PATCH request
 */
function buildProductUpdatePayload(sku, formData) {
  const payload = {
    sku,
    source: {
      locale: DEFAULT_LOCALE,
    },
  };

  // Only include fields that have values
  if (formData.name) payload.name = formData.name;
  if (formData.description) payload.description = formData.description;
  const shortEffective =
    String(formData.shortDescription ?? '').trim() || String(formData.description ?? '').trim();
  if (shortEffective) payload.shortDescription = shortEffective;

  // Handle image update
  // Valid roles: BASE, SMALL, THUMBNAIL, SWATCH
  if (formData.imageUrl) {
    payload.images = [{
      url: formData.imageUrl,
      label: formData.name || '',
      roles: ['BASE', 'THUMBNAIL', 'SMALL'],
    }];
  }

  const updateAttrSources = [];
  if (formData.category) {
    updateAttrSources.push({ code: 'category', values: [String(formData.category).trim()] });
  }
  if (formData.attributes && formData.attributes.length > 0) {
    formData.attributes.forEach((attr) => updateAttrSources.push(attr));
  }
  const normalizedUpdateAttrs = normalizeAttributesForIngestion(updateAttrSources);
  if (normalizedUpdateAttrs.length > 0) {
    payload.attributes = normalizedUpdateAttrs;
  }

  // Handle meta tags
  if (formData.metaTitle || formData.metaDescription || formData.metaKeywords) {
    payload.metaTags = {};
    if (formData.metaTitle) payload.metaTags.title = formData.metaTitle;
    if (formData.metaDescription) payload.metaTags.description = formData.metaDescription;
    if (formData.metaKeywords) {
      // Split comma-separated keywords into array
      payload.metaTags.keywords = formData.metaKeywords.split(',').map((k) => k.trim()).filter((k) => k);
    }
  }

  return payload;
}

/**
 * Update product via ACO PATCH API
 * PATCH https://na1-sandbox.api.commerce.adobe.com/{{tenantId}}
 */
async function updateProductInACO(productPayload) {
  const bearer = await getBearerForCatalogWrite();

  console.log('Using access token for update:', bearer.substring(0, 50) + '...');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  };

  console.log('Request headers:', headers);

  try {
    console.log('Updating product in ACO...', productPayload);
    console.log('PATCH URL:', acoRuntime.productsEndpoint);

    const response = await fetch(acoRuntime.productsEndpoint, {
      method: 'PATCH',
      headers,
      body: JSON.stringify([productPayload]), // API expects an array
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Product update failed:', errorText);
      throw new Error(`Failed to update product: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Product update response:', result);

    return result;
  } catch (error) {
    console.error('Error updating product in ACO:', error);
    throw error;
  }
}

/**
 * Delete product via ACO API
 * POST https://na1-sandbox.api.commerce.adobe.com/{{tenantId}}/v1/catalog/products/delete
 */
async function deleteProductFromACO(sku) {
  const bearer = await getBearerForCatalogWrite();

  console.log('=== DELETE REQUEST ===');
  console.log('Using access token for delete:', bearer.substring(0, 50) + '...');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  };

  const deletePayload = [
    {
      sku,
      source: {
        locale: DEFAULT_LOCALE,
      },
    },
  ];

  try {
    console.log('Deleting product from ACO...', deletePayload);
    console.log('DELETE URL:', acoRuntime.productsDeleteEndpoint);

    const response = await fetch(acoRuntime.productsDeleteEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(deletePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Product delete failed:', errorText);
      throw new Error(`Failed to delete product: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Product delete response:', result);

    return result;
  } catch (error) {
    console.error('Error deleting product from ACO:', error);
    throw error;
  }
}

/**
 * Handle delete button click on product card
 */
async function handleProductDelete(product, cardElement) {
  const confirmed = confirm(`Are you sure you want to delete "${product.name}"?\n\nSKU: ${product.sku}\n\nThis action cannot be undone.`);

  if (!confirmed) {
    return;
  }

  try {
    // Add loading state to card
    cardElement.classList.add('plp-card-deleting');

    await deleteProductFromACO(product.sku);

    // Remove card from DOM with animation
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'scale(0.8)';
    setTimeout(() => {
      cardElement.remove();
      // Update total count
      state.totalProducts = Math.max(0, state.totalProducts - 1);
      const resultsCount = document.querySelector('.plp-results-count');
      if (resultsCount) {
        resultsCount.textContent = `${state.totalProducts} products`;
      }
    }, 300);

    console.log(`Product "${product.name}" deleted successfully`);
  } catch (error) {
    cardElement.classList.remove('plp-card-deleting');
    alert(`Failed to delete product: ${error.message}`);
  }
}

/**
 * Handle edit form submission
 */
async function handleProductUpdate(form) {
  if (modalState.isSubmitting || !modalState.editingProduct) return;

  // Get form values
  const formData = {
    name: form.querySelector('#edit-product-name').value.trim(),
    price: form.querySelector('#edit-product-price').value,
    category: form.querySelector('#edit-product-category').value.trim(),
    shortDescription: form.querySelector('#edit-product-short-description').value.trim(),
    description: form.querySelector('#edit-product-description').value.trim(),
    imageUrl: form.querySelector('#edit-product-image').value.trim(),
    attributes: extractDynamicListItems(form, 'edit-product-attributes', ['code', 'type', 'value']),
    // Meta tags
    metaTitle: form.querySelector('#edit-product-meta-title')?.value.trim() || '',
    metaDescription: form.querySelector('#edit-product-meta-description')?.value.trim() || '',
    metaKeywords: form.querySelector('#edit-product-meta-keywords')?.value.trim() || '',
  };

  const sku = modalState.editingProduct.sku;

  // Build update payload
  const productPayload = buildProductUpdatePayload(sku, formData);

  console.log('Product Update Payload:', productPayload);

  // Update UI state
  modalState.isSubmitting = true;
  updateEditSubmitButton(true);

  try {
    // Submit update to ACO
    await updateProductInACO(productPayload);

    // Success - close modal and refresh products
    closeEditModal();
    showSuccessMessage(`Product "${formData.name || sku}" updated successfully!`);

    // Refresh product list (note: changes may take time to propagate)
    state.currentPage = 1;
    await loadProducts();
  } catch (error) {
    console.error('Failed to update product:', error);
    showFormError(`Failed to update product: ${error.message}`);
  } finally {
    modalState.isSubmitting = false;
    updateEditSubmitButton(false);
  }
}

function updateEditSubmitButton(isLoading) {
  const submitBtn = document.querySelector('#edit-product-modal .plp-modal-submit');
  if (submitBtn) {
    submitBtn.disabled = isLoading;
    const span = submitBtn.querySelector('span');
    if (span) {
      span.textContent = isLoading ? 'Updating...' : 'Update Product';
    }
    if (isLoading) {
      submitBtn.classList.add('is-loading');
    } else {
      submitBtn.classList.remove('is-loading');
    }
  }
}

function createPasteModal() {
  const modal = document.createElement('div');
  modal.id = 'paste-product-modal';
  modal.className = 'plp-modal plp-modal-paste-fullpage';

  const overlay = document.createElement('div');
  overlay.className = 'plp-modal-overlay';
  overlay.addEventListener('click', closePasteModal);

  const dialog = document.createElement('div');
  dialog.className = 'plp-modal-dialog plp-modal-dialog-paste-fullpage';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'paste-modal-title');

  // Header
  const header = document.createElement('div');
  header.className = 'plp-modal-header';

  const title = document.createElement('h2');
  title.id = 'paste-modal-title';
  title.className = 'plp-modal-title';
  title.textContent = 'Paste a Product Grid';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'plp-modal-close';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', closePasteModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'plp-modal-body plp-paste-modal-body';

  // Form
  const form = document.createElement('form');
  form.className = 'plp-modal-form plp-paste-modal-form';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handlePasteSubmit();
  });

  const stack = document.createElement('div');
  stack.className = 'plp-paste-modal-stack';

  const sourceSection = document.createElement('div');
  sourceSection.className = 'plp-paste-modal-source';

  const pasteGroup = document.createElement('div');
  pasteGroup.className = 'plp-form-group';

  const pasteLabel = document.createElement('label');
  pasteLabel.className = 'plp-form-label';
  pasteLabel.setAttribute('for', 'paste-html');
  pasteLabel.textContent = 'Paste JSON or HTML';

  const pasteHelp = document.createElement('p');
  pasteHelp.className = 'plp-form-help';
  pasteHelp.textContent =
    'Paste the same FeedProduct JSON array as aco-sample-catalog-data-ingestion data/products.json, or HTML. Parse fills columns below.';

  const pasteTextarea = document.createElement('textarea');
  pasteTextarea.id = 'paste-html';
  pasteTextarea.className = 'plp-form-input plp-form-textarea plp-form-textarea-large plp-paste-modal-textarea';
  pasteTextarea.placeholder =
    'Paste objects like data/products.json from aco-sample-catalog-data-ingestion (array of FeedProduct JSON). '
    + 'Prices often live in a separate file — set Price / Price book columns before submit.\n\n'
    + 'Or paste HTML with repeated product cards / rows.';
  pasteTextarea.rows = 14;

  pasteGroup.appendChild(pasteLabel);
  pasteGroup.appendChild(pasteHelp);
  pasteGroup.appendChild(pasteTextarea);
  sourceSection.appendChild(pasteGroup);

  const parseRow = document.createElement('div');
  parseRow.className = 'plp-paste-parse-row';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.id = 'paste-source-toggle';
  collapseBtn.className = 'plp-button plp-button-secondary';
  collapseBtn.textContent = 'Collapse paste box';
  collapseBtn.addEventListener('click', togglePasteSourceSection);
  parseRow.appendChild(collapseBtn);
  const parseBtn = document.createElement('button');
  parseBtn.type = 'button';
  parseBtn.id = 'paste-grid-parse';
  parseBtn.className = 'plp-button plp-button-secondary';
  parseBtn.textContent = 'Parse Grid →';
  parseBtn.addEventListener('click', handleParseHtml);
  parseRow.appendChild(parseBtn);
  sourceSection.appendChild(parseRow);

  stack.appendChild(sourceSection);

  const tableSection = document.createElement('div');
  tableSection.className = 'plp-paste-modal-table-section';

  const fieldsTitle = document.createElement('h3');
  fieldsTitle.className = 'plp-form-section-title';
  fieldsTitle.textContent = 'Products';

  const tableHelp = document.createElement('p');
  tableHelp.className = 'plp-form-help';
  tableHelp.textContent =
    'Columns mirror ingestion JSON (sku, source.locale, slug, status, descriptions, visibleIn, metaTags, attributes[], images[], links[], routes[]) plus price fields. Edit cells, then Add Products.';

  const gridWrap = document.createElement('div');
  gridWrap.className = 'plp-paste-grid-wrap';

  const table = document.createElement('table');
  table.className = 'plp-paste-grid-table';
  table.setAttribute('role', 'grid');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  PASTE_GRID_COLUMNS.forEach(({ header }) => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  const actionsTh = document.createElement('th');
  actionsTh.className = 'plp-paste-grid-actions-header';
  actionsTh.textContent = '';
  headerRow.appendChild(actionsTh);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'paste-grid-tbody';
  table.appendChild(tbody);

  gridWrap.appendChild(table);
  tableSection.appendChild(fieldsTitle);
  tableSection.appendChild(tableHelp);
  tableSection.appendChild(gridWrap);

  stack.appendChild(tableSection);

  form.appendChild(stack);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'plp-modal-footer plp-paste-modal-footer';

  const footerLeft = document.createElement('div');
  footerLeft.className = 'plp-modal-footer-group';

  const viewProductsBtn = document.createElement('button');
  viewProductsBtn.type = 'button';
  viewProductsBtn.className = 'plp-button plp-button-secondary';
  viewProductsBtn.textContent = 'View products.json';
  viewProductsBtn.addEventListener('click', () => openIngestionJsonPreview('products'));

  const viewPricesBtn = document.createElement('button');
  viewPricesBtn.type = 'button';
  viewPricesBtn.className = 'plp-button plp-button-secondary';
  viewPricesBtn.textContent = 'View prices.json';
  viewPricesBtn.addEventListener('click', () => openIngestionJsonPreview('prices'));

  footerLeft.appendChild(viewProductsBtn);
  footerLeft.appendChild(viewPricesBtn);

  const footerRight = document.createElement('div');
  footerRight.className = 'plp-modal-footer-group';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'plp-button plp-button-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closePasteModal);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'plp-button';
  submitBtn.textContent = 'Add Products';

  footerRight.appendChild(cancelBtn);
  footerRight.appendChild(submitBtn);

  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);

  form.appendChild(footer);
  body.appendChild(form);

  dialog.appendChild(header);
  dialog.appendChild(body);

  modal.appendChild(overlay);
  modal.appendChild(dialog);

  return modal;
}

function createEditModal() {
  const modal = document.createElement('div');
  modal.id = 'edit-product-modal';
  modal.className = 'plp-modal';

  const overlay = document.createElement('div');
  overlay.className = 'plp-modal-overlay';
  overlay.addEventListener('click', closeEditModal);

  const dialog = document.createElement('div');
  dialog.className = 'plp-modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'edit-modal-title');

  // Header
  const header = document.createElement('div');
  header.className = 'plp-modal-header';

  const title = document.createElement('h2');
  title.id = 'edit-modal-title';
  title.className = 'plp-modal-title';
  title.textContent = 'Edit Product';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'plp-modal-close';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', closeEditModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'plp-modal-body';

  // Form
  const form = document.createElement('form');
  form.className = 'plp-modal-form';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleProductUpdate(form);
  });

  // SKU field (readonly)
  const skuGroup = document.createElement('div');
  skuGroup.className = 'plp-form-group';
  const skuLabel = document.createElement('label');
  skuLabel.htmlFor = 'edit-product-sku';
  skuLabel.textContent = 'SKU';
  const skuInput = document.createElement('input');
  skuInput.type = 'text';
  skuInput.id = 'edit-product-sku';
  skuInput.className = 'plp-form-input';
  skuInput.readOnly = true;
  skuInput.style.backgroundColor = 'var(--spectrum-gray-100)';
  skuGroup.appendChild(skuLabel);
  skuGroup.appendChild(skuInput);

  // Product Name field
  const nameGroup = createFormGroup('edit-product-name', 'Product Name', 'text', 'Enter product name');

  // Price field
  const priceGroup = createFormGroup('edit-product-price', 'Price (USD)', 'number', '0.00');

  // Category field
  const categoryGroup = createFormGroup('edit-product-category', 'Category', 'text', 'e.g., Electronics');

  // Short Description field
  const shortDescGroup = createFormGroup('edit-product-short-description', 'Short Description', 'text', 'Brief product summary');

  // Image URL field
  const imageGroup = createFormGroup('edit-product-image', 'Image URL', 'url', 'https://example.com/image.jpg');

  // Description field (textarea)
  const descGroup = document.createElement('div');
  descGroup.className = 'plp-form-group';
  const descLabel = document.createElement('label');
  descLabel.htmlFor = 'edit-product-description';
  descLabel.textContent = 'Description';
  const descTextarea = document.createElement('textarea');
  descTextarea.id = 'edit-product-description';
  descTextarea.className = 'plp-form-textarea';
  descTextarea.placeholder = 'Enter detailed product description';
  descTextarea.rows = 4;
  descGroup.appendChild(descLabel);
  descGroup.appendChild(descTextarea);

  // Attributes section
  const attributesSection = createFormSection('Attributes');
  const attributesList = createDynamicListSection('edit-product-attributes', '', [
    { name: 'code', placeholder: 'Attribute code (e.g., brand)', type: 'text' },
    {
      name: 'type',
      placeholder: 'Type',
      type: 'select',
      options: [
        { value: 'STRING', label: 'String' },
        { value: 'NUMBER', label: 'Number' },
        { value: 'BOOLEAN', label: 'Boolean' },
      ],
    },
    { name: 'value', placeholder: 'Value', type: 'text' },
  ], 'Add Attribute');
  attributesSection.appendChild(attributesList);

  // Meta Tags section
  const metaTagsSection = createFormSection('SEO / Meta Tags');
  const metaTitleGroup = createFormGroup('edit-product-meta-title', 'Meta Title', 'text', 'SEO title for search engines');
  const metaDescGroup = createFormGroup('edit-product-meta-description', 'Meta Description', 'text', 'SEO description for search engines');
  const metaKeywordsGroup = createFormGroup('edit-product-meta-keywords', 'Meta Keywords', 'text', 'keyword1, keyword2, keyword3 (comma separated)');
  metaTagsSection.appendChild(metaTitleGroup);
  metaTagsSection.appendChild(metaDescGroup);
  metaTagsSection.appendChild(metaKeywordsGroup);

  form.appendChild(skuGroup);
  form.appendChild(nameGroup);
  form.appendChild(priceGroup);
  form.appendChild(categoryGroup);
  form.appendChild(shortDescGroup);
  form.appendChild(imageGroup);
  form.appendChild(descGroup);
  form.appendChild(attributesSection);
  form.appendChild(metaTagsSection);

  body.appendChild(form);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'plp-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'plp-button plp-modal-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeEditModal);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'plp-button plp-modal-submit';
  const submitBtnText = document.createElement('span');
  submitBtnText.textContent = 'Update Product';
  submitBtn.appendChild(submitBtnText);
  submitBtn.addEventListener('click', () => {
    form.dispatchEvent(new Event('submit'));
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);

  modal.appendChild(overlay);
  modal.appendChild(dialog);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeEditModal();
    }
  });

  return modal;
}

/**
 * Build the product payload for ACO Catalog Ingestion API
 * Based on @adobe-commerce/aco-ts-sdk FeedProduct type
 * See: https://github.com/adobe-commerce/aco-sample-catalog-data-ingestion
 */
function buildProductPayload(formData) {
  const slugInput = typeof formData.slug === 'string' ? formData.slug.trim() : '';
  const slug =
    slugInput ||
    formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const locale =
    formData.locale != null && String(formData.locale).trim()
      ? String(formData.locale).trim()
      : DEFAULT_LOCALE;

  const description = String(formData.description ?? '').trim();
  const shortDescriptionRaw = String(formData.shortDescription ?? '').trim();
  const shortDescription = shortDescriptionRaw || description;

  const payload = {
    // Required fields
    sku: formData.sku,
    source: {
      locale,
    },
    name: formData.name,
    slug,
    status: formData.status || 'ENABLED',

    // Optional fields
    description: formData.description || '',
    shortDescription,
  };

  // Visibility
  if (formData.visibleIn && formData.visibleIn.length > 0) {
    payload.visibleIn = formData.visibleIn;
  }

  // Meta tags
  if (formData.metaTitle || formData.metaDescription || formData.metaKeywords) {
    payload.metaTags = {};
    if (formData.metaTitle) payload.metaTags.title = formData.metaTitle;
    if (formData.metaDescription) payload.metaTags.description = formData.metaDescription;
    if (formData.metaKeywords) {
      payload.metaTags.keywords = formData.metaKeywords.split(',').map((k) => k.trim()).filter((k) => k);
    }
  }

  // Attributes: { code, values } per Data Ingestion / aco-ts-sdk ProductAttribute
  const normalizedAttrs = normalizeAttributesForIngestion(formData.attributes);
  if (normalizedAttrs.length > 0) {
    payload.attributes = normalizedAttrs;
  }

  // Images
  if (formData.images && formData.images.length > 0) {
    payload.images = formData.images.map((img) => ({
      url: img.url,
      label: img.label || formData.name,
      roles: Array.isArray(img.roles)
        ? img.roles.map((r) => String(r).trim().toUpperCase()).filter(Boolean)
        : img.roles
          ? String(img.roles)
              .split(',')
              .map((r) => r.trim().toUpperCase())
              .filter(Boolean)
          : ['THUMBNAIL', 'BASE', 'SMALL'],
    }));
  }

  // Links (related products)
  if (formData.links && formData.links.length > 0) {
    payload.links = formData.links.map((link) => ({
      sku: link.sku,
      type: link.type,
    }));
  }

  // Routes
  if (formData.routes && formData.routes.length > 0) {
    payload.routes = formData.routes.map((route) => ({
      path: route.path,
    }));
  }

  return payload;
}

/**
 * Build the price payload for ACO Catalog Ingestion API
 * Based on @adobe-commerce/aco-ts-sdk FeedPrices type
 */
function buildPricePayload(sku, price, priceBookId) {
  return {
    sku,
    priceBookId,
    regular: parseFloat(price) || 0,
  };
}

/**
 * Submit product to ACO Catalog Ingestion API
 * Uses direct REST calls with an IMS bearer that includes commerce.aco.ingestion when using client credentials.
 *
 * API Reference:
 * POST …/{{tenantId}}/v1/catalog/products
 * POST …/{{tenantId}}/v1/catalog/products/prices
 */
async function submitProductToACO(productPayload, pricePayload) {
  const bearer = await getBearerForCatalogWrite();

  console.log('Using access token for submit:', bearer.substring(0, 50) + '...');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  };

  try {
    // Step 1: Create the product
    console.log('Creating product in ACO...', productPayload);

    const productResponse = await fetch(acoRuntime.productsEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify([productPayload]), // API expects an array of products
    });

    if (!productResponse.ok) {
      const errorText = await productResponse.text();
      console.error('Product creation failed:', errorText);
      throw new Error(`Failed to create product: ${productResponse.status} - ${errorText}`);
    }

    const productResult = await productResponse.json();
    console.log('Product creation response:', productResult);

    // Step 2: Create the price
    console.log('Creating price in ACO...', pricePayload);

    const priceResponse = await fetch(acoRuntime.pricesEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify([pricePayload]), // API expects an array of prices
    });

    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      console.error('Price creation failed:', errorText);
      throw new Error(`Failed to create price: ${priceResponse.status} - ${errorText}`);
    }

    const priceResult = await priceResponse.json();
    console.log('Price creation response:', priceResult);

    return {
      product: productResult,
      price: priceResult,
    };
  } catch (error) {
    console.error('Error submitting to ACO:', error);
    throw error;
  }
}

/**
 * Handle form submission
 */
/**
 * Extract dynamic list items from the form
 */
function extractDynamicListItems(form, listId, fieldNames) {
  const container = form.querySelector(`#${listId}-items`);
  if (!container) return [];

  const items = [];
  const itemElements = container.querySelectorAll('.plp-dynamic-item');

  itemElements.forEach((itemEl) => {
    const item = {};
    let hasValue = false;

    fieldNames.forEach((fieldName) => {
      const input = itemEl.querySelector(`[name*="[${fieldName}]"]`);
      if (input) {
        const value = input.value.trim();
        item[fieldName] = value;
        if (value) hasValue = true;
      }
    });

    // Only add items that have at least one value
    if (hasValue) {
      items.push(item);
    }
  });

  return items;
}

/**
 * Get checked values from checkbox group
 */
function getCheckedValues(form, name) {
  const checkboxes = form.querySelectorAll(`input[name="${name}"]:checked`);
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function handleProductSubmit(form) {
  if (modalState.isSubmitting) return;

  // Get basic form values
  const formData = {
    // Basic info
    sku: form.querySelector('#product-sku')?.value.trim() || '',
    name: form.querySelector('#product-name')?.value.trim() || '',
    slug: form.querySelector('#product-slug')?.value.trim() || '',
    status: form.querySelector('#product-status')?.value || 'ENABLED',

    // Descriptions
    shortDescription: form.querySelector('#product-short-description')?.value.trim() || '',
    description: form.querySelector('#product-description')?.value.trim() || '',

    // Visibility
    visibleIn: getCheckedValues(form, 'product-visible-in'),

    // Meta tags
    metaTitle: form.querySelector('#product-meta-title')?.value.trim() || '',
    metaDescription: form.querySelector('#product-meta-description')?.value.trim() || '',
    metaKeywords: form.querySelector('#product-meta-keywords')?.value.trim() || '',

    // Dynamic lists
    attributes: extractDynamicListItems(form, 'product-attributes', ['code', 'type', 'value']),
    images: extractDynamicListItems(form, 'product-images', ['url', 'label', 'roles']),
    links: extractDynamicListItems(form, 'product-links', ['sku', 'type']),
    routes: extractDynamicListItems(form, 'product-routes', ['path']),

    // Pricing
    price: form.querySelector('#product-price')?.value || '0',
  };

  // Validate required fields
  if (!formData.name || !formData.sku) {
    showFormError('Product Name and SKU are required.');
    return;
  }

  // Build payloads
  const productPayload = buildProductPayload(formData);
  const pricePayload = buildPricePayload(formData.sku, formData.price, getDefaultPriceBook());

  console.log('Product Payload (ACO FeedProduct format):', productPayload);
  console.log('Price Payload (ACO FeedPrices format):', pricePayload);

  // Update UI state
  modalState.isSubmitting = true;
  updateSubmitButton(true);

  try {
    // Submit to ACO
    const result = await submitProductToACO(productPayload, pricePayload);
    console.log('Product created successfully:', result);

    // Success - close modal and refresh products
    closeModal();
    showSuccessMessage(`Product "${formData.name}" added successfully!`);

    // Refresh product list (note: ingestion is async, may take time to appear)
    state.currentPage = 1;
    await loadProducts();
  } catch (error) {
    console.error('Failed to create product:', error);
    showFormError(`Failed to create product: ${error.message}`);
  } finally {
    modalState.isSubmitting = false;
    updateSubmitButton(false);
  }
}

function updateSubmitButton(isLoading) {
  const submitBtn = document.querySelector('.plp-modal-submit');
  if (submitBtn) {
    submitBtn.disabled = isLoading;
    const span = submitBtn.querySelector('span');
    if (span) {
      span.textContent = isLoading ? 'Adding...' : 'Add Product';
    }
    if (isLoading) {
      submitBtn.classList.add('is-loading');
    } else {
      submitBtn.classList.remove('is-loading');
    }
  }
}

function showFormError(message) {
  // Simple alert for now - could be enhanced with inline errors
  alert(message);
}

function showSuccessMessage(message) {
  // Simple notification - could be enhanced with a toast component
  console.log('Success:', message);
}

function createFormSection(title) {
  const section = document.createElement('div');
  section.className = 'plp-form-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'plp-form-section-title';
  sectionTitle.textContent = title;
  section.appendChild(sectionTitle);

  return section;
}

function createCheckboxGroup(id, labelText, options, defaultValues = []) {
  const group = document.createElement('div');
  group.className = 'plp-form-group';

  const label = document.createElement('label');
  label.className = 'plp-form-label';
  label.textContent = labelText;
  group.appendChild(label);

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'plp-checkbox-group';

  options.forEach((option) => {
    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'plp-checkbox-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = id;
    checkbox.value = option.value;
    checkbox.checked = defaultValues.includes(option.value);

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(document.createTextNode(` ${option.label}`));
    checkboxContainer.appendChild(checkboxLabel);
  });

  group.appendChild(checkboxContainer);
  return group;
}

function createSelectGroup(id, labelText, options, defaultValue = '') {
  const group = document.createElement('div');
  group.className = 'plp-form-group';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'plp-form-label';
  label.textContent = labelText;
  group.appendChild(label);

  const select = document.createElement('select');
  select.id = id;
  select.className = 'plp-form-input plp-form-select';

  options.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === defaultValue) {
      optionEl.selected = true;
    }
    select.appendChild(optionEl);
  });

  group.appendChild(select);
  return group;
}

function createDynamicListSection(id, title, fields, addButtonText) {
  const section = document.createElement('div');
  section.className = 'plp-form-group plp-dynamic-list';
  section.dataset.listId = id;

  const label = document.createElement('label');
  label.className = 'plp-form-label';
  label.textContent = title;
  section.appendChild(label);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'plp-dynamic-items';
  itemsContainer.id = `${id}-items`;
  section.appendChild(itemsContainer);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'plp-button plp-button-secondary plp-add-item-btn';
  addBtn.textContent = `+ ${addButtonText}`;
  addBtn.addEventListener('click', () => {
    const item = createDynamicListItem(id, fields, itemsContainer.children.length);
    itemsContainer.appendChild(item);
  });
  section.appendChild(addBtn);

  return section;
}

function createDynamicListItem(listId, fields, index) {
  const item = document.createElement('div');
  item.className = 'plp-dynamic-item';

  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'plp-dynamic-item-fields';

  fields.forEach((field) => {
    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'plp-dynamic-field';

    if (field.type === 'select') {
      const select = document.createElement('select');
      select.name = `${listId}[${index}][${field.name}]`;
      select.className = 'plp-form-input plp-form-select';
      field.options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      fieldWrapper.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.type = field.type || 'text';
      input.name = `${listId}[${index}][${field.name}]`;
      input.placeholder = field.placeholder;
      input.className = 'plp-form-input';
      fieldWrapper.appendChild(input);
    }

    fieldsContainer.appendChild(fieldWrapper);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'plp-dynamic-remove-btn';
  removeBtn.innerHTML = '&times;';
  removeBtn.setAttribute('aria-label', 'Remove item');
  removeBtn.addEventListener('click', () => item.remove());

  item.appendChild(fieldsContainer);
  item.appendChild(removeBtn);

  return item;
}

function createModal() {
  const modal = document.createElement('div');
  modal.id = 'add-product-modal';
  modal.className = 'plp-modal';

  const overlay = document.createElement('div');
  overlay.className = 'plp-modal-overlay';
  overlay.addEventListener('click', closeModal);

  const dialog = document.createElement('div');
  dialog.className = 'plp-modal-dialog plp-modal-dialog-large';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'modal-title');

  // Header
  const header = document.createElement('div');
  header.className = 'plp-modal-header';

  const title = document.createElement('h2');
  title.id = 'modal-title';
  title.className = 'plp-modal-title';
  title.textContent = 'Add New Product';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'plp-modal-close';
  closeBtn.setAttribute('aria-label', 'Close modal');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'plp-modal-body';

  // Form
  const form = document.createElement('form');
  form.className = 'plp-modal-form';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleProductSubmit(form);
  });

  // ===== BASIC INFO SECTION =====
  const basicSection = createFormSection('Basic Information');

  const skuGroup = createFormGroup('product-sku', 'SKU *', 'text', 'e.g., wknd-bolt-sneakers-2013', true);
  const nameGroup = createFormGroup('product-name', 'Product Name *', 'text', 'Enter product name', true);
  const slugGroup = createFormGroup('product-slug', 'Slug', 'text', 'auto-generated-from-name');
  const statusGroup = createSelectGroup('product-status', 'Status', [
    { value: 'ENABLED', label: 'Enabled' },
    { value: 'DISABLED', label: 'Disabled' },
  ], 'ENABLED');

  basicSection.appendChild(skuGroup);
  basicSection.appendChild(nameGroup);
  basicSection.appendChild(slugGroup);
  basicSection.appendChild(statusGroup);
  form.appendChild(basicSection);

  // ===== DESCRIPTIONS SECTION =====
  const descSection = createFormSection('Descriptions');

  const shortDescGroup = createFormGroup('product-short-description', 'Short Description', 'text', 'Brief product summary');

  const descGroup = document.createElement('div');
  descGroup.className = 'plp-form-group';
  const descLabel = document.createElement('label');
  descLabel.htmlFor = 'product-description';
  descLabel.className = 'plp-form-label';
  descLabel.textContent = 'Description';
  const descTextarea = document.createElement('textarea');
  descTextarea.id = 'product-description';
  descTextarea.className = 'plp-form-input plp-form-textarea';
  descTextarea.placeholder = 'Enter detailed product description';
  descTextarea.rows = 3;
  descGroup.appendChild(descLabel);
  descGroup.appendChild(descTextarea);

  descSection.appendChild(shortDescGroup);
  descSection.appendChild(descGroup);
  form.appendChild(descSection);

  // ===== VISIBILITY SECTION =====
  const visibilitySection = createFormSection('Visibility');

  const visibleInGroup = createCheckboxGroup('product-visible-in', 'Visible In', [
    { value: 'CATALOG', label: 'Catalog' },
    { value: 'SEARCH', label: 'Search' },
  ], ['CATALOG', 'SEARCH']);

  visibilitySection.appendChild(visibleInGroup);
  form.appendChild(visibilitySection);

  // ===== SEO / META TAGS SECTION =====
  const seoSection = createFormSection('SEO / Meta Tags');

  const metaTitleGroup = createFormGroup('product-meta-title', 'Meta Title', 'text', 'SEO title');
  const metaDescGroup = createFormGroup('product-meta-description', 'Meta Description', 'text', 'SEO description');
  const metaKeywordsGroup = createFormGroup('product-meta-keywords', 'Meta Keywords', 'text', 'keyword1, keyword2, keyword3');

  seoSection.appendChild(metaTitleGroup);
  seoSection.appendChild(metaDescGroup);
  seoSection.appendChild(metaKeywordsGroup);
  form.appendChild(seoSection);

  // ===== ATTRIBUTES SECTION =====
  const attributesSection = createFormSection('Attributes');

  const attributesList = createDynamicListSection('product-attributes', '', [
    { name: 'code', placeholder: 'Attribute code (e.g., brand)', type: 'text' },
    {
      name: 'type',
      type: 'select',
      options: [
        { value: 'STRING', label: 'String' },
        { value: 'NUMBER', label: 'Number' },
        { value: 'BOOLEAN', label: 'Boolean' },
      ],
    },
    { name: 'value', placeholder: 'Value', type: 'text' },
  ], 'Add Attribute');

  attributesSection.appendChild(attributesList);
  form.appendChild(attributesSection);

  // ===== IMAGES SECTION =====
  const imagesSection = createFormSection('Images');

  const imagesList = createDynamicListSection('product-images', '', [
    { name: 'url', placeholder: 'Image URL', type: 'url' },
    { name: 'label', placeholder: 'Image label', type: 'text' },
    { name: 'roles', placeholder: 'Roles (THUMBNAIL, BASE, SMALL)', type: 'text' },
  ], 'Add Image');

  imagesSection.appendChild(imagesList);
  form.appendChild(imagesSection);

  // ===== LINKS SECTION =====
  const linksSection = createFormSection('Related Products');

  const linksList = createDynamicListSection('product-links', '', [
    { name: 'sku', placeholder: 'Related product SKU', type: 'text' },
    {
      name: 'type',
      type: 'select',
      options: [
        { value: 'related', label: 'Related' },
        { value: 'upsell', label: 'Upsell' },
        { value: 'crosssell', label: 'Cross-sell' },
      ],
    },
  ], 'Add Link');

  linksSection.appendChild(linksList);
  form.appendChild(linksSection);

  // ===== ROUTES SECTION =====
  const routesSection = createFormSection('Routes');

  const routesList = createDynamicListSection('product-routes', '', [
    { name: 'path', placeholder: 'Route path (e.g., sneakers)', type: 'text' },
  ], 'Add Route');

  routesSection.appendChild(routesList);
  form.appendChild(routesSection);

  // ===== PRICING SECTION =====
  const pricingSection = createFormSection('Pricing');

  const priceGroup = createFormGroup('product-price', 'Price (USD)', 'number', '0.00');

  pricingSection.appendChild(priceGroup);
  form.appendChild(pricingSection);

  body.appendChild(form);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'plp-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'plp-button plp-modal-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'plp-button plp-modal-submit';
  const submitBtnText = document.createElement('span');
  submitBtnText.textContent = 'Add Product';
  submitBtn.appendChild(submitBtnText);
  submitBtn.addEventListener('click', () => {
    form.dispatchEvent(new Event('submit'));
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);

  modal.appendChild(overlay);
  modal.appendChild(dialog);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  return modal;
}

function createFormGroup(id, labelText, inputType, placeholder, required = false) {
  const group = document.createElement('div');
  group.className = 'plp-form-group';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = inputType;
  input.id = id;
  input.className = 'plp-form-input';
  input.placeholder = placeholder;
  if (required) {
    input.required = true;
  }
  if (inputType === 'number') {
    input.step = '0.01';
    input.min = '0';
  }

  group.appendChild(label);
  group.appendChild(input);
  return group;
}

function refreshPriceBookFilterSelect() {
  const sel = document.querySelector('select.plp-pricebook-select');
  if (!sel) return;
  const opts = getPriceBookOptionsForFilter().map((pb) => ({ value: pb, label: pb }));
  sel.innerHTML = '';
  opts.forEach(({ value, label }) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    o.selected = value === state.selectedPriceBook;
    sel.appendChild(o);
  });
}

function createSelect(options, selectedValue, onChange, className = '') {
  const select = document.createElement('select');
  select.className = `plp-select ${className}`;
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedValue;
    select.appendChild(option);
  });
  select.addEventListener('change', (e) => onChange(e.target.value));
  return select;
}

function createButton(text, onClick, className = '', icon = null) {
  const button = document.createElement('button');
  button.className = `plp-button ${className}`;
  if (icon) button.appendChild(createIcon(icon));
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    button.appendChild(span);
  }
  button.addEventListener('click', onClick);
  return button;
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'plp-product-card';
  card.style.cursor = 'pointer';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Edit ${product.name}`);

  // Click handler to open edit modal
  card.addEventListener('click', (e) => {
    // Don't open edit modal if clicking delete button
    if (e.target.closest('.plp-delete-btn')) {
      return;
    }
    openEditModal(product);
  });

  // Keyboard support
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openEditModal(product);
    }
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'plp-delete-btn';
  deleteBtn.setAttribute('aria-label', `Delete ${product.name}`);
  deleteBtn.setAttribute('title', 'Delete product');
  deleteBtn.innerHTML = createIcon('delete').innerHTML;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleProductDelete(product, card);
  });
  card.appendChild(deleteBtn);

  const imageContainer = document.createElement('div');
  imageContainer.className = 'plp-product-image-container';

  // Show all images or placeholder if none
  const images = product.images && product.images.length > 0
    ? product.images
    : [{ url: 'https://via.placeholder.com/300', label: 'No image' }];

  if (images.length === 1) {
    // Single image - show full size
    const img = document.createElement('img');
    img.src = images[0].url;
    img.alt = images[0].label || product.name;
    img.className = 'plp-product-image';
    img.loading = 'lazy';
    imageContainer.appendChild(img);
  } else {
    // Multiple images - show gallery grid
    const gallery = document.createElement('div');
    gallery.className = 'plp-product-gallery';

    images.forEach((image, index) => {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'plp-product-gallery-item';

      const img = document.createElement('img');
      img.src = image.url;
      img.alt = image.label || `${product.name} image ${index + 1}`;
      img.className = 'plp-product-image';
      img.loading = 'lazy';

      // Show role badge if available
      if (image.roles && image.roles.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'plp-image-role-badge';
        badge.textContent = image.roles[0];
        imgWrapper.appendChild(badge);
      }

      imgWrapper.appendChild(img);
      gallery.appendChild(imgWrapper);
    });

    imageContainer.appendChild(gallery);
  }

  const info = document.createElement('div');
  info.className = 'plp-product-info';

  // Category
  if (product.category) {
    const category = document.createElement('p');
    category.className = 'plp-product-category';
    category.textContent = capitalize(product.category);
    info.appendChild(category);
  }

  // Product Name
  const name = document.createElement('h3');
  name.className = 'plp-product-name';
  name.textContent = product.name;
  info.appendChild(name);

  // SKU
  const sku = document.createElement('p');
  sku.className = 'plp-product-sku';
  sku.textContent = `SKU: ${product.sku}`;
  info.appendChild(sku);

  // Price
  const priceContainer = document.createElement('div');
  priceContainer.className = 'plp-price-container';

  const priceInfo = document.createElement('div');
  priceInfo.className = 'plp-price-info';

  const currentPrice = document.createElement('span');
  currentPrice.className = 'plp-current-price';
  currentPrice.textContent = formatPrice(product.price?.final);
  priceInfo.appendChild(currentPrice);

  if (showDiscount(product.price, product.globalPrice)) {
    const originalPrice = document.createElement('span');
    originalPrice.className = 'plp-original-price';
    originalPrice.textContent = product.globalPrice && state.selectedPriceBook !== getDefaultPriceBook()
      ? formatPrice(product.globalPrice.final)
      : formatPrice(product.price?.regular);
    priceInfo.appendChild(originalPrice);
  }

  priceContainer.appendChild(priceInfo);
  info.appendChild(priceContainer);

  // Short Description
  if (product.shortDescription) {
    const shortDesc = document.createElement('p');
    shortDesc.className = 'plp-product-short-desc';
    shortDesc.textContent = product.shortDescription;
    info.appendChild(shortDesc);
  }

  // Description
  if (product.description) {
    const desc = document.createElement('p');
    desc.className = 'plp-product-description';
    desc.textContent = product.description;
    info.appendChild(desc);
  }

  // Attributes
  if (product.attributes && product.attributes.length > 0) {
    const attrsContainer = document.createElement('div');
    attrsContainer.className = 'plp-product-attributes';

    const attrsTitle = document.createElement('p');
    attrsTitle.className = 'plp-product-attributes-title';
    attrsTitle.textContent = 'Attributes';
    attrsContainer.appendChild(attrsTitle);

    const attrsList = document.createElement('ul');
    attrsList.className = 'plp-product-attributes-list';

    product.attributes.forEach((attr) => {
      const attrItem = document.createElement('li');
      attrItem.className = 'plp-product-attribute';
      const label = attr.label || attr.name;
      attrItem.innerHTML = `<span class="attr-label">${label}:</span> <span class="attr-value">${attr.value}</span>`;
      attrsList.appendChild(attrItem);
    });

    attrsContainer.appendChild(attrsList);
    info.appendChild(attrsContainer);
  }

  // Meta Tags
  if (product.metaTags && (product.metaTags.title || product.metaTags.description || product.metaTags.keywords)) {
    const metaContainer = document.createElement('div');
    metaContainer.className = 'plp-product-metatags';

    const metaTitle = document.createElement('p');
    metaTitle.className = 'plp-product-metatags-title';
    metaTitle.textContent = 'Meta Tags';
    metaContainer.appendChild(metaTitle);

    const metaList = document.createElement('ul');
    metaList.className = 'plp-product-metatags-list';

    if (product.metaTags.title) {
      const titleItem = document.createElement('li');
      titleItem.className = 'plp-product-metatag';
      titleItem.innerHTML = `<span class="meta-label">Title:</span> <span class="meta-value">${product.metaTags.title}</span>`;
      metaList.appendChild(titleItem);
    }

    if (product.metaTags.description) {
      const descItem = document.createElement('li');
      descItem.className = 'plp-product-metatag';
      descItem.innerHTML = `<span class="meta-label">Description:</span> <span class="meta-value">${product.metaTags.description}</span>`;
      metaList.appendChild(descItem);
    }

    if (product.metaTags.keywords && product.metaTags.keywords.length > 0) {
      const keywordsItem = document.createElement('li');
      keywordsItem.className = 'plp-product-metatag';
      const keywordsStr = Array.isArray(product.metaTags.keywords)
        ? product.metaTags.keywords.join(', ')
        : product.metaTags.keywords;
      keywordsItem.innerHTML = `<span class="meta-label">Keywords:</span> <span class="meta-value">${keywordsStr}</span>`;
      metaList.appendChild(keywordsItem);
    }

    metaContainer.appendChild(metaList);
    info.appendChild(metaContainer);
  }

  card.appendChild(imageContainer);
  card.appendChild(info);

  return card;
}

// Render functions
function renderHeader(container) {
  const header = document.createElement('div');
  header.className = 'plp-header';

  const headerContent = document.createElement('div');
  headerContent.className = 'plp-header-content';

  const headerTop = document.createElement('div');
  headerTop.className = 'plp-header-top';

  const headerText = document.createElement('div');
  headerText.className = 'plp-header-text';

  const title = document.createElement('h1');
  title.className = 'plp-title';
  title.textContent = 'Product Collection';

  const subtitle = document.createElement('p');
  subtitle.className = 'plp-subtitle';
  subtitle.textContent = 'Discover our curated selection of premium products';

  headerText.appendChild(title);
  headerText.appendChild(subtitle);

  // Header buttons container
  const headerButtons = document.createElement('div');
  headerButtons.className = 'plp-header-buttons';

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'plp-button plp-button-secondary plp-settings-btn';
  settingsBtn.appendChild(createIcon('settings'));
  const settingsBtnText = document.createElement('span');
  settingsBtnText.textContent = 'Commerce settings';
  settingsBtn.appendChild(settingsBtnText);
  settingsBtn.addEventListener('click', openAcoSettingsModal);

  // Paste Product Grid button
  const pasteBtn = document.createElement('button');
  pasteBtn.className = 'plp-button plp-button-secondary';
  pasteBtn.appendChild(createIcon('clipboard'));
  const pasteBtnText = document.createElement('span');
  pasteBtnText.textContent = 'Paste Product Grid';
  pasteBtn.appendChild(pasteBtnText);
  pasteBtn.addEventListener('click', openPasteModal);

  const viewProductsJsonBtn = document.createElement('button');
  viewProductsJsonBtn.type = 'button';
  viewProductsJsonBtn.className = 'plp-button plp-button-secondary';
  viewProductsJsonBtn.textContent = 'View products.json';
  viewProductsJsonBtn.title = 'Preview FeedProduct array from the Paste Product Grid table';
  viewProductsJsonBtn.addEventListener('click', () => openIngestionJsonPreview('products'));

  const viewPricesJsonBtn = document.createElement('button');
  viewPricesJsonBtn.type = 'button';
  viewPricesJsonBtn.className = 'plp-button plp-button-secondary';
  viewPricesJsonBtn.textContent = 'View prices.json';
  viewPricesJsonBtn.title = 'Preview price rows from the Paste Product Grid table';
  viewPricesJsonBtn.addEventListener('click', () => openIngestionJsonPreview('prices'));

  const clearStorageBtn = document.createElement('button');
  clearStorageBtn.type = 'button';
  clearStorageBtn.className = 'plp-button plp-button-danger';
  clearStorageBtn.textContent = 'Clear app storage';
  clearStorageBtn.title =
    'Remove CLIENT_ID, CLIENT_SECRET, INGESTION_ACCESS_TOKEN, TENANT_ID, REGION, ENVIRONMENT, CATALOG_VIEW_ID, and PRICE_BOOK_ID for this tool only';
  clearStorageBtn.addEventListener('click', async () => {
    try {
      await handleClearAppLocalStorage();
    } catch (err) {
      alert(err?.message || String(err));
    }
  });

  headerButtons.appendChild(settingsBtn);
  headerButtons.appendChild(pasteBtn);
  headerButtons.appendChild(viewProductsJsonBtn);
  headerButtons.appendChild(viewPricesJsonBtn);
  headerButtons.appendChild(clearStorageBtn);

  headerTop.appendChild(headerText);
  headerTop.appendChild(headerButtons);

  // Filters container
  const filters = document.createElement('div');
  filters.className = 'plp-filters';

  // Search
  const searchContainer = document.createElement('div');
  searchContainer.className = 'plp-search-container';
  searchContainer.appendChild(createIcon('search'));

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search products...';
  searchInput.className = 'plp-search-input';
  searchInput.value = state.searchTerm;

  const debouncedSearch = debounce((value) => {
    state.searchTerm = value;
    state.currentPage = 1;
    loadProducts();
  }, 300);

  searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
  searchContainer.appendChild(searchInput);

  // Category filter
  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    ...state.categories.map((cat) => ({ value: cat, label: capitalize(cat) })),
  ];
  const categorySelect = createSelect(categoryOptions, state.selectedCategory, (value) => {
    state.selectedCategory = value;
    filterAndRenderProducts();
  }, 'plp-category-select');

  // Sort dropdown
  const sortOptions = [
    { value: 'featured', label: 'Featured' },
    { value: 'price-low', label: 'Price: Low to High' },
    { value: 'price-high', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest' },
  ];
  const sortSelect = createSelect(sortOptions, state.sortBy, (value) => {
    state.sortBy = value;
    filterAndRenderProducts();
  }, 'plp-sort-select');

  // Price book filter
  const priceBookOptions = getPriceBookOptionsForFilter().map((pb) => ({
    value: pb,
    label: pb,
  }));
  const priceBookSelect = createSelect(priceBookOptions, state.selectedPriceBook, (value) => {
    state.selectedPriceBook = value;
    state.currentPage = 1;
    loadProducts();
  }, 'plp-pricebook-select');

  filters.appendChild(searchContainer);
  filters.appendChild(categorySelect);
  filters.appendChild(sortSelect);
  filters.appendChild(priceBookSelect);

  headerContent.appendChild(headerTop);
  headerContent.appendChild(filters);
  header.appendChild(headerContent);
  container.appendChild(header);
}

function renderResultsHeader(container) {
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'plp-results-header';

  const resultsText = document.createElement('p');
  resultsText.className = 'plp-results-text';
  resultsText.innerHTML = `Showing <strong>1-${state.filteredProducts.length}</strong> of <strong>${state.totalCount}</strong> results`;

  const viewToggle = document.createElement('div');
  viewToggle.className = 'plp-view-toggle';
  viewToggle.appendChild(createButton('', () => {}, 'plp-view-btn active', 'grid'));
  viewToggle.appendChild(createButton('', () => {}, 'plp-view-btn', 'list'));

  resultsHeader.appendChild(resultsText);
  resultsHeader.appendChild(viewToggle);
  container.appendChild(resultsHeader);
}

function renderProductGrid(container) {
  let grid = container.querySelector('.plp-product-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'plp-product-grid';
    container.appendChild(grid);
  } else {
    grid.innerHTML = '';
  }

  state.filteredProducts.forEach((product) => {
    grid.appendChild(createProductCard(product));
  });
}

function renderLoadMore(container) {
  const existing = container.querySelector('.plp-load-more-container');
  if (existing) existing.remove();

  if (state.filteredProducts.length >= state.totalCount) return;

  const loadMoreContainer = document.createElement('div');
  loadMoreContainer.className = 'plp-load-more-container';

  const loadMoreBtn = createButton(
    state.isLoading ? 'Loading...' : 'Load More Products',
    handleLoadMore,
    'plp-load-more-btn',
    state.isLoading ? 'loader' : null,
  );
  loadMoreBtn.disabled = state.isLoading;

  loadMoreContainer.appendChild(loadMoreBtn);
  container.appendChild(loadMoreContainer);
}

// Data functions
async function loadProducts(append = false) {
  if (!hasAnyCommerceLocalStorage()) {
    state.isLoading = false;
    if (!append) {
      state.products = [];
      state.totalCount = 0;
      state.currentPage = 1;
      filterAndRenderProducts();
    }
    updateLoadingState();
    const listContainer = document.getElementById('product-list-container');
    if (listContainer) renderAcoConfigBanner(listContainer);
    return;
  }

  state.isLoading = true;
  updateLoadingState();

  try {
    const result = await searchProducts(
      acoRuntime.catalogViewId,
      DEFAULT_LOCALE,
      state.selectedPriceBook,
      state.searchTerm,
      PAGE_SIZE,
      state.currentPage,
    );

    if (append) {
      state.products = [...state.products, ...result.products];
    } else {
      state.products = result.products;
    }
    state.totalCount = result.totalCount;

    // Extract categories
    const newCategories = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
    state.categories = [...new Set([...state.categories, ...newCategories])];

    filterAndRenderProducts();
  } catch (error) {
    console.error('Error loading products:', error);
  } finally {
    state.isLoading = false;
    updateLoadingState();
  }
}

function filterAndRenderProducts() {
  let filtered = [...state.products];

  // Filter by category
  if (state.selectedCategory !== 'all') {
    filtered = filtered.filter((p) => p.category === state.selectedCategory);
  }

  // Sort products
  switch (state.sortBy) {
    case 'price-low':
      filtered.sort((a, b) => (a.price?.final?.amount?.value || 0) - (b.price?.final?.amount?.value || 0));
      break;
    case 'price-high':
      filtered.sort((a, b) => (b.price?.final?.amount?.value || 0) - (a.price?.final?.amount?.value || 0));
      break;
    case 'newest':
      filtered.reverse();
      break;
    default:
      break;
  }

  state.filteredProducts = filtered;
  renderProducts();
}

function renderProducts() {
  const mainContent = document.querySelector('.plp-main-content');
  if (!mainContent) return;

  // Update results header
  const resultsHeader = mainContent.querySelector('.plp-results-header');
  if (resultsHeader) {
    const resultsText = resultsHeader.querySelector('.plp-results-text');
    if (resultsText) {
      resultsText.innerHTML = `Showing <strong>1-${state.filteredProducts.length}</strong> of <strong>${state.totalCount}</strong> results`;
    }
  }

  renderProductGrid(mainContent);
  renderLoadMore(mainContent);
}

function updateLoadingState() {
  const loadMoreBtn = document.querySelector('.plp-load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.disabled = state.isLoading;
    const span = loadMoreBtn.querySelector('span');
    if (span) span.textContent = state.isLoading ? 'Loading...' : 'Load More Products';
  }
}

async function handleLoadMore() {
  state.currentPage += 1;
  await loadProducts(true);
}

// Main initialization
function renderProductListPage(container) {
  container.innerHTML = '';
  container.className = 'product-list-page';

  renderHeader(container);

  const mainContent = document.createElement('div');
  mainContent.className = 'plp-main-content';

  renderResultsHeader(mainContent);
  renderProductGrid(mainContent);
  renderLoadMore(mainContent);

  container.appendChild(mainContent);
}

function renderAcoConfigBanner(container) {
  const existing = container.querySelector('.plp-config-banner');
  if (existing) existing.remove();

  const lines = [];
  if (!hasAnyCommerceLocalStorage()) {
    lines.push(
      'Open Commerce settings (header) and save at least one field—the product catalog loads only after something is saved there.',
    );
  }
  if (!accessToken) {
    lines.push(
      'Open Commerce settings: add INGESTION_ACCESS_TOKEN or CLIENT_ID plus CLIENT_SECRET, or open this tool signed in with DA (DA token alone does not authorize catalog writes).',
    );
  }

  if (lines.length === 0) return;

  const wrap = document.createElement('div');
  wrap.className = 'plp-config-banner';
  wrap.setAttribute('role', 'status');

  const title = document.createElement('p');
  title.className = 'plp-config-banner-title';
  title.textContent = 'Open Commerce settings';

  const list = document.createElement('ul');
  list.className = 'plp-config-banner-list';
  lines.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });

  wrap.appendChild(title);
  wrap.appendChild(list);
  container.insertBefore(wrap, container.firstChild);
}

(async function init() {
  acoRuntime = buildAcoRuntimeConfig();

  const { context, token, actions } = await DA_SDK;
  console.log('DA SDK Context:', context);

  if (!accessToken) {
    console.log('DA SDK token provided:', !!token);
    if (token) {
      accessToken = token;
      console.log('Using DA SDK token');
    } else {
      console.log('No DA SDK token, requesting from Adobe IMS...');
      if (acoRuntime.hasImsClientCredentials) {
        try {
          accessToken = await requestAccessToken();
          console.log('Using IMS access token');
        } catch (error) {
          console.error('Failed to get access token:', error);
        }
      } else {
        console.warn(
          'Skipping IMS token request: use Commerce settings to set CLIENT_ID and CLIENT_SECRET.',
        );
      }
    }
  }
  console.log('Access token available:', !!accessToken);

  let hydrateResult = { ok: false };
  try {
    hydrateResult = await hydrateCommerceSettingsFromQueryParams();
    if (hydrateResult.ok) {
      acoRuntime = buildAcoRuntimeConfig();
      if (!getPriceBookOptionsForFilter().includes(state.selectedPriceBook)) {
        state.selectedPriceBook = getDefaultPriceBook();
      }
      if (acoRuntime.hasImsClientCredentials) {
        try {
          accessToken = await requestAccessToken();
          console.log('Refreshed IMS access token after commerce sheet hydrate');
        } catch (e) {
          console.warn('Could not refresh IMS token after sheet hydrate:', e);
        }
      }
    }
  } catch (e) {
    console.warn('hydrateCommerceSettingsFromQueryParams:', e);
  }

  // Create main container
  const container = document.createElement('div');
  container.id = 'product-list-container';
  document.body.appendChild(container);

  // Add stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/tools/products/products.css';
  document.head.appendChild(link);

  // Initialize and render
  renderProductListPage(container);
  refreshPriceBookFilterSelect();
  renderAcoConfigBanner(container);

  // Add modals to the page
  const addModal = createModal();
  document.body.appendChild(addModal);

  const acoSettingsModal = createAcoSettingsModal();
  document.body.appendChild(acoSettingsModal);

  if (hydrateResult.ok) {
    fillAcoSettingsForm(acoSettingsModal.querySelector('form'));
  }

  const pasteModal = createPasteModal();
  document.body.appendChild(pasteModal);

  const ingestionJsonPreviewModal = createIngestionJsonPreviewModal();
  document.body.appendChild(ingestionJsonPreviewModal);

  const editModal = createEditModal();
  document.body.appendChild(editModal);

  if (!hasAnyCommerceLocalStorage()) {
    openAcoSettingsModal();
    await loadProducts();
  } else {
    await loadProducts();
  }
}());
