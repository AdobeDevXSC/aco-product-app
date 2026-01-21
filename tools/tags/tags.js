import DA_SDK from 'https://da.live/nx/utils/sdk.js';

// Constants
const PAGE_SIZE = 25;
const CATALOG_VIEW_ID = 'your-catalog-view-id'; // Update with your catalog ID
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_PRICE_BOOK = 'global';
const ALL_PRICE_BOOKS = ['global', 'vip'];

// State
const state = {
  products: [],
  filteredProducts: [],
  searchTerm: '',
  sortBy: 'featured',
  selectedCategory: 'all',
  selectedPriceBook: DEFAULT_PRICE_BOOK,
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

// Mock API - Replace with your actual API call
async function searchProducts(catalogId, locale, priceBook, searchTerm, pageSize, page) {
  // Simulate API delay
  await new Promise((resolve) => { setTimeout(resolve, 500); });

  // Mock product data - Replace with actual API call
  const mockProducts = Array.from({ length: pageSize }, (_, i) => ({
    sku: `SKU-${(page - 1) * pageSize + i + 1}`,
    name: `Product ${(page - 1) * pageSize + i + 1}`,
    category: ['running', 'hiking', 'training', 'lifestyle'][Math.floor(Math.random() * 4)],
    images: [{ url: `https://picsum.photos/seed/${(page - 1) * pageSize + i}/300/300` }],
    price: {
      regular: { amount: { value: 99.99 + Math.random() * 100, currency: 'USD' } },
      final: { amount: { value: 79.99 + Math.random() * 80, currency: 'USD' } },
    },
  }));

  const filtered = searchTerm
    ? mockProducts.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : mockProducts;

  return {
    products: filtered,
    totalCount: 150,
  };
}

// DOM Creation helpers
function createIcon(name) {
  const icons = {
    search: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    sort: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
    grid: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    list: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
    loader: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  };
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = icons[name] || '';
  return span;
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

  const imageContainer = document.createElement('div');
  imageContainer.className = 'plp-product-image-container';

  const img = document.createElement('img');
  img.src = product.images?.[0]?.url || 'https://via.placeholder.com/300';
  img.alt = product.name;
  img.className = 'plp-product-image';
  img.loading = 'lazy';
  imageContainer.appendChild(img);

  const info = document.createElement('div');
  info.className = 'plp-product-info';

  const category = document.createElement('p');
  category.className = 'plp-product-category';
  category.textContent = capitalize(product.category) || 'No Category';

  const name = document.createElement('h3');
  name.className = 'plp-product-name';
  name.textContent = product.name;

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
    originalPrice.textContent = product.globalPrice && state.selectedPriceBook !== 'global'
      ? formatPrice(product.globalPrice.final)
      : formatPrice(product.price?.regular);
    priceInfo.appendChild(originalPrice);
  }

  const addToCartBtn = createButton('Add to Cart', () => {
    console.log('Add to cart:', product.sku);
  }, 'plp-add-to-cart-btn');

  priceContainer.appendChild(priceInfo);
  priceContainer.appendChild(addToCartBtn);

  info.appendChild(category);
  info.appendChild(name);
  info.appendChild(priceContainer);

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
  const priceBookOptions = ALL_PRICE_BOOKS.map((pb) => ({
    value: pb,
    label: pb === 'global' ? 'Global Price Book' : 'VIP Price Book',
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

  headerContent.appendChild(headerText);
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
  state.isLoading = true;
  updateLoadingState();

  try {
    const result = await searchProducts(
      CATALOG_VIEW_ID,
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

(async function init() {
  const { context, token, actions } = await DA_SDK;
  console.log('DA SDK Context:', context);

  // Create main container
  const container = document.createElement('div');
  container.id = 'product-list-container';
  document.body.appendChild(container);

  // Add stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/tools/tags/tags.css';
  document.head.appendChild(link);

  // Initialize and render
  renderProductListPage(container);
  await loadProducts();
}());
