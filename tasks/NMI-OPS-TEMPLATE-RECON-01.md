# NMI-OPS-TEMPLATE-RECON-01 — Active-state and master-template governance reconciliation

- **Status:** Draft documentation/operating-model proposal; not merged, deployed or authorized to alter release requirements.
- **Base:** `main@4aea541d358e419f835e1f59811216003ba56305`.
- **Template reference:** `mrdzyn/ai-native-project-template@c803a7acd30f65c92dc2e1b8bb396bde3d623666` (M5/M6/M7).
- **UI design gate:** Not applicable (documents only).

## Objective

Fix stale operational context so agents distinguish an **already-Live combined Render baseline** from undeployed newer code, stop reopening historically accepted hosting tasks as initial-deployment prerequisites, and load only current task context. Preserve existing security/privacy gates and all owner-controlled release decisions.

## Approved boundaries for this proposal

- Maintain existing `docs/TESTING.md` and `docs/RELEASE.md` policies without alteration. The template's local-first defaults do **not** waive NMI's stronger exact-candidate release validation or authorize a CI/ruleset change.
- Keep `AGENTS.md` product-specific payment, sandbox, security, human approval and audit boundaries.
- Archive the pre-reconciliation `docs/STATUS.md` verbatim; replace active STATUS with a compact, source-linked factual operational index.
- Add a KEEP/MERGE/ADD/RETIRE adoption matrix, a concise M7 agent guide, and a new handoff; do not automatically copy M5/M6 scripts or master policies. Missing M6 session recovery is a separate, test-required adoption opportunity.
- Do not change application code, databases, deployments, environment variables, production access, license values, protected branches, PR #63, or integration PR #67.

## Evidence classification

- **GitHub-verified:** PR #65 and #66 merges, `main@4aea541d...`, PR #67 Draft at `478b782a...`, protected refs, audited code HEADs.
- **Previously read-only independently observed / owner reported:** existing combined Render service Live on `766dde37...`, tracking `main` with Auto Deploy OFF (see PR #66 review 5816000510). This PR does not inspect Render or imply the latest `main` is deployed.
- **Owner correction:** existing hosting costs/teardown and log privacy acceptance have been addressed for the already-operating service; do not treat the prior *initial hosting* tasks as unperformed provisioning. The historical docs still contain G1/G5 OPEN language, so this records the evidence/status discrepancy without inventing a formal closure or revoking obligations.
- **Unverified for next build:** effective AG Studio license in Live process, runtime browser QA on a new deployment, privileged provider acceptance, release-candidate CI substitution for a **new SHA**, judge-access distribution.

## Validation

- Confirm exact branch base and 100% preservation of prior STATUS in the archive.
- Verify STATUS mandatory fields and handoff uniqueness/linkage; compare template inventory to adopted/explicitly deferred controls.
- Diff-only documentation hygiene: whitespace, broken links and conflicting statements; secrets guard.
- Independent exact-HEAD review before separate owner merge approval. Any full CI requirement is governed by current NMI `docs/TESTING.md`; do not label unrun checks PASS.

## Next action

Run focused read-only validation and an independent exact-HEAD documentation audit of this Draft PR; no merge, release or provider action.
