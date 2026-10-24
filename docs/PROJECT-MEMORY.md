# Project Memory

## Purpose

This file preserves **durable project knowledge** across chats, archived threads, AI agents, and team handoffs.

It is primarily a continuity contract between the project owner and the project orchestrator.

It is **not**:
- a chat transcript;
- a changelog;
- a backlog;
- meeting notes;
- a duplicate of `docs/STATUS.md`;
- default startup context for every coding agent.

## Coding-agent policy

Coding agents should **not** read this file by default.

The normal startup order remains:

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `config/project-profile.json`
4. task-specific design/docs
5. relevant code/tests

Agents may consult this file only when:
- explicitly directed by the project owner or orchestrator;
- durable historical rationale is genuinely needed for the task; or
- the assigned task specifically involves updating project memory.

## What belongs here

Record information that is likely to remain useful for months or across major phases:

### Locked product decisions
- Product identity, audience, platform scope, or behavior that has been deliberately settled.

### Architecture decisions and rationale
- Important architectural choices and the reasons behind them.
- Meaningful rejected alternatives when that context prevents future rework.

### Implementation and testing lessons
- Non-obvious lessons that future agents would otherwise rediscover.
- Important platform/toolchain limitations.

### Integration constraints
- Stable external API, store, infrastructure, protocol, or vendor constraints.

### Security and privacy boundaries
- Durable trust boundaries, data-handling rules, offline/online boundaries, authentication principles, or compliance constraints.

### Commercialization and launch decisions
- Stable licensing, pricing-model, distribution-channel, store, or launch decisions.

### Stable terminology
- Canonical names for products, modules, roles, flows, and domain concepts.

## What does not belong here

Do not add:
- every completed ticket;
- transient debugging notes;
- temporary blockers;
- daily progress;
- raw agent output;
- build logs;
- routine version bumps;
- duplicate architecture text already maintained elsewhere.

## Durable memory entries

<!-- MASTER_TEMPLATE_MEMORY_START -->

> **Master-template bootstrap note:** the entries inside this marker block belong to `mrdzyn/ai-native-project-template`. A generated greenfield project must remove the entire marked block when it changes `repositoryMode` to `project`, then add only durable decisions that belong to that project. Keep this file's purpose, coding-agent policy, content rules, and maintenance rule.

### M-001 — Human-gated delivery
**Decision:** AI agents may accelerate implementation, testing, review, documentation, and diagnostics, but final product direction, risk acceptance, merge approval, and production release authority remain human-controlled.

**Rationale:** The delivery model is designed to increase throughput without removing accountability.

### M-002 — Repository-backed continuity
**Decision:** Durable project context is stored in repository documents rather than depending on chat history.

**Rationale:** Multiple agents and conversations must be able to continue work without reconstructing critical project decisions from memory.

### M-003 — Separation of operational status and durable memory
**Decision:** `docs/STATUS.md` tracks current operational state. `docs/PROJECT-MEMORY.md` preserves durable rationale and decisions.

**Rationale:** Mixing current work with historical context makes both harder for agents and humans to use reliably.

### M-004 — Project memory is not default agent context
**Decision:** `docs/PROJECT-MEMORY.md` is excluded from the default coding-agent startup read order. The small `config/project-profile.json` capability selector is read after STATUS so agents know which optional packs are active.

**Rationale:** Agents should begin with concise current instructions, active capability context, and task context; durable history is consulted only when it materially improves correctness.

### M-005 — Technology-agnostic master template
**Decision:** This master template defines engineering process and repository structure, not a specific application stack.

**Rationale:** Flutter, React, WordPress, Cloudflare, Node/MCP, Rust, Godot, and future stacks should be able to inherit the same delivery model without unnecessary dependencies.

### M-006 — Independent review where practical
**Decision:** The implementation role and independent review/audit role should be separated where practical.

**Rationale:** Separation reduces confirmation bias and makes the human approval gate more meaningful.

### M-007 — Platform-aware design foundation
**Decision:** User-facing projects inherit a technology-agnostic design-system layer with semantic tokens, reusable component/state expectations, accessibility requirements, and platform-specific profiles.

**Rationale:** AI-assisted implementation should begin from a coherent product-experience system rather than generating one-off screens independently.

### M-008 — Official UI kits are referenced, not redistributed
**Decision:** Official Apple, Google/Material, Figma, and other vendor-owned UI kits are enabled or referenced through their official distribution channels instead of being copied into this repository by default.

**Rationale:** This keeps the template current, avoids freezing outdated platform assets, respects vendor licensing/distribution boundaries, and keeps the repository lightweight.

### M-009 — Standardize the system, not the brand
**Decision:** The master template standardizes design process, semantic roles, components, states, accessibility, and handoff expectations while allowing each product to define its own visual identity.

**Rationale:** Shared engineering discipline should improve consistency without making unrelated products visually identical.

### M-010 — Windows is a first-class platform profile
**Decision:** Windows desktop products use a dedicated Windows/Fluent experience profile. WinUI 3 / Windows App SDK is the native reference behavior, but the master template does not mandate a Windows implementation framework.

**Rationale:** Desktop windowing, input, accessibility, shell integration, and multi-monitor behavior require guidance that Apple/Android/Web profiles do not cover adequately.

### M-011 — Store submission is a reusable release discipline
**Decision:** The master template includes a store-submission kit covering Apple, Google Play, Microsoft Store, Huawei AppGallery, and WordPress.org, including paid/subscription readiness and explicit EULA/legal-link fields.

**Rationale:** Store certification failures frequently come from metadata, privacy/legal links, monetization disclosures, reviewer access, or platform-specific release requirements rather than application code. These checks should be repeatable without hard-coding product-specific legal URLs.

### M-012 — Store compliance is data-, age-, and jurisdiction-aware
**Decision:** Store release readiness must include a shipped-build data/privacy declaration, age/content-rating review (including IARC where applicable), and a country/region compliance matrix. Mainland-China game distribution is blocked until applicable publishing approvals, filings, publisher/operator arrangements, minor-protection obligations, and data requirements are verified.

**Rationale:** A global store submission does not establish compliance in every jurisdiction, and ratings/privacy declarations cannot substitute for jurisdiction-specific publishing authorization.

### M-013 — Design resources separate authority from applicability
**Decision:** Design references are evaluated by authority (mandatory/authoritative, official design resource, community reference) and applicability (project, platform, integration). Community resources are convenience/inspiration only and never override an approved project-specific design system, product behavior, brand, accessibility requirement, or security/privacy boundary.

**Rationale:** A single linear hierarchy can incorrectly imply that an unrelated community kit outranks the product's approved design. AI agents need an explicit conflict rule.

### M-014 — Capability packs are explicit and CI is split
**Decision:** Generated/adopted projects declare active capabilities in `config/project-profile.json`. Project Baseline CI validates core operating-model files plus only selected packs; a separate master-only Template Integrity workflow validates every capability shipped by this repository.

**Rationale:** Greenfield and brownfield projects should not add unrelated design, store, or integration documents merely to satisfy a generic CI workflow.

### M-015 — Repository policy and repository enforcement are distinct
**Decision:** Human-gated merge/release policy in Git must be paired with deliberate GitHub configuration for rulesets/branch protection, required checks, review settings, secrets/variables, and production environments where supported.

**Rationale:** Template files do not automatically guarantee administrative repository controls, and enforcement capabilities vary by GitHub plan/repository type.

### M-016 — Commerce/licensing services are conditional integration packs
**Decision:** RevenueCat and Freemius have reusable integration guides; Paddle is retained as a future/reference guide. None is a default dependency. Projects load and validate only the integration(s) they actually select.

**Rationale:** Billing and entitlement services materially affect credentials, webhooks, identity, store policy, and release behavior and therefore need bounded integration contracts without contaminating unrelated projects.

### M-017 — Fast-changing external rules are referenced, not frozen
**Decision:** Rapidly changing store/platform requirements such as target API levels, accessibility-reporting mandates, and similar technical policy values are linked to their authoritative source and re-verified at release time instead of hard-coded as long-lived template facts.

**Rationale:** The template should create a durable verification gate without becoming stale when vendors update policy.

### M-018 — Capability selection is executable, tested policy
**Decision:** Capability dependency/file-selection logic lives in `scripts/validate_project_profile.py` and is exercised by a representative valid/invalid self-test matrix in Template Integrity CI. WordPress.org uses the shared distribution/privacy core plus its directory profile without inheriting app-store-only age/jurisdiction controls.

**Rationale:** Conditional CI policy must be testable rather than existing only as embedded workflow YAML, and optional packs should remain genuinely applicable to the selected distribution channel.

### M-019 — RevenueCat webhook verification prefers signed requests
**Decision:** RevenueCat backend integrations should prefer HMAC webhook signing when available, verify the signature against the raw request body using constant-time comparison and timestamp/replay checks, and separately enforce event-id idempotency.

**Rationale:** Request authenticity and duplicate-event handling are distinct security controls; documenting both gives generated projects a safer default.

### M-020 — Generated projects remove master-only bootstrap state
**Decision:** When a generated repository transitions from `repositoryMode: "template"` to `"project"`, it must remove the marked master-template durable-memory block and the inherited master-only `.github/workflows/template-integrity.yml`. Project Baseline fails closed if either inherited artifact remains.

**Rationale:** GitHub template creation correctly copies the master repository tree, but master historical rationale and master-only integrity policy are not project context. Enforcing cleanup prevents context contamination and permanent no-op workflow inheritance.

### M-021 — Android signing standardizes the contract, not key material
**Decision:** Flutter, React Native, and native Android/Kotlin projects use one Android signing contract and one canonical set of release/upload signing property names. Debug signing remains development-only. Production release/upload keys and passwords are app-specific by default and must not be shared merely for convenience. Android, Google Play, or Huawei AppGallery capability selection activates `release/android-signing.md`.

**Rationale:** Consistent names and release checks reduce configuration mistakes across stacks, while unique app-specific key material limits compromise blast radius and preserves correct signing ownership. Production signing identity continuity takes precedence during brownfield adoption.

### M-022 — User-facing delivery is design-first
**Decision:** Material user-facing UI work follows a design-first delivery sequence: written requirements/product contract → screen map and user flows → screen designs and required states → human design approval → UI shell implementation → production business/data/API/integration wiring with executable tests → integrated platform/device validation → PR → independent audit → human merge approval. Backend-only and other non-UI work may bypass the visual-design/shell gate when the task explicitly records that UI design is not applicable.

**Rationale:** Separating product intent, visual/interaction decisions, shell construction, and runtime wiring makes the product reviewable earlier, reduces rework caused by discovering UX problems after backend/state integration, and gives AI agents a clearer contract for what is approved versus what they must not invent. Testing remains planned from requirements and is implemented alongside wiring rather than postponed until the end.

### M-023 — Agent testing is objective-based and risk-proportionate
**Decision:** Every non-trivial task states a concrete test objective and the minimum automated evidence needed to prove it. AI agents begin with the tests closest to the changed behavior and stop expanding their local/interactive test loop once the objective and acceptance criteria are demonstrated, unless risk, blast radius, failure evidence, a mandatory CI/release gate, or explicit owner direction justifies broader coverage. Manual QA follows successful targeted validation where applicable. Repository-required CI and release validation remain mandatory and are not reduced by the agent's testing budget.

**Rationale:** Exhaustive agent-driven testing of unrelated behavior consumes time and model context without proportionate assurance for small changes. Separating targeted task proof from mandatory CI/release gates preserves safety while making AI-assisted delivery faster and more economical. Human QA remains the next validation layer for behavior that automation does not prove efficiently.

### M-024 — Adoption ends with one canonical source and pruned optional guidance
**Decision:** Brownfield adoption maps each operating concern to an existing or template source and classifies it KEEP, MERGE, ADD, or RETIRE so the repository ends with one canonical source per concern. Greenfield repositories remove master-only bootstrap state and normally prune inherited optional capability/platform/store/integration/release guidance that is not selected by the project profile, while preserving the core operating model and any explicitly justified project-relevant exceptions.

**Rationale:** Duplicate or ambiguous instructions cause agents to load conflicting context and waste tokens deciding which source to follow. Physically pruning irrelevant inherited guidance keeps new repositories smaller and clearer without weakening selected controls or the master template's complete capability inventory.

### M-025 — Cross-agent continuation is repository-backed
**Decision:** Meaningful transfers of work between AI agents, tools, conversations, or reviewers use `docs/HANDOFFS.md` as the canonical handoff log. `docs/STATUS.md` stores only the current `Active handoff` ID, and routine agent startup reads only that matching handoff section rather than the full handoff history.

**Rationale:** Multi-agent delivery should not depend on copied chat transcripts or model memory. A compact repository-backed handoff makes continuation reproducible while keeping STATUS concise and avoiding unnecessary context growth from historical handoffs.

<!-- MASTER_TEMPLATE_MEMORY_END -->

## Maintenance rule

When adding an entry:
- assign the next memory ID;
- describe the decision/lesson clearly;
- include rationale;
- avoid temporary implementation detail;
- update an existing entry rather than creating contradictory duplicates when a durable decision changes.
