import { expect } from '@esm-bundle/chai';
import {
  buildDealOfWeekProductPayload,
  mergeDealOfWeekAttribute,
  matchWalgreensOffers,
  normalizeWalgreensFeed,
} from '../../tools/products/walgreens-deals.js';

describe('Walgreens deals importer', () => {
  const product = {
    sku: 'sku-1',
    attributes: [
      { name: 'upc', value: '0123' },
      { name: 'brand', value: 'Acme' },
    ],
  };

  it('normalizes records and retains duplicate details', () => {
    const result = normalizeWalgreensFeed([
      { ezItemId: 'offer-1', upc: '0123', headline: 'Deal' },
      { ezItemId: 'offer-1', upc: '0123' },
    ]);
    expect(result.offers).to.have.length(1);
    expect(result.offers[0].duplicateCount).to.equal(2);
    expect(result.duplicates).to.have.length(1);
  });

  it('rejects non-array and malformed records', () => {
    expect(() => normalizeWalgreensFeed({ deals: [] })).to.throw(/JSON array/);
    expect(() => normalizeWalgreensFeed([null])).to.throw(/must be an object/);
  });

  it('matches by UPC, apiwic, WIC, then explicit mapping', () => {
    const result = matchWalgreensOffers([
      { key: 'upc', upc: '0123' },
      { key: 'api', apiwic: 'a-1' },
      { key: 'wic', wic: 'w-1' },
      { key: 'map' },
    ], [
      product,
      { sku: 'sku-2', attributes: [{ name: 'apiwic', value: 'a-1' }] },
      { sku: 'sku-3', attributes: [{ name: 'wic', value: 'w-1' }] },
    ], { map: 'sku-2' });
    expect(result.map((item) => item.status)).to.deep.equal(['matched', 'matched', 'matched', 'matched']);
    expect(result.map((item) => item.method)).to.deep.equal(['upc', 'apiwic', 'wic', 'mapping']);
    expect(matchWalgreensOffers([{ key: 'missing-map' }], [product], { 'missing-map': 'not-in-catalog' })[0].status)
      .to.equal('unmatched');
  });

  it('reports unmatched, ambiguous, expired, and duplicates', () => {
    const results = matchWalgreensOffers([
      { key: 'missing', upc: 'x' },
      { key: 'expired', endDate: '2020-01-01', upc: '0123' },
      { key: 'duplicate', duplicateCount: 2 },
    ], [product]);
    expect(results.map((item) => item.status)).to.deep.equal(['unmatched', 'expired', 'duplicate']);
    expect(matchWalgreensOffers([{ key: 'ambiguous', upc: '0123' }], [product, product])[0].status).to.equal('ambiguous');
  });

  it('replaces the deal attribute while preserving unrelated attributes and is idempotent', () => {
    const attributes = mergeDealOfWeekAttribute([
      { code: 'brand', type: 'STRING', values: ['Acme'] },
      { code: 'deal_of_the_week', type: 'BOOLEAN', values: ['false'] },
    ]);
    expect(attributes).to.deep.equal([
      { code: 'brand', type: 'STRING', values: ['Acme'] },
      { code: 'deal_of_the_week', type: 'BOOLEAN', values: ['true'] },
    ]);
    expect(mergeDealOfWeekAttribute(attributes)).to.deep.equal(attributes);
    expect(buildDealOfWeekProductPayload(product).attributes).to.have.length(3);
  });
});
