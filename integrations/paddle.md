# Paddle Billing Integration Guide

**Capability selector:** `paddle`

**Status:** Future/reference capability pack. Do not add Paddle dependencies, credentials, or production configuration until a project explicitly selects Paddle.

Official references:
- Setup checklist: https://developer.paddle.com/build/set-up-checklist
- Checkout: https://developer.paddle.com/concepts/sell/self-serve-checkout
- API authentication: https://developer.paddle.com/api-reference/about/authentication
- Client-side tokens: https://developer.paddle.com/paddle-js/about/client-side-tokens
- Subscriptions: https://developer.paddle.com/api-reference/subscriptions/
- Webhooks: https://developer.paddle.com/webhooks/
- Webhook signature verification: https://developer.paddle.com/webhooks/about/signature-verification/
- Provisioning/subscription state: https://developer.paddle.com/build/subscriptions/provision-access-webhooks/

## Adoption decision

Before selecting Paddle, document why it is preferred, web/SaaS/desktop/mobile commerce constraints, merchant-of-record/tax requirements, platform-store restrictions on external checkout, migration requirements, and whether RevenueCat or another entitlement layer is also involved.

Do not assume a web billing integration is permitted inside every mobile-app flow; verify current platform-store rules.

## Security boundary

Paddle distinguishes client-side tokens for Paddle.js/frontend use from API keys for backend use.

Never expose Paddle API keys or webhook secrets in frontend/mobile code. Apply least-privilege permissions and expiry/rotation to server API keys.

## Integration shape

```text
pricing UI
   ↓
Paddle.js / Checkout
   ↓
completed transaction
   ↓
Paddle subscription
   ↓
verified webhook
   ↓
local entitlement/provisioning state
```

Use Paddle's supported customer-management flows where appropriate.

## Webhooks

Production webhook handlers must:
- verify the `Paddle-Signature` header against the correct endpoint secret;
- preserve the raw request body for signature verification;
- reject invalid signatures;
- make processing idempotent using event identifiers;
- acknowledge quickly and perform durable work safely;
- handle signup, cancellation, pause/resume, payment updates, and upgrade/downgrade;
- test with Paddle sandbox/webhook simulation tools.

## Sandbox / production separation

Keep credentials/tokens, webhook secrets, products/prices, test customers, and environment configuration separate between sandbox and production.

Complete Paddle live-account verification early enough that it does not become a launch blocker.

## Done criteria when activated

- [ ] Paddle adoption decision approved.
- [ ] Sandbox integration complete.
- [ ] Client token vs API-key boundary verified.
- [ ] Webhook signatures verified.
- [ ] Provisioning is idempotent.
- [ ] Subscription lifecycle tested.
- [ ] Customer management tested.
- [ ] Production credentials stored in approved secret management.
- [ ] Store/platform external-payment rules reviewed where applicable.
