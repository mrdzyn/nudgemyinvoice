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

### NMI-M001 — Sandbox and human control
**Decision:** NudgeMyInvoice uses PayPal sandbox exclusively; AI may read/parse/draft while external send, refund, cancellation, capture, and financial state changes require server-enforced human approval.
**Rationale:** Demonstrate agentic commerce safely without autonomous money movement.

### NMI-M002 — Multi-currency without speculative FX
**Decision:** Each invoice has one explicit PayPal-supported currency. Cross-currency totals are segregated, with no automatic FX conversion.
**Rationale:** Correctness and transparent amounts are central to the differentiator.

### NMI-M003 — Hackathon build scope
**Decision:** Public MIT repository, approximately 55 hours, verified PayPal invoicing/webhook demo, Anthropic tool use, AG Grid dashboard and Render deployment. Orders/refunds/automatic reminders remain stretch only.
**Rationale:** Protect Nov 9 internal delivery target and demonstrate working integration rather than broad unverifiable features.



## Maintenance rule

When adding an entry:
- assign the next memory ID;
- describe the decision/lesson clearly;
- include rationale;
- avoid temporary implementation detail;
- update an existing entry rather than creating contradictory duplicates when a durable decision changes.
