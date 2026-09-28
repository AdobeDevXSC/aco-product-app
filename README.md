# Author Kit
For projects that want a few more batteries. Built by the team who brought you da.live and adobe.com.

## Getting started

### 1. Github
1. Use this template to make a new repo.
1. Install [AEM Code Sync](https://da.live/bot).

### 2. DA content
1. Browse to https://da.live/start.
2. Follow the steps.

### 3. Local development
1. Clone your new repo to your computer.
1. Install the AEM CLI using your terminal: `sudo npm install -g @adobe/aem-cli`
1. Start the AEM CLI: `aem up`.
1. Open the `{repo}` folder in your favorite code editor and buil something.
1. **Recommended:** Install common npm packages like linting and testing: `npm i`.

## Features

### Localization & globalization
* Language only support - Ex: en, de, hi, ja
* Region only support - Ex: en-us, en-ca, de-de, de-ch
* Hybrid support - Ex: en, en-us, de, de-ch, de-at
* Fragment-based localized 404s
* Localized Header & Footer
* Do not translate support (#_dnt)

### Flexible section authoring
* Optional containers to constrain content
* Grids: 1-6
* Color scheme: light, dark
* Gap: xs, s, m, l, xl, xxl
* Spacing: xs, s, m, l, xl, xxl
* Background: token / image / color / gradient

### Base content
* Universal buttons w/ extensive styles
* Images w/ retina breakpoint
* Color scheme support: light, dark
* Modern favicon support
* New window support
* Deep link support
* Modal support

### Header and footer content
* Brand - First link in header
* Main Menu - First list in header
* Actions - Last section of header
* Menu & mega menu support
* Disable header/footer via meta props

### Scheduled content
* Schedule content using spreadsheets

### Sidekick
* Extensible plumbing for plugins
* Schedule simulator

### Performance
* Extensible LCP detection

### Developer tools
* Environment detection
* Extensible logging (console, coralogix, splunk, etc.)
* Buildless reactive framework support (Lit)
* Hash utils patterns (#_blank, #_dnt, etc)
* Modern CSS scoping & nesting
* AEM Operational Telemetry

### Operations
* Cloudflare Worker reference implementation

### Walgreens Deals of the Week importer

The product tool's **Load Walgreens Deals of the Week** action reads the public feed
at `https://www.walgreens.com/bin/search/articles/dow?categoryName=Deals+of+the+Week`.
It previews normalized offers and only updates products already present on the current
product page. Matching uses UPC/GTIN/barcode, APIWIC, WIC, then an optional mapping
JSON object such as `{"offer-key":"existing-sku"}`; reliable feed SKUs are used last.
Offer headlines are not identity matches. The action requires the same ACO ingestion
permission and bearer token used by product PATCH operations and writes one
`deal_of_the_week` `BOOLEAN` attribute with value `true`, preserving other attributes.

Malformed feeds, duplicates, expired offers, unmatched offers, and ambiguous matches
are shown in the preview and are not written. Reruns replace the existing attribute
instead of duplicating it. The current tool does not maintain a trusted Walgreens
source marker, so it intentionally does not clear stale attributes for products absent
from a later feed; remove or change those attributes through the normal product editor.

## Patterns
### Page
A page is what holds your content. It can be styled using a metadata property called `template` which will load styles that apply to the entire page.

### Section
A section is a sub-section of your page. It can be styled using a `section-metadata` block. A section will control the layout of blocks.

### Block
Blocks are children of sections. A block adds visual context to parts of a page.

### Auto Block
An auto block is a block generated from a pre-defined piece of content. Often times from a link that matches a particular pattern. Link-based auto blocks can be helpful when additional nesting of content is required.

### Default content
Default content is content that lives outside a block.

## Design System

### Spacing & Gap
XS, S, M, L, XL, XXL

### Emphasis
default, quiet, strong, negative

### Buttons
accent, primary, secondary, negative

(w/ outline variations)

### Columns
1 - 12

### Grid
1 - 6

### Color tokens
blue, gray, green, magenta, organge, red, purple, yellow

(w/ 100-900 variations)

### Color Schemes
light, dark
