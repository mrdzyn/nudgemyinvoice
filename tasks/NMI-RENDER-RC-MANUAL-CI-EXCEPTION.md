# NMI-RENDER-RC-MANUAL-01 — One-time manual release validation exception

**State:** DRAFT PROPOSAL; NOT OPERATIVE until independently reviewed, owner-approved, and merged. No deployment authorization.
**Owner direction (2026-11-07):** "switch it" — replace the blocked GitHub-hosted release CI path with independently verified manual release validation for this exact candidate. This authorizes preparing the policy amendment, NOT merging it or provisioning Render.
**Repository base:** `main@abfbbfc3153cb3b4238ebf201daca830fed2e8f9` (PR #54 completed).
**Candidate:** `abfbbfc3153cb3b4238ebf201daca830fed2e8f9` (40-character exact SHA), protected `release/nmi-render-judges-2026` at the same SHA.
**Period / environment:** NudgeMyInvoice synthetic-only PayPal Sandbox judges demonstration in the single previously approved Mrdzyn Render Hobby deployment through 2026-12-15. One Starter web service and one PostgreSQL 16 Basic 256 MB instance, 1 GB storage, autoscaling OFF, auto-deploy OFF. Owner's $25 eligible-credit ceiling and D4-X scope stay unchanged.

## Why this exception exists

- GitHub-hosted Actions is reported blocked externally by account billing/quota until December. **Do not attribute a true test failure to this incident.** Before relying on the exception, retain trustworthy external-block evidence (GitHub annotation, billing status, or owner-attested account state) without secrets/payment details.
- Render supports a manual pinned-commit deployment; GitHub Actions is a governance validation layer, not a technical prerequisite to building on Render.
- The 2026-11-07 default policy in `docs/TESTING.md`, `docs/RELEASE.md`, and P4 §2/§14 otherwise requires successful GitHub-hosted Project Baseline CI and Stack CI. This proposal adds an **explicit one-time alternative** after independent manual evidence review and owner acceptance, not an automatic CI waiver.

## Bounded change contract

**Permitted in this PR:** this task; `docs/TESTING.md`; `docs/RELEASE.md`; `docs/NMI-RENDER-P4-RELEASE-READINESS.md`; `docs/STATUS.md`; append-only `docs/HANDOFFS.md`. Document the one-time exception, acceptance checks, independent audit and approval sequence.

**Forbidden:** app code, schema/journal/migrations, `pnpm-lock.yaml`, workflows, testing scripts, security mechanisms, branch force-push or deletion, real or hosted database use, Render create/deploy/billing, secret collection, public URL, PayPal/OpenAI calls, provider enabling, license publication, Devpost publication, a claim that hosted CI ran, merging this PR, or closing G1/G4/G5/G6/G7 by declaration.

**UI design gate:** Not applicable — release-governance documentation only. **Test objective:** prove that every affected release document names the same *single-candidate* manual alternative, preserves technical equivalents and all non-CI gates, and cannot be misread as blanket release approval.

## One-time substitution — necessary conditions (all required)

1. **Binding decision:** independent audit PASS on this policy PR at its exact HEAD; separately authorized owner squash merge verified on `main`. After that, independently review the complete manual release evidence and obtain the owner's explicit, separate acceptance of the **exact-candidate** manual-CI exception, its host-platform differences and any residual risk. The message "switch it" does not by itself mark the manual validation PASS or authorize paid resources.
2. **SHA/ref immutability:** source checker `pnpm --filter @nmi/api release-preflight source --expect abfbbfc3153cb3b4238ebf201daca830fed2e8f9` returns `RESULT: PASS` on a clean detached checkout, with current remote `main` ancestry and release branch tip equal to the expected SHA. Verify branch ruleset blocks deletion/non-fast-forward. If SHA, lockfile, or protected branch tip changes, exception expires: STOP and obtain a fresh review/authorization. The policy-document merge may advance `main` without altering the candidate ref.
3. **Environment and provenance:** in a trusted clean checkout of the exact candidate SHA, record UTC time, host and architecture, OS, Node **22**, pnpm **10.28.0**, Python, PostgreSQL **16** version, immutable source SHA, clean tree, no tracked `.env*`, and a disposable isolated PostgreSQL target. Do not accept results from a different checkout or HEAD. Do not paste secrets, actual DB URLs, private logs or license values.
4. **Project Baseline CI equivalent:** `python3 scripts/validate_project_profile.py --repository mrdzyn/nudgemyinvoice` PASS; `git ls-files` local `.env*` guard PASS. Keep report names and outcomes explicit. Master-template-only checks remain inapplicable to this project.
5. **Stack CI equivalent:** `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm format:check`; `pnpm typecheck`; `pnpm test`; disposable PG16 `TEST_DATABASE_URL=<private disposable nmi_test URL> pnpm test:db`; `pnpm build:web:licensed`; `pnpm check:bundle:licensed`; `pnpm build`; `pnpm check:bundle`; `pnpm db:generate` followed by a clean migration directory diff; `pnpm audit --prod --audit-level high`; `git diff --check`; `git status --porcelain`. These mirror both current `.github/workflows/common-validation.yml` and `.github/workflows/stack.yml`. Record actual counts, skips, output and return codes, with secret-free summaries. A genuine failure, migration drift, tracked secret or audit finding **blocks** release; do not reclassify as "CI unavailable."
6. **Supplemental release-specific safety:** verify all nine journal migrations including `0008_mushy_zarek`, local operator preflight, least-privilege role checks and `invoice_nudges`; independently reviewed disposable-PG16 backup/restore and corrupt-backup negative control; provider-disabled env matrix and licensed Studio bundle behavior; QA of HTTPS cookie/CSP, proxy/rate limit, privacy-marker log checks and single-operator access after creation but before URL sharing. **Known cleanup finding:** do not rely on `design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` unattended until its reported `pg_ctl status` exit-code cleanup gap is remediated or a reviewer verifies an equivalent fail-closed shutdown check. No new migration or real provider call.
7. **Platform gap disclosure:** macOS/other local execution is **not** GitHub Ubuntu. Record the precise differences (OS, native modules, package tools, PostgreSQL packaging, PG service vs disposable local cluster) and whether a trusted Ubuntu Linux/Docker parity run was performed. Independent reviewer must judge equivalence; owner must explicitly accept any remaining platform coverage gap. Do not claim "GitHub CI SUCCESS".
8. **Independent evidence and owner gates:** an independent reviewer checks exact SHA and clean tree, all commands, complete failure/skip evidence, current code and workflows, local environment equivalence, known QA, cost/security boundaries and risk before a distinct owner go/no-go for this manual exception. **A PASS on the policy PR alone never authorizes deploying.**

## Non-CI gates remain binding

- **G1:** recheck real Hobby checkout pricing, credit applicability, tax/overage and C0 forecast; document D5 private encrypted backup/export location, retention/deletion plan, teardown checkpoints. D4-X remains effective only within its already-adopted scope; $25 is NOT a Render-enforced hard stop.
- **G2/G3:** prior merged controls preserved; **G4:** SHA/ref verified but release validation incomplete until either default hosted CI succeeds or all of this one-time manual alternative's requirements are met and expressly approved.
- **G5:** Hobby request-log residual risk decision remains distinct; A1–A4 incl. live synthetic marker absence in application logs before any shared URL.
- **G6:** separate approval for resource creation plus initial billable build, and later separate approvals for URL sharing and access method; real HTTPS, `__Host-` cookie, one-hop proxy/throttling, env, role and storage checks; E4b verified only after create.
- **G7:** owner-attested licensed Studio use through judging; verify vendor package-download rights and protect real license in Render secrets. No silent Community replacement.
- **G8 and provider gates A/B/C:** no OpenAI/PayPal live credentials or calls; `NUDGE_AI_DRAFTING_ENABLED` absent/false, `PAYPAL_DRAFTS_ENABLED=false`, `PAYPAL_ENV=sandbox`; `release-preflight env` must PASS against actual Render service configuration before any public sharing.
- No advance authorization for deleting paid resources. Separate approval is required at teardown. No sharing judge URL until post-creation QA and owner approval.

## Execution order and evidence checklist

1. Merge **this docs-only policy PR** only after independent exact-HEAD audit and separate owner approval. Hosted validation remains `NOT RUN` and still blocks the release until the exception has all its proofs.
2. Run every candidate SHA source, baseline, Stack, PG16, recovery, security and licensed-build check on a trusted workstation; save redacted logs privately, not in Git. Repeat affected tests if code changes, but a changed release SHA invalidates the exception.
3. Request an **independent manual evidence audit**. Record PASS/PARTIAL/FAIL, exact candidate SHA, host/Ubuntu differences, real test results, deficits and residual risk.
4. Obtain explicit owner acceptance of the audited one-time substitution and any disclosed coverage gap. Only then may G4 use manual validation instead of hosted CI for this SHA, subject to all other gates.
5. Verify G1/G5/G7 evidence and G8 intended env; obtain a separate owner authorization to create one approved Render pair and the unavoidable first build. Do not create resources merely because this policy is merged.
6. After provisioning, verify E4b at +24 hours and live G6 controls; obtain separate owner approval before sharing a judge URL. Record credits and billable actuals, monitor and follow D5/D4-X teardown.

**Explicit statuses at draft creation:** source preflight `7/7 PASS` reported by owner on the candidate and remote branch protected; GitHub-hosted CI `NOT RUN`; complete independent manual **release** suite `NOT RUN`; manual exception `PROPOSED / NOT EFFECTIVE`; Render resources `NOT CREATED`; no deployment.

## Closeout conditions

One-time alternative lapses at the first completed authorized judges release of this exact SHA, at any candidate-SHA/branch-tip change, or after 2026-12-15. Future releases default to hosted CI unless independently reviewed under a separate policy decision. This task never modifies GitHub Actions workflow definitions.
