# NMI-P7-D — integrated release-readiness verification (no deployment)

All results below are **implementation-agent local runs** unless marked "independent". Hosted CI is recorded in the PR comment and handoff for the final exact head. Nothing was deployed, no Render resource was touched and no live provider was called. All data is synthetic.

**Integrated source:** P7-A (`2b2c722`), P7-B (`325a188`) and P7-C (`39e6603`) as accepted by independent review, on branch `phase-7/nmi-release-readiness`. P7-D adds only evidence runners, evidence files and documents. No application, migration or runtime-grant file was changed.

## Commands and results

| Check | Command | Result |
|---|---|---|
| Full repository validation | `pnpm validate` (lint, format check, typecheck, tests, licensed build + scan, Community build + scan) | exit 0; **1408 tests passed**, 350 skipped (the DB tests run only under `test:db`); both bundle scans clean |
| Database tests (disposable PostgreSQL 16.15) | `TEST_DATABASE_URL=… pnpm test:db` (private cluster on port 54503, torn down and shutdown confirmed) | **367 passed**, 19 files |
| P7-B preflight | `vitest run apps/api/src/release-preflight.test.ts` (inside `validate`) | 79 passed (accepted at P7-B) |
| P7-A UI regressions | `vitest run src/nudges src/nudgey` (inside `validate`) | 203 passed (accepted at P7-A) |
| P7-A browser journey | `node design/evidence/NMI-P7/run-p7a-journey.mjs` from a clean tree at `e5721fa` | **47/47** (1 seed, 10 queue-focus, 12 pending-switch, 18 page checks, 1 phone flow, 4 boundaries, 1 fail-closed cleanup), 7 screenshots (`screenshots-p7a/`, `qa-results-p7a.json`); regenerated after P7-D-AUD-01 (the earlier 46/46 run at `4c81a43` and the 47/47 run at `84349e7` are superseded) |
| PostgreSQL cleanup failure control | `node design/evidence/NMI-P7/test-pg-cleanup-failclosed.mjs` from a clean tree at `e5721fa` | **30/30** (up from 11): real-cluster failed-stop and falsely-successful-stop controls, 14 injected status-error controls, a real inaccessible directory, uninitialised-directory handling and positive controls (`pg-cleanup-failclosed-results.json`) |
| Bundle inspection, synthetic only | `node design/evidence/NMI-P7/run-bundle-inspection.mjs` | **30/30** (`bundle-inspection.json`) |
| Migration `0008` recovery (P7-C) | `node design/evidence/NMI-P7/run-nudge-recovery-drill.mjs` | **116/116**, independently accepted (PR #45 comment 6675591988); not rerun in P7-D |

## Fail-closed cleanup (P7-D-AUD-01)

The journey runner deletes its disposable PostgreSQL cluster only on proven shutdown. `pg-cleanup.mjs` stops the server (fast, then immediate if still running) and reads `pg_ctl status`. For an existing data directory, **only a status command that ran without a launch error or signal and exited exactly 3 ("not running") permits deletion**. Exit 0 (running), exit 4 (no accessible data directory), a null status (launch error or signal) and any other code mean shutdown is not established: the directory is preserved, the runner prints a clear message and exits non-zero.

Two cases are explicit and are **not** claimed to be `pg_ctl`-verified: a data directory that does not exist, and a readable directory holding neither `PG_VERSION` nor `postmaster.pid` (initdb never completed, so no server can exist). An unreadable directory is not treated as uninitialised and is preserved. The journey records the cleanup as a check, with the `pg_ctl status` trail in `info.cleanup` (exit 3 in the committed run).

The failure control (`test-pg-cleanup-failclosed.mjs`, 30/30) uses a real disposable PostgreSQL 16 cluster and injected results:
- **Real cluster:** a failing `stop`, and a `stop` that claims success while the server keeps running, both preserve the directory and leave the server answering. A real exit 3 after a real stop permits cleanup. An initdb-only directory is removed.
- **Injected `status` results (directory preserved in every case):** exit 4, 1, 2, 5, 127 and 255; a launch error (ENOENT, EACCES); a null status with and without a signal; undefined; exit 3 with a reported error; exit 3 with a signal; a missing result; and running (0) after the fast stop followed by 4 after the immediate stop.
- **Real inaccessible directory:** permissions removed, the real `pg_ctl status` does not report 3, and nothing is deleted.
- **Positive control:** an injected clean exit 3 removes the directory. **Negative control (not committed):** against the previous helper (`status !== 0`), 13 status-error controls fail and the run then crashes on a missing result.

## Browser journey (P7-A fixes in a real browser)

Headless Chrome over CDP against the real Fastify app, the built Community bundle, a disposable PostgreSQL 16 and the P6 test-only launcher (deterministic **fake** model, not OpenAI). It writes only under `design/evidence/NMI-P7/`; the P6 screenshots and results were not touched.

- **Already-mounted queue (Codex P2 #1), 10 checks:**
  - Nudgey is asked for a draft while the operator sits on the queue's History tab. It asks for confirmation first, with no model call.
  - One click makes exactly one POST and one model call.
  - "Open in queue" switches the mounted queue to Pending review and selects the new draft (Zorblax Industries). The pending count reads 3 from the server.
  - A second request from a fresh conversation, starting on Approved, re-targets again (Zorblax Logistics).
  - With no new request, the operator's manual History tab is not overwritten.
  - No draft was approved, rejected or edited by navigation.
- **A→B→A after a pending warning (Codex P2 #2), 12 checks including replace:**
  - Selecting A (which has a pending draft) shows the warning with Replace and Open existing, at the cost of one POST and no model call.
  - Switching to B clears the warning and both buttons, and the normal confirmation returns with no request made.
  - Switching back to A does not resurrect the warning.
  - B then drafts normally (one POST, one model call), and A's pending draft is untouched (same id and version).
  - Replace for A uses A's own pending reference. A's old draft is superseded once, and B's pending draft is untouched.
- **Phone (390 px):** the same A→B flow clears the warning on a phone (1 flow check plus 10 page checks).
- **Objective page checks** (8 at desktop, 10 on the phone) on the pending-exists and normal-confirm states:
  - no horizontal overflow
  - every interactive target at least 44 px tall on the phone
  - the "Professional" tone select shown in full
  - computed WCAG AA text contrast
  - an accessible name on every control
- **Boundaries:**
  - no request to a foreign host
  - no send, schedule, dispatch, approve or reject route used by the flows under test
  - every model input customer-free
  - no console errors
- **Negative controls (not committed):** the same journey against the pre-P7-A web sources fails. The queue fix fails at the first re-target (timed out waiting for the queue to switch); with only the Nudgey fix reverted, the journey fails 3 pending-switch checks and then aborts. This run showed the journey detects the unfixed code.

## Bundle inspection (synthetic only)

The AG Studio licence value used is a canary string set only in child-process environments; the owner's real key was never needed or read. For each variant the build succeeds, `scripts/check-bundle-secrets.mjs` passes and confirms the licence value was checked and absent, an independent grep finds no canary, and none of these appear in any built file: `AG_STUDIO_LICENSE_KEY`, `studio-licence`, `__nmi_dev`, `x-nmi-dev-studio`, `OPENAI_API_KEY`, `PAYPAL_CLIENT_SECRET`, `SESSION_SECRET` or a private-key header. The Community build also contains no `ag-studio`, `AgStudio` or `ag-charts-enterprise` marker. The licensed build has Studio only in lazy chunk(s), never in the entry file. A negative control (a canary injected into a built file) makes the scanner fail, then the file is restored and the scan is clean again.

## Not performed (stays open)

- Safari, Firefox, real devices and real touch; the browser journey is headless Chrome with emulated 1280 px and 390 px viewports only.
- Screen readers (VoiceOver, NVDA); contrast and accessible names are computed in the page, not audited with a tool such as axe, which is not in the repository.
- 400% browser zoom; HTTPS `__Host-` cookie behaviour behind the real Render reverse proxy; Render request-log evidence (G5).
- The P6 browser journey was not rerun (it rewrites its tracked evidence); its 150/150 result stands as recorded at `a68f77b`.
- Render-managed backup and restore, real-size restore time, live billing, charges and credits, and any hosted behaviour.
- Live OpenAI or PayPal Sandbox behaviour (Gates A/B/C), and Devpost or video publication.
