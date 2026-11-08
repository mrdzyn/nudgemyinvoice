# NudgeMyInvoice — operational-state and template reconciliation

**Status:** Proposed on Draft documentation branch; not a release sign-off.
**NMI baseline:** `main@4aea541d358e419f835e1f59811216003ba56305`.
**Template inspected:** `mrdzyn/ai-native-project-template@c803a7acd30f65c92dc2e1b8bb396bde3d623666` (M5 local-first, M6 session continuity, M7 agent orchestration).

## Current facts and how to interpret them

| Concern | Confirmed / attributed reality | Correct action |
| --- | --- | --- |
| Existing hosted service | Combined Render demo **already Live** on older deployed source `766dde37...`; tracks `main`, Auto Deploy OFF. Independent PR #66 review `5816000510` reports read-only Render observation; owner confirms existing build Live. | **Do not repeat initial provisioning as an unsatisfied prerequisite** or claim the latest main is Live. |
| New repository source | `main@4aea541d...` includes owner-merged PRs #65/#66. The newer dashboard is **not verified Live**. | Separate, explicitly authorized exact-candidate deployment and runtime verification. |
| Chat-to-composer | Integration PR #67, exact `478b782a5dec5bc86c7fb2be4c58aded9f1df847`, **Draft** with manual CI agent-reported PASS; independent audit requested in comment `6716033354`. Original #63 unchanged. | Independent audit and owner decision on #67, not automatic merge. |
| Hosting costs and teardown (historical G1) | Owner states these were addressed for the **existing** hosted service. Historical `docs/STATUS.md` snapshot still says G1 OPEN, reflecting an older go-live gate. There is no newly verified evidence in this task that formally closes every specific G1 obligation. | Do not pretend the service is unprovisioned or restart checkout. Keep cost monitoring, retention and deletion approval as applicable; seek the current acceptance record only when a change requires it. |
| Hosting log privacy (historical G5) | Owner states accepted for the existing Live service; original G5 OPEN statement is historical/conflicting, not proof initial hosting is incomplete. Prior PR #66 read-only review confirmed deployed baseline, not every log configuration detail. | Do not relitigate unchanged initial-hosting policy; apply privacy regression checks if changing logging, routing or data exposure. Do **not** assert G5 technically reverified in this PR. |
| Studio charts | Local valid-license positive control VERIFIED (keyed browser QA 15/15); old Live process returned 404 `studio_licence_not_configured`. | On next **authorized** release, verify effective runtime license and chart browser flow; no key exposure. |
| Providers and judge access | No newly authorized OpenAI/PayPal calls or external judge-access sharing. Real end-to-end provider acceptance not shown by mock/synthetic CI. | Preserve sandbox/DRAFT-only behavior and separate provider, public-link and deployment permissions. |

**State vocabulary:** `LIVE-EXISTING` means older deployed build is operating; `MERGED-NOT-LIVE` means code on main without a verified release; `DRAFT` means no owner merge; `PENDING-NEW-RELEASE-QA` is not an unfulfilled historical setup task; `OWNER-ATTESTED` is not independently verified technical evidence.

## Brownfield adoption matrix (master template vs NMI)

| Concern | Existing NMI authority | Template source | Decision | Canonical after proposed merge |
| --- | --- | --- | --- | --- |
| Repository startup/owner approval | `AGENTS.md` | `AGENTS.md` | **KEEP + MERGE** M7 pointer; preserve NMI payment controls | NMI `AGENTS.md` |
| Current operational truth | 39-KB `docs/STATUS.md` interleaving history/current state | compact `docs/STATUS.md` | **RETIRE** historical text to exact archive; **MERGE** concise current index | `docs/STATUS.md`, archive for provenance |
| Handoff mechanism | `docs/HANDOFFS.md` | master handoff rules | **KEEP**; append one new handoff only | NMI `docs/HANDOFFS.md` |
| M7 single-agent and limited context | Not present as canonical guide | `docs/AGENT-ORCHESTRATION.md` | **ADD** tailored lean guide | NMI `docs/AGENT-ORCHESTRATION.md` |
| M5 development local CI | NMI `docs/TESTING.md`, `pnpm validate`, disposable PG16 | master `docs/MANUAL-CI.md`, local-first runner | **KEEP** NMI's working exact-HEAD manual CI; do not copy incompatible Python runners | NMI `docs/TESTING.md` |
| Release-candidate CI | NMI `docs/TESTING.md` + `docs/RELEASE.md`, narrow old-SHA exception | master default local-first release | **KEEP** stronger NMI release policy until separate explicit owner policy decision; no broad bypass | NMI release docs |
| M6 resume script | No `scripts/session_context.py` / `docs/SESSION-CONTINUITY.md` in NMI | M6 script and reference | **DEFER** as a separate bounded, tested adoption; this PR's compact STATUS improves manual startup immediately | NMI startup rules; future M6 task |
| Release-scope preservation | Existing product contract, release tasks and approval boundaries | master `docs/RELEASE-SCOPE-MANIFEST.md` | **KEEP** existing scope, **DEFER** a project-specific manifest to separate review | NMI release contract |
| Hosting / privacy operations | Existing Render service, G1/G5 historical packets and accepted operation | generic setup/release docs | **KEEP** existing service and controls; reconcile stale gate interpretations, not security requirements | NMI `docs/RELEASE.md`, live evidence + current STATUS |

Template changes are **selective**. NMI project-specific policy overrides generic master defaults unless the owner separately approves a policy migration. No silent downgrading of tests, security, privacy, privacy logging, payment controls or feature scope.

## Agent source-of-truth rules

1. Confirm repository/branch/HEAD from GitHub. Read `AGENTS.md`, **compact** `docs/STATUS.md`, `config/project-profile.json`, active task, one active handoff, then relevant changed files.
2. Distinguish **GitHub merged** from **Render deployed**. Confirm runtime from an authorized read-only service inspection when live state materially matters; otherwise label previously observed/owner-attested.
3. Interpret old packet G1/G5 setup tasks in the context of the already-Live deployment; do not substitute historical OPEN wording for a current operational check. Preserve continuing cost, privacy, retention and security controls.
4. For new deploys, check changed-risk release gates and the NMI exact-SHA release policy; never infer authorization from an existing Live baseline, an old candidate exception, or an independent PR audit.
5. The active STATUS is an index, not an archive. Historical full STATUS preserved verbatim at `docs/history/NMI-STATUS-snapshot-2026-11-08.md`. Do not reload it routinely.

## Explicitly outside this reconciliation

No ruleset, hosted-CI, production runtime, security-policy, credential, PayPal/OpenAI authorization, billing, deployment, release, public judge URL, PR #63/#67 or protected-branch change. This is an operational truth and context-efficiency proposal, not a new product scope decision.
