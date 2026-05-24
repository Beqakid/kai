import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyBusinessModel,
  createCreativeAssetDraftPrompt,
  generateWebsiteDraftFromAnswers,
} from '../packages/kai-website-builder/dist/index.js';

describe('website builder workflow', () => {
  it('routes product, service, and hybrid businesses', () => {
    assert.equal(classifyBusinessModel('online shop selling produce').businessModel, 'product_seller');
    assert.equal(classifyBusinessModel('cleaning service with bookings').businessModel, 'service_provider');
    assert.equal(classifyBusinessModel('restaurant with catering services and products').businessModel, 'hybrid');
  });

  it('generates a structured product seller website draft', () => {
    const draft = generateWebsiteDraftFromAnswers({
      businessName: 'Bula Fresh',
      businessType: 'farm produce vendor',
      products: ['Vegetables', 'Weekly produce boxes'],
      location: 'Suva',
      contactInfo: 'hello@bulafresh.example',
      preferredCustomerAction: 'Order Now',
    });

    assert.equal(draft.businessName, 'Bula Fresh');
    assert.equal(draft.businessModel, 'product_seller');
    assert.deepEqual(draft.services, []);
    assert.match(draft.seo.title, /Bula Fresh/);
    assert.equal(draft.creativeAssetPrompts[0].approvalRequired, true);
    assert.equal(draft.creativeAssetPrompts[0].storage.saved, false);
    assert.match(draft.creativeAssetPrompts[0].prompt, /an online store/);
  });

  it('keeps creative assets as approval-gated draft prompts only', () => {
    const asset = createCreativeAssetDraftPrompt({
      app: 'viliniu',
      businessName: 'Island Repairs',
      businessModel: 'service_provider',
      assetType: 'service_banner',
      subject: 'appliance repair',
      brandColors: ['teal', 'white'],
    });

    assert.equal(asset.phaseBehavior, 'draft_only');
    assert.equal(asset.storage.provider, 'future_r2');
    assert.match(asset.prompt, /approval|review/i);
  });
});
