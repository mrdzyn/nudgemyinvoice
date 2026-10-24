# RevenueCat Integration Guide

**Capability selector:** `revenuecat`

Use this guide when RevenueCat is selected to manage or synchronize purchases/subscriptions and entitlements.

Official references:
- Documentation: https://www.revenuecat.com/docs
- SDK quickstart: https://www.revenuecat.com/docs/getting-started/quickstart
- Products: https://www.revenuecat.com/docs/projects/configuring-products
- Entitlements: https://www.revenuecat.com/docs/getting-started/entitlements
- Offerings: https://www.revenuecat.com/docs/offerings/overview
- Customer identity: https://www.revenuecat.com/docs/customers/identifying-customers
- Restore behavior: https://www.revenuecat.com/docs/projects/restore-behavior
- API keys: https://www.revenuecat.com/docs/projects/authentication
- Webhooks: https://www.revenuecat.com/docs/integrations/webhooks
- RevenueCat Web: https://www.revenuecat.com/docs/web/overview

## Architecture contract

Model access around **entitlements**, not hard-coded store product IDs throughout product logic.

```text
Store/Web product
      ↓
RevenueCat product
      ↓
Entitlement
      ↓
Application feature gate
```

Offerings may control which products/packages appear on paywalls without redefining entitlement semantics.

## Identity decision

Before implementation, explicitly choose anonymous RevenueCat App User IDs or project-managed custom App User IDs.

If using custom IDs:
- use stable, unique, non-guessable identifiers;
- do not use email addresses as App User IDs;
- do not hard-code a shared ID;
- define login/logout/account-switch behavior;
- define cross-platform identity behavior.

Document and test RevenueCat restore/transfer behavior before launch. Restore behavior can change which user receives an existing purchase.

## Key handling

- RevenueCat public/SDK API keys are intended for SDK configuration.
- RevenueCat **secret** API keys are server-side secrets and must never be embedded in client applications.
- Store secret/server credentials remain subject to the platform's own controls.

## Purchase and entitlement gate

Test initial purchase, cancellation, renewal, billing issues/grace behavior where applicable, expiration, refund/revocation, upgrade/downgrade, restore purchases, reinstall/device change, account switch, sandbox vs production, and offline/degraded entitlement behavior.

Do not unlock paid features from a purchase-button callback alone. Use authoritative entitlement/customer state.

## Webhooks/backend

When a backend mirrors RevenueCat state:
- verify the configured authorization header when used;
- **prefer RevenueCat HMAC webhook signing when enabled/available** for stronger request verification;
- verify `X-RevenueCat-Webhook-Signature` over the **raw request body bytes before JSON parsing**;
- compute HMAC-SHA256 over the timestamp plus raw body exactly as documented by RevenueCat;
- compare signatures using a constant-time comparison;
- apply a reasonable timestamp tolerance/replay check when HMAC signing is used;
- store the RevenueCat signing secret only in approved server-side secret management;
- make processing idempotent using the RevenueCat event `id`, which is reused across retries;
- acknowledge quickly and process durable work asynchronously when appropriate.

RevenueCat currently recomputes the webhook signature on each retry, while the event `id` remains stable. Treat signature verification and idempotency as separate controls.

## Store compliance

RevenueCat does not replace Apple/Google/Microsoft/Huawei store requirements. Continue to use the applicable `store/` profile for subscription disclosures, restore behavior, legal links, privacy/data declarations, ratings, and release approval.

## Done criteria

- [ ] Products/entitlements/offerings documented.
- [ ] Identity and restore behavior documented.
- [ ] Public vs secret key boundary verified.
- [ ] Sandbox purchase/restore tested.
- [ ] Production product IDs mapped correctly.
- [ ] Entitlement gating tested.
- [ ] Webhooks tested if used, including HMAC/raw-body verification when enabled and duplicate-event idempotency.
- [ ] Store submission metadata matches actual subscription behavior.
