# Security and Privacy Baseline

## Purpose

This document defines the minimum security and privacy expectations for projects created from this template. Replace and extend it based on the product's threat model and data classification.

## Core rules

- Never commit secrets, credentials, tokens, private keys, production datasets, or sensitive local configuration.
- Use least privilege for users, services, agents, CI jobs, and deployment credentials.
- Treat all external input as untrusted.
- Preserve authorization checks at every trust boundary.
- Prefer secure defaults and explicit failure over silent fallback that weakens protection.
- Log security-relevant events without leaking secrets or unnecessary personal data.
- Do not disable security controls merely to unblock development.

## Data classification

Document the categories the product handles:

| Data type | Collected? | Sensitivity | Storage | Retention |
|---|---:|---|---|---|
| Anonymous telemetry | TBD | Low/Medium | TBD | TBD |
| Account identifiers | TBD | Medium | TBD | TBD |
| Personal data | TBD | High | TBD | TBD |
| Payment data | TBD | High | TBD | TBD |
| Secrets/credentials | TBD | Critical | Never in source | Minimal |

## Secrets management

- Local secrets belong in ignored environment/config files.
- CI/CD secrets belong in approved secret stores.
- Production secrets must not be copied into documentation, tickets, prompts, or logs.
- Provide sanitized `.env.example` or equivalent when configuration guidance is needed.
- Rotate exposed credentials immediately and treat repository history as compromised if a secret was committed.
- Android release/upload keystores, private keys, and signing passwords are critical secrets. Follow `release/android-signing.md`.
- Base64-encoded keystore content is still secret key material; encoding does not make it safe to commit or log.
- Do not reuse one Android release/upload private key or one password set across unrelated apps by default; standardize secret names, not secret values.
- Never configure a production Android release to fall back to debug signing when release secrets are absent.

## Authentication and authorization

Document:
- identity provider or authentication mechanism;
- session/token model;
- authorization roles/permissions;
- tenant isolation rules;
- privileged/admin operations;
- recovery flows.

Security-sensitive authorization must be enforced server-side or at the authoritative trust boundary, not only in the UI.

## Dependency and supply-chain security

- Pin/lock dependencies using the stack's normal mechanism.
- Review new dependencies for necessity and maintenance risk.
- Run dependency/security scanning appropriate to the stack.
- Do not accept generated packages, binaries, or build artifacts from unknown sources without verification.

## AI-agent boundaries

AI agents may:
- edit code and docs inside assigned scope;
- run approved tests and analysis;
- prepare pull requests.

### Absolute prohibitions

AI agents must never:
- reveal, print, exfiltrate, or intentionally expose secrets or credentials;
- falsify validation results or claim an unrun check passed;
- bypass, disable, or conceal a required review/security/quality gate;
- silently weaken authentication, authorization, tenant isolation, encryption, or other security boundaries.

### Privileged actions requiring explicit human authorization

AI agents may perform the following only when the current task includes explicit human authorization and an approved mechanism:
- rotate or change production credentials without exposing their values;
- alter production data;
- execute a production deployment or release;
- merge a reviewed change after the human approval gate has been satisfied.

Authorization for a privileged action does not authorize bypassing required validation, review, auditability, or security controls.

## Logging and observability

Logs should:
- support debugging and security investigation;
- avoid secrets;
- minimize personal/sensitive content;
- include correlation or request identifiers where useful;
- have documented retention for production systems.

## Vulnerability handling

For a suspected vulnerability:
1. avoid public disclosure until impact is understood;
2. preserve evidence and relevant logs;
3. identify affected versions/environments;
4. contain exposure;
5. fix through reviewed changes;
6. rotate compromised credentials where applicable;
7. document durable lessons in project memory when useful.

## Release security gate

Before production release, confirm:
- required security tests/checks passed;
- no unresolved critical/high-severity issue blocks the release;
- configuration and secrets are supplied through approved mechanisms;
- migration and rollback implications are understood;
- security/privacy-impacting changes received human review.

## NudgeMyInvoice sandbox payment / AI threat model

### Data
Synthetic payer contacts, invoice line items, amounts, due dates and PayPal sandbox IDs may be stored for demo use. Never accept or store card numbers, real customer financial records, live account credentials, or production PayPal transactions. Minimize user input sent to Anthropic; redact emails/PII when possible, document remaining processing and retention, and include a demo-data reset procedure before judging.

### Environment separation
`PAYPAL_ENV=sandbox` and `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` are hard requirements. Validate at application startup and for every PayPal client; reject live hosts or missing explicit sandbox configuration. Keep all credentials server-side in ignored `.env` / Render environment variables. Public GitHub repository means every committed value is public.

### Authorization and approvals
Backend enforces human approval for outbound notification or financial state changes, including sending invoice/reminder, cancellation, refund, marking paid, and order capture. Approval is resource/action/payload-specific, human-authenticated, expires, and is consumed once atomically; log timestamp, approver, object ID, consent summary, request ID and result. UI control is necessary but NOT sufficient. No model/tool/cron/webhook bypass. Authentication is required for all personal/business invoice data in hosted demo; use a strictly scoped demo account, safe session cookies and CSRF protection.

### Webhook trust
Use raw unmodified body; verify PayPal headers, registered WEBHOOK ID and signature (or PayPal verification API for real sandbox events) **before** DB mutation; validate timestamp/IDs, durable unique event key, and handle duplicates/out-of-order events. Simulated webhook events require a separate explicit test harness and must not mark real invoices paid. Never skip verification to make the demo pass.

### Financial invariants
One currency per invoice; explicit supported ISO code and scale; amounts handled using decimal strings or integer minor units, never IEEE floating point; payables and totals displayed per currency. Reject unknown currencies and prohibited negative/invalid invoice amounts. No FX rates without an authoritative quote and explicit human consent; no invented exchange values.

### Agent/tool permissions
Read-only tools and draft creation are allowlisted. Every privileged PayPal call must cross the same backend approval service independent of whether it originates from UI, Anthropic tool use, PayPal Agent Toolkit or an MCP server. Treat model output and external tool descriptions as untrusted. No secret exposure in tool returns.

### Tests / non-goals
Require negative tests for forged signature, replay, duplicate delivery, privilege bypass, changed approved payload, stale approval, double click, wrong target invoice, live-host configuration, multiple currencies incorrectly summed, and refunds never enabled in MVP.
