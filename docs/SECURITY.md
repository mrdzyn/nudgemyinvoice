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
