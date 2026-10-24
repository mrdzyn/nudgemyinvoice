# Freemius Integration Guide

**Capability selector:** `freemius`

Use this guide for Freemius monetization/licensing in SaaS products, standalone/desktop apps, and WordPress products.

Official references:
- Developer documentation: https://freemius.com/help/
- Checkout: https://freemius.com/help/documentation/checkout/
- Checkout integration: https://freemius.com/help/documentation/checkout/integration/
- SaaS integration: https://freemius.com/help/documentation/saas/saas-integration/
- SaaS SDKs & starter kits: https://freemius.com/help/documentation/saas-sdk/
- JavaScript/TypeScript backend SDK: https://freemius.com/help/documentation/saas-sdk/js-sdk/
- App integration: https://freemius.com/help/documentation/saas/app-integration/
- WordPress SDK integration: https://freemius.com/help/documentation/wordpress/integration-with-sdk/

## Shared architecture rules

Before implementation define product/plan IDs, entitlement/license model, subscription vs lifetime behavior, sandbox strategy, checkout path, local entitlement/cache model, webhook lifecycle, customer portal flow, and cancellation/expiration/refund behavior.

Do not make frontend callback success the authoritative entitlement source.

## SaaS

Recommended pattern:
- create checkout/portal operations on the backend;
- validate purchases server-side;
- store only the local entitlement fields needed by the application;
- synchronize lifecycle changes through webhook processing;
- keep feature gates driven by authoritative local/Freemius state.

The Freemius JS/TS SDK is intended for **backend use** because it requires sensitive credentials. Do not bundle backend credentials into browser/mobile code.

## Standalone / desktop / browser-extension apps

Freemius App products can use hosted/embedded checkout and license activation.

Define license activation/deactivation, device/install limits, offline behavior, activation recovery, subscription expiration, sandbox flow, and how the app validates entitlement without exposing secret credentials.

For web-based apps, Freemius Checkout/Buy Button may be used client-side as documented. Secret API/SDK credentials remain server-side.

For iOS/Android apps distributed through platform stores, do not assume an external Freemius checkout is permitted inside the app. Verify the current Apple/Google commerce rules and the product's approved distribution model before implementing payment UI.

## WordPress SDK

For WordPress products:
- integrate the official Freemius WordPress SDK according to the generated integration instructions;
- review opt-in/telemetry and data flows;
- test licensing, upgrade/pricing, account, update, and premium/free flows;
- preserve WordPress security practices;
- reconcile monetization behavior with WordPress.org Plugin Directory policy when distributing a free version there.

See `store/wordpress-org.md`. WordPress.org forbids prohibited trialware and requires appropriate consent for tracking.

## Checkout lifecycle

Test successful purchase, declined/cancelled purchase, trial/intro offer if used, renewal, failed renewal/dunning, upgrade/downgrade, cancellation, refund, lifetime/one-time purchase, customer portal/payment-method update, and sandbox-to-production configuration.

## Webhooks

If webhooks drive entitlement state:
- validate/authenticate according to current Freemius documentation;
- make handlers idempotent;
- separate receipt from durable processing where appropriate;
- test duplicate/replayed and out-of-order lifecycle events.

## Done criteria

- [ ] Product/plans and entitlement mapping documented.
- [ ] Credential/client-server boundary verified.
- [ ] Sandbox checkout tested.
- [ ] Lifecycle events tested.
- [ ] Customer portal/account path tested.
- [ ] WordPress.org compatibility reviewed when applicable.
- [ ] Privacy/telemetry disclosures match behavior.
