import DA_SDK from 'https://da.live/nx/utils/sdk.js';

// ACO GraphQL (aligned with tools/products/products.js)
const ACO_TENANT_ID = 'NZwP3wKPFXBCTLGqxYWZne';
const ACO_BASE_URL = `https://na1-sandbox.api.commerce.adobe.com/${ACO_TENANT_ID}`;
const ACO_URL = `${ACO_BASE_URL}/graphql`;
const CATALOG_VIEW_ID = '426ffe32-e0a9-4c53-8ec9-3f7118cbf6b2';
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_PRICE_BOOK = 'wknd_global';
const SKU_TYPEAHEAD_PAGE_SIZE = 10;
/** Page size when loading the PLP product grid after confirming search (Enter). */
const LISTING_GRID_PAGE_SIZE = 24;

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

/**
 * @param {(...args: unknown[]) => void} fn
 * @param {number} delay
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * @param {string} searchTerm
 * @param {number} [pageSize]
 * @returns {Promise<{ products: { sku: string, name: string, thumbnailUrl: string }[], totalCount: number }>}
 */
async function fetchAcoProductSearch(searchTerm, pageSize = SKU_TYPEAHEAD_PAGE_SIZE) {
  try {
    const response = await fetch(ACO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ac-price-book-id': DEFAULT_PRICE_BOOK,
        'ac-source-locale': DEFAULT_LOCALE,
        'ac_environment_id': CATALOG_VIEW_ID,
        'go-compute': '1',
      },
      body: JSON.stringify({
        query: PRODUCT_SEARCH_QUERY,
        variables: {
          search: searchTerm || '',
          pageSize,
          currentPage: 1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const searchResult = data?.data?.productSearch;

    if (!searchResult) {
      return { products: [], totalCount: 0 };
    }

    const products = searchResult.items.map((item) => {
      const product = item.productView;
      const thumb = product.images?.[0]?.url || '';
      return {
        sku: product.sku || '',
        name: product.name || '',
        thumbnailUrl: thumb,
      };
    });

    return {
      products,
      totalCount: searchResult.total_count || 0,
    };
  } catch (error) {
    console.error('fetchAcoProductSearch:', error);
    return { products: [], totalCount: 0 };
  }
}

function createSkuThumbPlaceholder() {
  const el = document.createElement('div');
  el.className = 'da-sku-thumb-placeholder';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Caterpillar CAT wordmark + triangle (local PNG). */
const CATERPILLAR_LOGO_URL = '/tools/dealer-admin/assets/cat-logo.png';

const CAT_COM_HOME_URL = 'https://www.cat.com/en_US.html';

/** Stub style tags for the multi-select (replace with API data later). */
const STYLE_TAG_OPTIONS = [
  'default',
  'compact',
  'wide-layout',
  'hero-banner',
  'dealer-branded',
  'marketing',
  'minimal',
  'rich-media',
];

const PAGE_TYPE_CARDS = [
  { id: 'landing', label: 'Landing Page' },
  { id: 'product-listing', label: 'Product Listing Page' },
  { id: 'product-detail', label: 'Product Detail Page' },
  { id: 'news', label: 'News' },
  { id: 'blog-post', label: 'Blog Post' },
];

/** Simple placeholder icon (inline SVG). */
function formatStyleTagLabel(id) {
  return id.replace(/-/g, ' ');
}

/**
 * Spectrum-style "open in new window" icon (24px).
 */
function createOpenInNewIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'da-icon-open-in-new');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.6l-9.3 9.3 1.4 1.4L19 6.4V10h2V3h-7z',
  );
  svg.appendChild(path);
  return svg;
}

/**
 * TagGroup-style UI (vanilla DOM; mirrors React Spectrum TagGroup + ActionButton pattern).
 * @param {HTMLElement} container
 * @param {string[]} catalogIds
 * @param {(() => void) | undefined} onTagsChange
 */
function createStyleTagGroup(container, catalogIds, onTagsChange) {
  /** @type {string[]} */
  let selectedIds = [];

  const wrap = document.createElement('div');
  wrap.className = 'da-tag-group';

  const label = document.createElement('span');
  label.id = 'da-style-tag-group-label';
  label.className = 'da-label';
  label.textContent = 'Style';

  const list = document.createElement('div');
  list.className = 'da-tag-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-labelledby', 'da-style-tag-group-label');

  const addRow = document.createElement('div');
  addRow.className = 'da-tag-add-row';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'da-action-button';
  addBtn.setAttribute('aria-haspopup', 'listbox');
  addBtn.setAttribute('aria-expanded', 'false');

  const addIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  addIcon.setAttribute('class', 'da-action-button-icon');
  addIcon.setAttribute('viewBox', '0 0 24 24');
  addIcon.setAttribute('aria-hidden', 'true');
  const addPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  addPath.setAttribute('d', 'M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z');
  addPath.setAttribute('fill', 'currentColor');
  addIcon.appendChild(addPath);

  const addText = document.createElement('span');
  addText.textContent = 'Add item';

  addBtn.appendChild(addIcon);
  addBtn.appendChild(addText);

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'da-tag-add-picker';
  pickerWrap.hidden = true;

  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'da-visually-hidden';
  pickerLabel.htmlFor = 'da-style-add-select';
  pickerLabel.textContent = 'Choose a style tag to add';

  const picker = document.createElement('select');
  picker.id = 'da-style-add-select';
  picker.className = 'da-tag-add-select';
  picker.setAttribute('aria-label', 'Choose a style tag to add');

  pickerWrap.appendChild(pickerLabel);
  pickerWrap.appendChild(picker);

  addRow.appendChild(addBtn);
  addRow.appendChild(pickerWrap);

  function availableToAdd() {
    return catalogIds.filter((id) => !selectedIds.includes(id));
  }

  function refreshPickerOptions() {
    picker.innerHTML = '';
    const avail = availableToAdd();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = avail.length ? 'Choose a tag…' : 'All tags added';
    placeholder.disabled = avail.length === 0;
    picker.appendChild(placeholder);
    avail.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = formatStyleTagLabel(id);
      picker.appendChild(opt);
    });
    picker.value = '';
    addBtn.disabled = avail.length === 0;
    if (avail.length === 0) {
      pickerWrap.hidden = true;
      addBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function renderTags() {
    list.replaceChildren();
    selectedIds.forEach((id) => {
      const row = document.createElement('div');
      row.className = 'da-tag';
      row.setAttribute('role', 'listitem');

      const text = document.createElement('span');
      text.className = 'da-tag-text';
      text.textContent = formatStyleTagLabel(id);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'da-tag-remove';
      removeBtn.setAttribute('aria-label', `Remove ${formatStyleTagLabel(id)}`);
      removeBtn.innerHTML =
        '<svg class="da-tag-remove-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.3 6.3c.4-.4.4-1 0-1.4s-1-.4-1.4 0L12 9.6 7.1 4.7c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4L10.6 11l-4.9 4.9c-.4.4-.4 1 0 1.4.4.4 1 .4 1.4 0l4.9-4.9 4.9 4.9c.4.4 1 .4 1.4 0 .4-.4.4-1 0-1.4L13.4 11l4.9-4.9c.4-.4.4-1 0-1.4z"/></svg>';

      removeBtn.addEventListener('click', () => {
        selectedIds = selectedIds.filter((x) => x !== id);
        renderTags();
        refreshPickerOptions();
      });

      row.appendChild(text);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    onTagsChange?.();
  }

  picker.addEventListener('change', () => {
    const v = picker.value;
    if (!v || selectedIds.includes(v)) return;
    selectedIds = [...selectedIds, v];
    renderTags();
    refreshPickerOptions();
    picker.focus();
  });

  addBtn.addEventListener('click', () => {
    if (addBtn.disabled) return;
    const open = pickerWrap.hidden;
    pickerWrap.hidden = !open;
    addBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      refreshPickerOptions();
      picker.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!pickerWrap.hidden && !wrap.contains(e.target)) {
      pickerWrap.hidden = true;
      addBtn.setAttribute('aria-expanded', 'false');
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(list);
  wrap.appendChild(addRow);

  renderTags();
  refreshPickerOptions();
  container.appendChild(wrap);

  return {
    getSelectedStyleIds: () => [...selectedIds],
  };
}

function createPlaceholderIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'da-page-type-icon-svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '8');
  rect.setAttribute('y', '10');
  rect.setAttribute('width', '32');
  rect.setAttribute('height', '28');
  rect.setAttribute('rx', '2');
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', 'currentColor');
  rect.setAttribute('stroke-width', '2');
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '14');
  line1.setAttribute('y1', '18');
  line1.setAttribute('x2', '34');
  line1.setAttribute('y2', '18');
  line1.setAttribute('stroke', 'currentColor');
  line1.setAttribute('stroke-width', '2');
  line1.setAttribute('stroke-linecap', 'round');
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '14');
  line2.setAttribute('y1', '26');
  line2.setAttribute('x2', '28');
  line2.setAttribute('y2', '26');
  line2.setAttribute('stroke', 'currentColor');
  line2.setAttribute('stroke-width', '2');
  line2.setAttribute('stroke-linecap', 'round');
  svg.appendChild(rect);
  svg.appendChild(line1);
  svg.appendChild(line2);
  return svg;
}

/**
 * @param {HTMLElement} main
 */
function renderCreateNewPageSection(main) {
  const section = document.createElement('section');
  section.className = 'da-create-section';
  section.setAttribute('aria-labelledby', 'da-create-new-page-heading');

  const heading = document.createElement('h2');
  heading.id = 'da-create-new-page-heading';
  heading.className = 'da-section-title';
  heading.textContent = 'Create New Page';

  const grid = document.createElement('div');
  grid.className = 'da-page-type-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Page type');

  const styleField = document.createElement('div');
  styleField.className = 'da-style-field';
  styleField.hidden = true;

  const pageNameGroup = document.createElement('div');
  pageNameGroup.className = 'da-page-name-group';

  const pageNameLabel = document.createElement('label');
  pageNameLabel.className = 'da-label';
  pageNameLabel.htmlFor = 'da-page-name';
  pageNameLabel.textContent = 'Page name';

  const pageNameInput = document.createElement('input');
  pageNameInput.type = 'text';
  pageNameInput.id = 'da-page-name';
  pageNameInput.className = 'da-text-input';
  pageNameInput.name = 'pageName';
  pageNameInput.placeholder = 'Enter a name for this page';
  pageNameInput.autocomplete = 'off';
  pageNameInput.disabled = true;

  pageNameGroup.appendChild(pageNameLabel);
  pageNameGroup.appendChild(pageNameInput);
  styleField.appendChild(pageNameGroup);

  const skuField = document.createElement('div');
  skuField.className = 'da-sku-field';
  skuField.hidden = true;

  const skuCombo = document.createElement('div');
  skuCombo.className = 'da-sku-combo';

  const skuLabel = document.createElement('label');
  skuLabel.className = 'da-label';
  skuLabel.htmlFor = 'da-sku-search';
  skuLabel.textContent = 'SKU';

  const skuInputWrap = document.createElement('div');
  skuInputWrap.className = 'da-sku-input-wrap';

  const skuInput = document.createElement('input');
  skuInput.type = 'text';
  skuInput.id = 'da-sku-search';
  skuInput.className = 'da-text-input';
  skuInput.name = 'skuSearch';
  skuInput.placeholder = 'Search by SKU or product name';
  skuInput.autocomplete = 'off';
  skuInput.disabled = true;
  skuInput.setAttribute('aria-autocomplete', 'list');
  skuInput.setAttribute('aria-controls', 'da-sku-suggestions');
  skuInput.setAttribute('aria-expanded', 'false');

  const skuListbox = document.createElement('div');
  skuListbox.id = 'da-sku-suggestions';
  skuListbox.className = 'da-sku-suggestions';
  skuListbox.setAttribute('role', 'listbox');
  skuListbox.hidden = true;

  const skuSelectedPanel = document.createElement('div');
  skuSelectedPanel.className = 'da-sku-selected';
  skuSelectedPanel.hidden = true;
  skuSelectedPanel.setAttribute('aria-label', 'Selected product');

  skuInputWrap.appendChild(skuInput);
  skuInputWrap.appendChild(skuListbox);
  skuCombo.appendChild(skuLabel);
  skuCombo.appendChild(skuInputWrap);
  skuField.appendChild(skuCombo);
  skuField.appendChild(skuSelectedPanel);

  const listingField = document.createElement('div');
  listingField.className = 'da-listing-field';
  listingField.hidden = true;

  const listingCombo = document.createElement('div');
  listingCombo.className = 'da-sku-combo da-listing-combo';

  const listingLabel = document.createElement('label');
  listingLabel.className = 'da-label';
  listingLabel.htmlFor = 'da-listing-search';
  listingLabel.textContent = 'Category search';

  const listingInputWrap = document.createElement('div');
  listingInputWrap.className = 'da-sku-input-wrap';

  const listingInput = document.createElement('input');
  listingInput.type = 'text';
  listingInput.id = 'da-listing-search';
  listingInput.className = 'da-text-input';
  listingInput.name = 'listingSearch';
  listingInput.placeholder = 'Search products (string); press Enter to load grid';
  listingInput.autocomplete = 'off';
  listingInput.disabled = true;
  listingInput.setAttribute('aria-autocomplete', 'list');
  listingInput.setAttribute('aria-controls', 'da-listing-suggestions');
  listingInput.setAttribute('aria-expanded', 'false');

  const listingListbox = document.createElement('div');
  listingListbox.id = 'da-listing-suggestions';
  listingListbox.className = 'da-sku-suggestions da-listing-suggestions';
  listingListbox.setAttribute('role', 'listbox');
  listingListbox.hidden = true;

  const listingSelectedHeading = document.createElement('h3');
  listingSelectedHeading.className = 'da-listing-selected-heading';
  listingSelectedHeading.hidden = true;
  const listingSelectedLabel = document.createElement('span');
  listingSelectedLabel.className = 'da-listing-selected-label';
  listingSelectedLabel.textContent = 'Selected Category ';
  const listingSelectedName = document.createElement('span');
  listingSelectedName.className = 'da-listing-selected-name';
  listingSelectedHeading.appendChild(listingSelectedLabel);
  listingSelectedHeading.appendChild(listingSelectedName);

  const listingGrid = document.createElement('div');
  listingGrid.className = 'da-plp-grid';
  listingGrid.setAttribute('role', 'region');
  listingGrid.setAttribute('aria-label', 'Products for selected category search');
  listingGrid.hidden = true;

  listingInputWrap.appendChild(listingInput);
  listingInputWrap.appendChild(listingListbox);
  listingCombo.appendChild(listingLabel);
  listingCombo.appendChild(listingInputWrap);
  listingField.appendChild(listingCombo);
  listingField.appendChild(listingSelectedHeading);
  listingField.appendChild(listingGrid);

  let lockedSelectionSku = null;
  /** Confirmed listing search string after Enter (enables Author for product-listing). */
  let confirmedListingTerm = null;
  let selectedPageTypeId = null;
  let styleTags = { getSelectedStyleIds: () => /** @type {string[]} */ ([]) };

  styleField.appendChild(skuField);
  styleField.appendChild(listingField);

  const authorRow = document.createElement('div');
  authorRow.className = 'da-author-row';
  authorRow.hidden = true;
  const authorBtn = document.createElement('button');
  authorBtn.type = 'button';
  authorBtn.className = 'da-button da-button-primary da-author-page-btn';
  authorBtn.disabled = true;
  authorBtn.setAttribute('aria-label', 'Author the Page, opens in a new tab');
  const authorBtnLabel = document.createElement('span');
  authorBtnLabel.className = 'da-author-page-btn-label';
  authorBtnLabel.textContent = 'Author the Page';
  authorBtn.appendChild(authorBtnLabel);
  authorBtn.appendChild(createOpenInNewIcon());
  authorRow.appendChild(authorBtn);

  function updateAuthorButton() {
    const nameOk = pageNameInput.value.trim().length > 0;
    const styles = styleTags.getSelectedStyleIds();
    const stylesOk = styles.length >= 1;
    let skuOk = true;
    if (selectedPageTypeId === 'product-detail') {
      skuOk =
        (lockedSelectionSku !== null && String(lockedSelectionSku).length > 0) ||
        skuInput.value.trim().length > 0;
    }
    let listingOk = true;
    if (selectedPageTypeId === 'product-listing') {
      listingOk = confirmedListingTerm !== null && String(confirmedListingTerm).trim().length > 0;
    }
    const ready = Boolean(selectedPageTypeId && nameOk && stylesOk && skuOk && listingOk);
    authorRow.hidden = !ready;
    authorBtn.disabled = !ready;
  }

  authorBtn.addEventListener('click', () => {
    if (authorBtn.disabled) return;
    const params = new URLSearchParams();
    if (selectedPageTypeId) params.set('pageType', selectedPageTypeId);
    params.set('title', pageNameInput.value.trim());
    params.set('styles', styleTags.getSelectedStyleIds().join(','));
    if (selectedPageTypeId === 'product-detail') {
      params.set('sku', skuInput.value.trim());
    }
    if (selectedPageTypeId === 'product-listing' && confirmedListingTerm) {
      params.set('listingSearch', confirmedListingTerm.trim());
    }
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  styleTags = createStyleTagGroup(styleField, STYLE_TAG_OPTIONS, updateAuthorButton);
  styleField.appendChild(authorRow);

  pageNameInput.addEventListener('input', updateAuthorButton);

  const pageTypeHint = document.createElement('p');
  pageTypeHint.className = 'da-page-type-hint';
  pageTypeHint.textContent = 'Select a page type above to enter a page name and styles.';

  let skuSearchSeq = 0;
  let listingSearchSeq = 0;
  let listingConfirmSeq = 0;

  function clearListingResults() {
    confirmedListingTerm = null;
    listingSelectedHeading.hidden = true;
    listingSelectedName.textContent = '';
    listingGrid.hidden = true;
    listingGrid.replaceChildren();
    updateAuthorButton();
  }

  function closeListingSuggestions() {
    listingListbox.hidden = true;
    listingListbox.replaceChildren();
    listingInput.setAttribute('aria-expanded', 'false');
  }

  /**
   * @param {{ sku: string, name: string, thumbnailUrl: string }[]} products
   */
  function renderListingGrid(products) {
    listingGrid.replaceChildren();
    if (products.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'da-plp-empty';
      empty.textContent = 'No products found for this search.';
      listingGrid.appendChild(empty);
      listingGrid.hidden = false;
      return;
    }
    products.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'da-plp-card';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'da-plp-card-thumb-wrap';
      if (p.thumbnailUrl) {
        const img = document.createElement('img');
        img.src = p.thumbnailUrl;
        img.className = 'da-plp-card-thumb';
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.replaceWith(createSkuThumbPlaceholder());
        });
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(createSkuThumbPlaceholder());
      }

      const body = document.createElement('div');
      body.className = 'da-plp-card-body';
      const lineSku = document.createElement('div');
      lineSku.className = 'da-plp-card-sku';
      lineSku.textContent = p.sku;
      const lineName = document.createElement('div');
      lineName.className = 'da-plp-card-name';
      lineName.textContent = p.name || '';
      body.appendChild(lineSku);
      body.appendChild(lineName);

      card.appendChild(thumbWrap);
      card.appendChild(body);
      listingGrid.appendChild(card);
    });
    listingGrid.hidden = false;
  }

  async function confirmListingSearch() {
    const term = listingInput.value.trim();
    if (!term) {
      return;
    }
    closeListingSuggestions();
    confirmedListingTerm = term;
    listingSelectedName.textContent = term;
    listingSelectedHeading.hidden = false;

    const seq = ++listingConfirmSeq;
    const { products } = await fetchAcoProductSearch(term, LISTING_GRID_PAGE_SIZE);
    if (seq !== listingConfirmSeq) {
      return;
    }
    renderListingGrid(products);
    updateAuthorButton();
  }

  function clearSkuSelectedPanel() {
    skuSelectedPanel.hidden = true;
    skuSelectedPanel.replaceChildren();
    lockedSelectionSku = null;
    updateAuthorButton();
  }

  /**
   * @param {{ sku: string, name: string, thumbnailUrl: string }} p
   */
  function renderSkuSelectedPanel(p) {
    skuSelectedPanel.hidden = false;
    skuSelectedPanel.replaceChildren();

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'da-sku-selected-thumb-wrap';
    if (p.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = p.thumbnailUrl;
      img.className = 'da-sku-selected-thumb';
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.replaceWith(createSkuThumbPlaceholder());
      });
      thumbWrap.appendChild(img);
    } else {
      thumbWrap.appendChild(createSkuThumbPlaceholder());
    }

    const textCol = document.createElement('div');
    textCol.className = 'da-sku-selected-text';
    const selLabel = document.createElement('div');
    selLabel.className = 'da-sku-selected-heading';
    selLabel.textContent = 'Selected';
    const lineSku = document.createElement('div');
    lineSku.className = 'da-sku-selected-sku';
    lineSku.textContent = p.sku;
    const lineName = document.createElement('div');
    lineName.className = 'da-sku-selected-name';
    lineName.textContent = p.name || '';
    textCol.appendChild(selLabel);
    textCol.appendChild(lineSku);
    textCol.appendChild(lineName);

    skuSelectedPanel.appendChild(thumbWrap);
    skuSelectedPanel.appendChild(textCol);

    const sr = document.createElement('span');
    sr.className = 'da-visually-hidden';
    sr.setAttribute('role', 'status');
    sr.textContent = `Selected product ${p.sku}`;
    skuSelectedPanel.appendChild(sr);
    updateAuthorButton();
  }

  function closeSkuSuggestions() {
    skuListbox.hidden = true;
    skuListbox.replaceChildren();
    skuInput.setAttribute('aria-expanded', 'false');
  }

  function renderSkuSuggestionRows(products) {
    skuListbox.replaceChildren();
    products.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'da-sku-suggestion-row';
      row.setAttribute('role', 'option');

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'da-sku-thumb-wrap';
      if (p.thumbnailUrl) {
        const img = document.createElement('img');
        img.src = p.thumbnailUrl;
        img.className = 'da-sku-thumb';
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.replaceWith(createSkuThumbPlaceholder());
        });
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(createSkuThumbPlaceholder());
      }

      const textCol = document.createElement('div');
      textCol.className = 'da-sku-suggestion-text';
      const lineSku = document.createElement('div');
      lineSku.className = 'da-sku-suggestion-sku';
      lineSku.textContent = p.sku;
      const lineName = document.createElement('div');
      lineName.className = 'da-sku-suggestion-name';
      lineName.textContent = p.name || '';
      textCol.appendChild(lineSku);
      textCol.appendChild(lineName);

      row.appendChild(thumbWrap);
      row.appendChild(textCol);
      row.addEventListener('click', () => {
        skuInput.value = p.sku;
        lockedSelectionSku = p.sku;
        closeSkuSuggestions();
        renderSkuSelectedPanel(p);
      });
      skuListbox.appendChild(row);
    });
  }

  function renderListingSuggestionRows(products) {
    listingListbox.replaceChildren();
    products.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'da-sku-suggestion-row';
      row.setAttribute('role', 'option');

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'da-sku-thumb-wrap';
      if (p.thumbnailUrl) {
        const img = document.createElement('img');
        img.src = p.thumbnailUrl;
        img.className = 'da-sku-thumb';
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.replaceWith(createSkuThumbPlaceholder());
        });
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.appendChild(createSkuThumbPlaceholder());
      }

      const textCol = document.createElement('div');
      textCol.className = 'da-sku-suggestion-text';
      const lineSku = document.createElement('div');
      lineSku.className = 'da-sku-suggestion-sku';
      lineSku.textContent = p.sku;
      const lineName = document.createElement('div');
      lineName.className = 'da-sku-suggestion-name';
      lineName.textContent = p.name || '';
      textCol.appendChild(lineSku);
      textCol.appendChild(lineName);

      row.appendChild(thumbWrap);
      row.appendChild(textCol);
      row.addEventListener('click', () => {
        listingInput.value = p.name || p.sku;
        closeListingSuggestions();
      });
      listingListbox.appendChild(row);
    });
  }

  const debouncedSkuSearch = debounce(async (query) => {
    const seq = ++skuSearchSeq;
    if (query.length < 2) {
      closeSkuSuggestions();
      return;
    }
    skuListbox.hidden = false;
    skuInput.setAttribute('aria-expanded', 'true');
    skuListbox.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'da-sku-loading';
    loading.textContent = 'Searching…';
    skuListbox.appendChild(loading);

    const { products } = await fetchAcoProductSearch(query);
    if (seq !== skuSearchSeq) {
      return;
    }

    skuListbox.replaceChildren();
    if (products.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'da-sku-empty';
      empty.textContent = 'No products found';
      skuListbox.appendChild(empty);
      return;
    }
    renderSkuSuggestionRows(products);
  }, 300);

  skuInput.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (lockedSelectionSku !== null && v !== lockedSelectionSku) {
      clearSkuSelectedPanel();
    }
    debouncedSkuSearch(v);
    updateAuthorButton();
  });

  skuInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSkuSuggestions();
    }
  });

  const debouncedListingSearch = debounce(async (query) => {
    const seq = ++listingSearchSeq;
    if (query.length < 2) {
      closeListingSuggestions();
      return;
    }
    listingListbox.hidden = false;
    listingInput.setAttribute('aria-expanded', 'true');
    listingListbox.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'da-sku-loading';
    loading.textContent = 'Searching…';
    listingListbox.appendChild(loading);

    const { products } = await fetchAcoProductSearch(query);
    if (seq !== listingSearchSeq) {
      return;
    }

    listingListbox.replaceChildren();
    if (products.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'da-sku-empty';
      empty.textContent = 'No products found';
      listingListbox.appendChild(empty);
      return;
    }
    renderListingSuggestionRows(products);
  }, 300);

  listingInput.addEventListener('input', (e) => {
    const v = /** @type {HTMLInputElement} */ (e.target).value.trim();
    if (confirmedListingTerm !== null && v !== confirmedListingTerm) {
      clearListingResults();
    }
    debouncedListingSearch(v);
    updateAuthorButton();
  });

  listingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeListingSuggestions();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmListingSearch();
    }
  });

  document.addEventListener('click', (e) => {
    const t = /** @type {Node} */ (e.target);
    if (!skuListbox.hidden && !skuCombo.contains(t)) {
      closeSkuSuggestions();
    }
    if (!listingListbox.hidden && !listingCombo.contains(t)) {
      closeListingSuggestions();
    }
  });

  function setSelectedCard(selectedId) {
    selectedPageTypeId = selectedId;
    grid.querySelectorAll('.da-page-type-card').forEach((btn) => {
      const isSel = btn.dataset.pageType === selectedId;
      btn.classList.toggle('is-selected', isSel);
      btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });
    pageTypeHint.hidden = true;
    styleField.hidden = false;
    pageNameInput.disabled = false;

    const isDetail = selectedId === 'product-detail';
    const isListing = selectedId === 'product-listing';

    skuField.hidden = !isDetail;
    skuField.setAttribute('aria-hidden', (!isDetail).toString());
    if (!isDetail) {
      skuInput.value = '';
      skuInput.disabled = true;
      closeSkuSuggestions();
      clearSkuSelectedPanel();
    } else {
      skuInput.disabled = false;
    }

    listingField.hidden = !isListing;
    listingField.setAttribute('aria-hidden', (!isListing).toString());
    if (!isListing) {
      listingInput.value = '';
      listingInput.disabled = true;
      closeListingSuggestions();
      clearListingResults();
    } else {
      listingInput.disabled = false;
    }

    updateAuthorButton();
  }

  PAGE_TYPE_CARDS.forEach((pt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'da-page-type-card';
    btn.dataset.pageType = pt.id;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');

    const iconWrap = document.createElement('span');
    iconWrap.className = 'da-page-type-icon';
    iconWrap.appendChild(createPlaceholderIcon());

    const label = document.createElement('span');
    label.className = 'da-page-type-label';
    label.textContent = pt.label;

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    btn.addEventListener('click', () => setSelectedCard(pt.id));

    grid.appendChild(btn);
  });

  section.appendChild(heading);
  section.appendChild(grid);
  section.appendChild(pageTypeHint);
  section.appendChild(styleField);
  main.appendChild(section);
}

/**
 * Render the dealer-admin stub shell (branded header + placeholder content).
 * @param {HTMLElement} container
 */
function renderDealerAdminStub(container) {
  container.innerHTML = '';
  container.className = 'dealer-admin-page';

  const header = document.createElement('header');
  header.className = 'da-header';

  const brand = document.createElement('div');
  brand.className = 'da-brand';

  const logoLink = document.createElement('a');
  logoLink.className = 'da-brand-link';
  logoLink.href = CAT_COM_HOME_URL;
  logoLink.target = '_blank';
  logoLink.rel = 'noopener noreferrer';
  logoLink.setAttribute('aria-label', 'Caterpillar — Cat.com (opens in new tab)');

  const logo = document.createElement('img');
  logo.className = 'da-brand-logo';
  logo.src = CATERPILLAR_LOGO_URL;
  logo.alt = '';
  logo.decoding = 'async';

  logoLink.appendChild(logo);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'da-brand-text';

  const title = document.createElement('h1');
  title.className = 'da-title';
  title.textContent = 'Caterpillar Dealer Admin';

  const subtitle = document.createElement('p');
  subtitle.className = 'da-subtitle';
  subtitle.textContent = 'Dealer administration tools.';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  brand.appendChild(logoLink);
  brand.appendChild(titleWrap);
  header.appendChild(brand);

  const main = document.createElement('main');
  main.className = 'da-main';

  renderCreateNewPageSection(main);

  container.appendChild(header);
  container.appendChild(main);
}

(async function init() {
  const { context } = await DA_SDK;
  console.log('DA SDK Context:', context);

  const container = document.createElement('div');
  container.id = 'dealer-admin-container';
  document.body.appendChild(container);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/tools/dealer-admin/dealer-admin.css';
  document.head.appendChild(link);

  renderDealerAdminStub(container);
}());
