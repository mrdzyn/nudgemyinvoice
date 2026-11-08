# Project Status

> **Current operational index only.** The previous 39-KB STATUS, including historical gate wording and audit details, is preserved verbatim at [the 2026-11-08 archive](history/NMI-STATUS-snapshot-2026-11-08.md). Read the archive only to resolve a specific historical question. Repository source and verified runtime evidence outrank stale historical status language.

## Project

- **Name:** NudgeMyInvoice
- **Mode:** Public MIT-licensed PayPal Sandbox hackathon MVP, not a production payment service.
- **Current phase:** **NMI-OPS-TEMPLATE-RECON-01** — documentation-only operational-state reconciliation with AI Native Project Template M5/M6/M7; PR #67 chat-to-composer integration is a separate parallel Draft PR under independent audit.
- **Status:** An **existing combined Render demo is LIVE** on the earlier source `766dde37bd5857692a2f238e7c3ac72d3b9ee105` (prior read-only review and owner confirmation). Current `main` is newer and **not verified deployed**. No new release, provider action or public judge-access approval is implied.
- **Primary branch:** `main@4aea541d358e419f835e1f59811216003ba56305` (PR #66 owner squash merge; verified source HEAD at branch creation).
- **Working branch:** `docs/nmi-ops-template-reconcile` (this documentation-only proposal).
- **Active task:** `tasks/NMI-OPS-TEMPLATE-RECON-01.md`.
- **Active handoff:** `NMI-OPS-RECON-01`.

## Current code, hosting and review

| Surface | Current source/evidence | Operational classification |
| --- | --- | --- |
| GitHub `main` | `4aea541d358e419f835e1f59811216003ba56305` after owner-merged PRs #65 and #66 | **MERGED-NOT-LIVE** until a new authorized exact-commit deploy is verified |
| Render combined demo | deployed `766dde37bd5857692a2f238e7c3ac72d3b9ee105`; service tracks `main`, Auto Deploy OFF (previous read-only verification: PR #66 review `5816000510`) | **LIVE-EXISTING**; do not ask to provision initial hosting again |
| Chat-to-composer | Draft integration [PR #67](https://github.com/mrdzyn/nudgemyinvoice/pull/67), `478b782a5dec5bc86c7fb2be4c58aded9f1df847`; full manual CI PASS **agent-reported**; independent audit requested `6716033354` | **DRAFT**; independent audit and owner merge decision pending |
| Original chat PR | [PR #63](https://github.com/mrdzyn/nudgemyinvoice/pull/63) at `bd6c6983c6d8a5963bf8cf41bb93c4734249949b` | Unmerged, untouched; preserve independently |
| Protected candidates | combined `766dde37...`; OpenAI-only `82996c4...`; rollback `abfbbfc...` | Pinned; no movement under this task |

## Existing-hosting acceptance vs future release

- **Initial hosting exists.** The owner confirms hosting cost/teardown and hosting log/privacy acceptance were addressed for the already-Live service. Do **not** treat old G1/G5 initial-hosting paragraphs as proof that provisioning never happened, or restart completed go-live steps. Those paragraphs remain readable in the historical archive and their original decision packets.
- **Evidence precision:** this reconciliation has not independently re-inspected the Render workspace, completed the current cost/retention compliance ledger, or proved every old G1/G5 sub-item formally closed. Mark the owner's existing-service acceptance as **OWNER-ATTESTED**, not a new technical PASS; preserve ongoing cost, retention, privacy, monitoring and security duties. Check new risk only when relevant.
- **New release remains separate.** The latest source on `main` is not automatically Live. A new release needs the **current candidate's** NMI `docs/TESTING.md` + `docs/RELEASE.md` policy, separate owner deploy approval and Live QA. The old exact-SHA manual release exception does not transfer to a different commit.
- **AG Studio:** valid-license local positive control was verified (keyed browser 15/15). The older Live process previously returned `studio_licence_not_configured` (404); **effective license and chart recovery on a new Live deploy are PENDING**, not grounds to deny the existing service is Live.
- **Provider boundary:** PayPal Sandbox DRAFT only; do not send, refund, mark paid, charge, auto-remind, activate OpenAI/PayPal credentials, or share judge access without the separately approved action and security proof. Synthetic/local tests are not Live provider acceptance.
- **Development policy:** manual exact-HEAD CI, security checks and independent review per NMI `docs/TESTING.md`; hosted CI may be **NOT RUN** under the existing development policy. Release gates are stronger and unchanged.

## Canonical operational references

- Task and master-template KEEP/MERGE/ADD/RETIRE matrix: `tasks/NMI-OPS-TEMPLATE-RECON-01.md`, `docs/OPERATING-RECONCILIATION.md`.
- Agent orchestration: `docs/AGENT-ORCHESTRATION.md` (selective M7 adoption; master M6 runner **not yet installed**).
- Product and release authority: `AGENTS.md`, `docs/TESTING.md`, `docs/RELEASE.md`, `docs/SECURITY.md`.
- Evidence and former decisions: `docs/HANDOFFS.md`, [historical STATUS](history/NMI-STATUS-snapshot-2026-11-08.md), PR #66 review `5816000510`, PR #67 comment `6716033354`.
- There is **no** implicit authorization to merge, deploy, move release branches, alter provider credentials or adjust CI/rulesets.

## Next action

On this Draft ops-reconciliation PR, run focused status/handoff/provenance checks and request independent exact-HEAD audit; await separate owner merge approval. PR #67 remains a **separate** independent audit and owner decision.
