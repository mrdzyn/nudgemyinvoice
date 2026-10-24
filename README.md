# AI-Native Project Template

A reusable, human-gated software delivery foundation for projects built with AI coding agents.

This repository defines the **engineering operating model** shared across projects. It is intentionally technology-agnostic: generated projects should add stack-specific tooling, dependencies, CI jobs, and deployment logic without weakening the baseline controls in this template.

## Core principles

- **Human-gated:** humans retain ownership of architecture, product direction, security/risk decisions, merge approval, and production release authority.
- **AI-accelerated:** AI agents may implement, test, review, document, and diagnose within explicitly bounded tasks.
- **Repository-backed context:** durable project knowledge and active cross-agent continuation state live in version-controlled documents rather than chat history.
- **Independent review:** implementation and review should be separated where practical.
- **Repeatable validation:** changes must pass defined automated and manual quality gates.
- **Small, auditable changes:** work should be scoped into bounded tasks and pull requests.
- **Reproducible delivery:** releases should be traceable to a commit, version, validation result, and deployment artifact.
- **Design-first for UI:** user-facing work moves from Markdown requirements to screen designs, human-approved shells, production wiring/tests, and integrated validation rather than inventing UX during backend implementation.
- **Objective-based testing:** AI agents run the smallest risk-proportionate automated checks that prove the task objective, then hand off to manual QA where applicable; repository-required CI and release gates still run independently.

## Repository map

```text
.
├── AGENTS.md
├── README.md
├── .agent/
│   └── TASK-CONTRACT.md
├── config/
│   └── project-profile.json
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── STATUS.md
│   ├── HANDOFFS.md
│   ├── PROJECT-MEMORY.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   ├── RELEASE.md
│   ├── REPOSITORY-SETUP.md
│   ├── CAPABILITY-PACKS.md
│   ├── DESIGN-SYSTEM.md
│   └── ACCESSIBILITY.md
├── design/
│   ├── README.md
│   ├── figma/
│   │   └── README.md
│   ├── tokens/
│   │   └── design-tokens.json
│   ├── components/
│   │   └── COMPONENT-CATALOG.md
│   ├── resources/
│   │   └── DESIGN-RESOURCE-CATALOG.md
│   ├── integrations/
│   │   ├── google-maps.md
│   │   └── google-workspace.md
│   └── platforms/
│       ├── apple.md
│       ├── android.md
│       ├── web.md
│       └── windows.md
├── store/
│   ├── README.md
│   ├── apple.md
│   ├── google-play.md
│   ├── microsoft-store.md
│   ├── huawei-appgallery.md
│   ├── wordpress-org.md
│   ├── SUBMISSION-METADATA.md
│   ├── DATA-PRIVACY-DECLARATION.md
│   ├── AGE-CONTENT-RATINGS.md
│   ├── JURISDICTION-MATRIX.md
│   └── china-mainland-games.md
├── integrations/
│   ├── README.md
│   ├── revenuecat.md
│   ├── freemius.md
│   └── paddle.md
├── release/
│   └── android-signing.md
├── tasks/
│   ├── README.md
│   └── TEMPLATE.md
├── scripts/
│   └── README.md
└── .github/
    ├── pull_request_template.md
    ├── ISSUE_TEMPLATE/
    │   ├── bug.md
    │   ├── feature.md
    │   └── task.md
    └── workflows/
        ├── ci.yml
        ├── common-validation.yml
        └── template-integrity.yml
```

## CI/CD extension model

The template provides a small universal CI baseline rather than a universal build system:

- `.github/workflows/ci.yml` is the project-facing PR/push entrypoint;
- `.github/workflows/common-validation.yml` is the reusable stack-neutral baseline;
- child projects add explicit sibling jobs for their real stack-specific lint, typecheck/analyze, tests, build/package, and applicable security checks;
- privileged release/deployment remains separate from ordinary PR validation.

Canonical guidance:
- `docs/REPOSITORY-SETUP.md` — project-owned CI composition, required-check enforcement, CI availability, and repository settings;
- `docs/TESTING.md` — required PR, optional informational, release-only, and manual/human gate classes;
- `docs/RELEASE.md` — production credentials, OIDC, environments, release validation, and human release approval.

Do not turn the reusable common baseline into an arbitrary command runner or give ordinary PR CI production/release privileges.

## Start a new project

### Recommended workflow

1. Create the new GitHub repository from this repository using **Use this template**.
2. Open the new project repository with the orchestrator/AI agent.
3. Give it the initialization prompt below.
4. Select the project profile, remove master-only bootstrap state, and prune unselected optional template artifacts using `docs/REPOSITORY-SETUP.md`.
5. Review the proposed product, architecture, security, design/accessibility, testing, release, and Phase 0 plan.
6. For user-facing products, write the first milestone/feature requirements in Markdown, then produce the screen map/user flows and screen designs.
7. Obtain human approval of the screen/design direction before substantial UI shell implementation.
8. Implement the UI shell with fixtures/stubs/sample data where appropriate, then review the shell before production wiring.
9. Wire business logic, state, persistence, APIs, authentication/authorization, and integrations while adding the targeted tests required by the task objective.
10. Once the objective is proven, stop expanding the agent-run automated test loop and perform the defined manual QA/device/platform validation.
11. Open the PR and let all repository-required CI/status checks run; then continue through independent audit, human merge approval, and release.
12. For non-UI work, use the same objective-based validation rule without manufacturing screen artifacts.

### Copy-paste initialization prompt

Use this prompt when starting a brand-new project from this template:

```text
Initialize this repository as a new project using the engineering operating model inherited from:

https://github.com/mrdzyn/ai-native-project-template

Project name:
[PROJECT NAME]

Product / idea:
[SHORT DESCRIPTION OF WHAT WE ARE BUILDING]

Primary users:
[WHO IT IS FOR]

Target platforms:
[WEB / IOS / ANDROID / DESKTOP / WORDPRESS / MCP / GAME / OTHER]

Preferred or required stack:
[STACK, OR "PROPOSE ONE"]

Important constraints:
[SECURITY, PRIVACY, OFFLINE-FIRST, BUDGET, STORE, HOSTING, INTEGRATION, TIMELINE, ETC.]

Commercialization / distribution:
[FREE / PAID / SUBSCRIPTION / INTERNAL / APP STORES / SAAS / OTHER]

Design / UX direction:
[NATIVE PLATFORM-FIRST / EXISTING FIGMA / EXISTING BRAND / PROPOSE ONE / NOT APPLICABLE]

Third-party integrations:
[REVENUECAT / FREEMIUS / PADDLE / GOOGLE MAPS / GOOGLE WORKSPACE / NONE / OTHER]

Your job is to initialize the project, not to start feature implementation immediately.

Follow these rules:

1. Treat the repository's AGENTS.md as the default coding-agent operating policy.
2. Read docs/STATUS.md next, then config/project-profile.json, then the active task/phase specification. If STATUS names an Active handoff, read only that matching section in docs/HANDOFFS.md before relevant code/tests.
3. Do NOT use docs/PROJECT-MEMORY.md as default coding-agent startup context. It is reserved for durable decisions and historical rationale.
4. Replace the template placeholders with project-specific content.
5. Change `config/project-profile.json` from `repositoryMode: "template"` to `"project"`, select only the capabilities, target platforms, storefronts, and integrations this project actually uses, then follow the canonical **Greenfield pruning** procedure in `docs/REPOSITORY-SETUP.md`.
6. Update:
   - README.md
   - docs/PRODUCT.md
   - docs/ARCHITECTURE.md
   - docs/STATUS.md
   - docs/SECURITY.md
   - docs/TESTING.md
   - docs/RELEASE.md
   - docs/REPOSITORY-SETUP.md
   - docs/DESIGN-SYSTEM.md when the project has user-facing UI
   - docs/ACCESSIBILITY.md when the project has user-facing UI
7. After removing the marked master-template memory block, initialize docs/PROJECT-MEMORY.md only with durable decisions that belong to this project. Do not retain master-template history, and do not turn project memory into a backlog, transcript, or status log.
8. Propose the initial architecture and explicitly document important assumptions, trust boundaries, external integrations, data handling, deployment model, and release path.
9. For projects with user-facing UI, use the design-first delivery gate:
   - write the applicable product/feature requirements and observable acceptance criteria in Markdown;
   - define the screen inventory, navigation, user flows, and required loading/empty/error/offline/permission/disabled/destructive states;
   - select the appropriate profile under design/platforms/;
   - establish semantic design tokens and the minimum component inventory;
   - define accessibility and responsive/adaptive expectations;
   - use design/resources/DESIGN-RESOURCE-CATALOG.md to choose the correct source authority level;
   - reference official platform UI kits through their official distribution channels rather than copying them into the repo;
   - read only the applicable design/integrations/ guidance when the feature actually uses that integration;
   - create/link reviewable screen designs/mockups when visual design is in scope;
   - obtain human approval of the screen/design direction before substantial UI shell implementation;
   - build/review the UI shell with fixtures/stubs/sample data where appropriate before production business/data/API/integration wiring;
   - add executable tests alongside the wiring and validate the integrated experience against both the requirements and approved design.
10. For any project that builds Android release artifacts (Flutter, React Native, or native Android/Kotlin), initialize and follow `release/android-signing.md`. Standardize the signing property/secret names, but keep release/upload keys and password values app-specific. Never allow a production AAB/APK to fall back to debug signing.
11. If distribution includes an app/plugin store or directory:
   - set `capabilities.storeRelease=true`;
   - select only the applicable storefront(s) in `config/project-profile.json`;
   - initialize the generic store metadata/privacy/age/jurisdiction worksheets;
   - read the applicable storefront profile, including `store/wordpress-org.md` for WordPress.org;
   - verify current official store requirements rather than freezing changing policy values into the project.
12. If RevenueCat, Freemius, Paddle, Google Maps, or Google Workspace is selected, add the integration selector to `config/project-profile.json` and read only its applicable integration guide.
13. Review `docs/REPOSITORY-SETUP.md` and propose the repository enforcement plan: ruleset/branch protection, required status checks, review/conversation settings, secrets/variables, environments, and production human gate. Do not claim settings are enforced until they are actually configured.
14. Define Phase 0 as the foundation/setup phase and identify:
   - objectives;
   - deliverables;
   - acceptance criteria;
   - required validation;
   - risks/blockers;
   - next milestone.
15. Add stack-specific CI checks appropriate to this project while preserving the baseline repository checks.
16. Define the testing policy as objective-based and risk-proportionate: each task states the behavior/risk to prove, the smallest targeted automated evidence, the manual QA step, escalation triggers, and required CI/release gates. Required CI remains mandatory even when an agent's local test scope is narrow.
17. Create the first bounded task using tasks/TEMPLATE.md only after the project foundation is defined.
18. Use a feature/phase branch for implementation work.
19. Do not merge a PR or deploy to production without explicit human approval.
20. Keep implementation and independent review/audit separated where practical.
21. Do not introduce unnecessary dependencies or infrastructure before they are justified.

Before writing production code, give me an initialization report containing:

- your understanding of the product;
- proposed architecture and stack;
- key security/privacy boundaries;
- design-system/platform approach and accessibility baseline when UI is in scope;
- design-first plan for the first UI milestone: requirements artifact → screen map/flows → screen designs → human design approval → shell → wiring/tests → integrated validation;
- repository/document changes required;
- Phase 0 plan;
- proposed CI/CD checks;
- testing strategy: task-level test objectives, targeted automated evidence, manual QA, escalation rules, and mandatory CI/release gates;
- selected capability packs / storefronts / integrations;
- Android signing/release-key plan when Android is in scope;
- confirmation that the canonical greenfield-pruning procedure in `docs/REPOSITORY-SETUP.md` was completed, with any retained optional guidance explicitly justified;
- repository ruleset/environment setup plan;
- store/distribution readiness when applicable;
- open questions or decisions requiring my approval.

If information is missing, make a reasonable proposal but clearly label assumptions instead of silently inventing product decisions.
```

### Short version

For projects where the product and stack are already well defined:

```text
Initialize this repository from the mrdzyn/ai-native-project-template operating model.

Project: [NAME]
Product: [DESCRIPTION]
Stack: [STACK]
Platforms: [PLATFORMS]
Constraints: [CONSTRAINTS]

First change config/project-profile.json to project mode, select only the capabilities actually used, and complete the canonical Greenfield pruning procedure in docs/REPOSITORY-SETUP.md. Then establish the project-specific repository context and proceed with the selected capability guidance only.

For user-facing projects, use the design-first sequence: write requirements in Markdown → define screen map/user flows and required states → create reviewable screen designs → obtain human design approval → implement/review the UI shell with fixtures/stubs where useful → wire business logic/data/APIs/integrations with executable tests → validate the integrated experience. Select the platform design profile, establish semantic tokens, component/state requirements, accessibility expectations, and Figma/platform-kit references as part of that process.

If Android is in scope, apply `release/android-signing.md`: use the canonical signing property names, keep release/upload keys and password values app-specific, and never allow production artifacts to fall back to debug signing.

Initialize applicable store/integration packs, define the GitHub repository enforcement plan, then define Phase 0, acceptance criteria, CI/CD requirements, and the first bounded task. For each task, define a test objective and run the smallest targeted automated evidence that proves it; once met, stop expanding the agent test loop and move to manual QA where applicable while still requiring all repository CI/release gates. Follow AGENTS.md, preserve the human approval gate, keep PROJECT-MEMORY out of default coding-agent startup context, and do not begin feature implementation or merge anything until I approve the initialization plan.
```

### Manual initialization checklist

If you are not using an orchestrator to perform the setup:

1. Replace template placeholders in `README.md` and `docs/PRODUCT.md`.
2. Define the initial architecture in `docs/ARCHITECTURE.md`.
3. Set the current phase and next milestone in `docs/STATUS.md`.
4. Change `config/project-profile.json` to project mode and select applicable capability packs.
5. Complete the canonical **Greenfield pruning** checklist in `docs/REPOSITORY-SETUP.md`.
6. Define project-specific security, testing, release, and repository-enforcement requirements.
7. For user-facing projects, initialize the design system, platform profile, accessibility baseline, and design references; then write the first UI requirements, screen map/user flows, and screen designs.
8. Obtain human approval of the first screen/design direction, implement/review the UI shell, then wire production logic/data/APIs/integrations with the required executable tests.
9. If Android is in scope, initialize `release/android-signing.md` and use app-specific release/upload key material with the standard secret/property names.
10. Initialize applicable store/integration packs only when the product uses them.
11. Add stack-specific CI jobs while retaining the baseline repository checks.
12. Define project testing as objective-based: targeted agent validation → manual QA where applicable → required PR CI/release gates.
13. Create the first bounded task from `tasks/TEMPLATE.md`.
14. Work through a feature branch and pull request. Do not let coding agents merge their own work.

## Adopt this operating model in an existing project

Use this path when the target repository already contains product decisions, architecture, code, roadmap documents, brand guidance, or implementation history.

This is a **brownfield adoption**. The goal is to add the operating model without flattening stronger project-specific context.

### Recommended workflow

1. Open the existing repository with the orchestrator/AI agent.
2. Give it the adoption prompt below.
3. Require a KEEP / MERGE / ADD / RETIRE reconciliation matrix before substantial edits.
4. Identify one canonical source for each operating concern and resolve ambiguous authority before editing.
5. Preserve authoritative project-specific documents and locked decisions; add/merge only genuine gaps and retire duplicate or obsolete instructions.
6. Add stack-specific validation appropriate to the actual repository.
7. Review the adoption through a feature/phase branch and pull request.

### Copy-paste brownfield adoption prompt

```text
Adopt the mrdzyn/ai-native-project-template operating model into this existing repository.

Reference template:
https://github.com/mrdzyn/ai-native-project-template

This is a brownfield adoption.

Do NOT replace or overwrite established product, architecture, security, privacy, roadmap, brand, release, implementation, or commercialization decisions merely because the master template contains a generic equivalent.

Your first job is to inspect and map the existing repository before making substantial changes.

Follow these rules:

1. Read the existing AGENTS.md, docs/STATUS.md, architecture/roadmap documents, active handoff/task documents, and relevant code/tests first.
2. Identify which master-template concerns/capabilities already have an equivalent in this repository.
3. Build the reconciliation matrix from `docs/REPOSITORY-SETUP.md` and classify each concern as KEEP / MERGE / ADD / RETIRE.
4. End with one canonical source per concern. Treat stronger project-specific guidance as authoritative over generic template text unless there is a direct conflict with the human-gated safety model. Do not duplicate documents just to match template filenames; merge into the authoritative source, add only when no equivalent exists, and retire obsolete duplicates or reduce compatibility copies to pointers. If Project Baseline expects another path, adapt its required-file mapping deliberately rather than maintaining two competing policies.
5. Preserve existing terminology, locked decisions, product boundaries, architecture, brand guidance, security/privacy constraints, and release rules.
6. Keep docs/PROJECT-MEMORY.md out of default coding-agent startup context. If the repository already has an equivalent durable-memory artifact, preserve its role and reconcile naming deliberately.
7. Map or create `config/project-profile.json` so it declares only the capabilities actually being adopted. Do not select packs merely because they exist in the master template.
8. Add only the missing operating-model capabilities that materially improve the repository, such as:
   - bounded task contracts;
   - STATUS vs durable-memory separation;
   - PR/issue templates;
   - security/testing/release baselines;
   - CI quality gates;
   - independent review expectations;
   - human merge/release approval gates.
9. Inspect existing GitHub rulesets/branch protection, required status checks, review settings, environments, and secret/variable practices. Preserve stronger controls; propose gaps using `docs/REPOSITORY-SETUP.md`.
10. Add stack-specific CI checks appropriate to the repository's actual technology while preserving the baseline repository checks where applicable.
11. Reconcile the testing workflow to objective-based, risk-proportionate agent validation without weakening existing mandatory CI or regression gates. Small/localized tasks should use targeted evidence and then manual QA; broad/high-risk/release work retains the wider coverage justified by its blast radius.
12. Do not weaken existing tests, security controls, tenant/data boundaries, privacy rules, or deployment safeguards in order to conform to the template.
13. For user-facing projects, adopt the relevant design-system/platform guidance only when it does not overwrite an established brand/design system. Reconcile rather than replace. Use the design resource catalog to distinguish authoritative/official sources from community references, and load integration-specific design guidance only when the project actually uses that integration. After adoption, material UI work follows the design-first sequence: Markdown requirements → screen map/user flows → screen designs → human design approval → UI shell → production wiring/tests → integrated validation. Existing approved designs/shells may satisfy a stage when the adoption report demonstrates that clearly; do not recreate them merely to conform to the template.
14. If the existing project distributes through an app/plugin store or uses RevenueCat/Freemius/Paddle, reconcile the applicable store/integration pack without overwriting stronger project-specific release or billing controls.
15. Do not begin unrelated feature implementation as part of the adoption.
16. Use a feature/phase branch for adoption work.
17. Do not merge or deploy without explicit human approval.
18. Keep implementation and independent review/audit separated where practical.
19. If the template and repository disagree materially, stop and present the conflict for owner decision rather than silently choosing one.

Before editing, give me a Brownfield Adoption Report containing:

- repository/project understanding;
- KEEP / MERGE / ADD / RETIRE reconciliation matrix;
- canonical source selected for each operating concern;
- existing artifacts that already satisfy the template;
- missing template capabilities;
- duplicate/conflicting documents to retire or reduce to pointers;
- conflicts requiring owner decision;
- files you propose to add, modify, keep unchanged, or retire;
- proposed CI/CD changes;
- repository ruleset/branch-protection/environment gaps;
- capability-pack mapping;
- security/privacy implications;
- store/distribution and billing-integration implications where applicable;
- design-system implications when UI is in scope;
- proposed adoption phase/task and acceptance criteria.

After I approve the adoption plan, implement only the approved adoption scope.

Do not rewrite project history or normalize the repository just for cosmetic consistency.
```

### Brownfield adoption principle

```text
Preserve what is already authoritative
          ↓
Map each concern against the template
          ↓
KEEP / MERGE / ADD / RETIRE
          ↓
One canonical source per concern
          ↓
Retire duplicate / ambiguous instructions
          ↓
Validate
          ↓
Independent review
          ↓
Human approval
```

The master template is an operating model, not a reason to erase mature project context.

## Capability packs

`config/project-profile.json` activates only the design, storefront, and third-party integration guidance the product actually uses. `docs/CAPABILITY-PACKS.md` defines the selectors and the split between project baseline CI and master-template integrity validation.

For project adoption, `docs/REPOSITORY-SETUP.md` is the canonical source for greenfield pruning and brownfield reconciliation. `docs/CAPABILITY-PACKS.md` defines which optional guidance is active.

## Repository enforcement

`docs/REPOSITORY-SETUP.md` translates the human-gated delivery policy into GitHub ruleset/branch-protection, required-check, secrets/variables, environment, and production-approval setup. Repository policy in Markdown is not the same as enforced GitHub configuration.

## Design foundation

User-facing projects inherit a design-system layer in addition to the engineering operating model.

- `docs/DESIGN-SYSTEM.md` defines design governance and readiness/done expectations.
- `docs/ACCESSIBILITY.md` defines the cross-platform accessibility baseline.
- `design/platforms/apple.md` references the current official Apple HIG, Design Resources, Apple UI kits, and SF Symbols without redistributing vendor assets.
- `design/platforms/android.md` provides the Material/Android profile.
- `design/platforms/web.md` provides the responsive accessible web profile.
- `design/platforms/windows.md` provides the Windows/Fluent desktop behavior and accessibility profile without mandating a framework.
- `design/tokens/design-tokens.json` provides starter semantic tokens.
- `design/components/COMPONENT-CATALOG.md` defines the standard component and product-state vocabulary.
- `design/figma/README.md` defines the Figma setup and design-to-code handoff pattern.
- `design/resources/DESIGN-RESOURCE-CATALOG.md` classifies authoritative platform guidance, official design resources, integration-specific guidance, community references, and project-specific design sources.
- `design/integrations/` contains conditional guidance that should be read only when a feature uses the corresponding integration.

For brownfield projects, reconcile these foundations with the repository's established brand/design system rather than replacing stronger project-specific guidance.

**Principle:** standardize the system, not the brand.

## Store submission foundation

Products distributed through application stores or WordPress.org can use `store/` as a release-readiness kit. It covers Apple App Store / Mac App Store, Google Play, Microsoft Store, Huawei AppGallery, WordPress.org, plus reusable metadata/privacy/rating/jurisdiction worksheets.

The store kit includes paid/subscription checks, privacy/support/legal-link fields, data-type declarations, age/content ratings, Google Play/IARC guidance, jurisdiction-specific release checks, reviewer-access guidance, explicit Apple EULA handling, and a mainland-China game-publishing stop gate. For Apple, projects must record whether they use Apple's Standard EULA or a custom EULA. The canonical Standard EULA URL is:

https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

Product-specific Terms of Use and Privacy Policy URLs belong in the product repository/release record; do not copy another product's URLs into a new project.

Store rules change, so official store policy and console requirements remain authoritative at submission time. Rapidly changing technical values such as Google Play target API levels are deliberately referenced rather than frozen into the template.

## Third-party integrations

`integrations/` contains optional RevenueCat, Freemius, and future Paddle integration guides. These are not default dependencies. Select them in `config/project-profile.json` only when the product actually uses the service.

## Default agent startup context

Coding agents should read, in this order:

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `config/project-profile.json`
4. the active task/phase specification
5. only the section in `docs/HANDOFFS.md` named by `Active handoff`, when one is present
6. relevant code and tests

Do not load the full handoff history during routine startup. `docs/PROJECT-MEMORY.md` is also **not** default startup context and should only be consulted when explicitly requested or when historical rationale is genuinely necessary.

## Delivery model

### User-facing UI

```text
Product owner
    ↓
Requirements / product contract in Markdown
    ↓
Orchestrator / architecture
    ↓
Screen map + user flows
    ↓
Screen designs / mockups + required states
    ↓
Human design approval
    ↓
UI shell implementation
    ↓
Business logic / state / data / API / integration wiring
    ↓
Objective-based targeted automated validation
    ↓
Manual QA / device / platform validation
    ↓
Pull request + required CI
    ↓
Independent review / audit
    ↓
Human merge approval
    ↓
Build / release / deploy
    ↓
Production feedback
```

### Non-UI work

```text
Product owner → orchestrator → bounded task → implementation
→ objective-based targeted validation → manual QA where applicable
→ pull request + required CI → independent review/audit → human approval → merge/release
```

## Template evolution

Keep this repository focused on cross-project standards. Reusable stack-specific CI/CD workflows should eventually live in a separate central engineering-platform repository and be consumed by generated projects.

---

**Status:** See `docs/STATUS.md` for the current template phase and validation state.
