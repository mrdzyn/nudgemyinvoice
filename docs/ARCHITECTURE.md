# Architecture

> Keep this document focused on the system as it exists or has been deliberately designed. Record durable rationale in `docs/PROJECT-MEMORY.md` when needed.

## Architecture goals

- Keep the system understandable and operable by humans and AI agents.
- Prefer explicit boundaries and small components over hidden coupling.
- Make testing and rollback practical.
- Protect security/privacy boundaries by design.
- Keep releases traceable to source and validation results.

## System context

[DESCRIBE THE PRODUCT, ITS USERS, EXTERNAL SYSTEMS, AND HIGH-LEVEL DATA FLOWS]

## Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Client / UI | TBD | |
| Application / API | TBD | |
| Data store | TBD | |
| Object/file storage | TBD | |
| Authentication | TBD | |
| Infrastructure | TBD | |
| CI/CD | GitHub Actions + project-specific tooling | |
| Observability | TBD | |

## Component boundaries

### Component 1 — [NAME]
**Responsibility:**  
[RESPONSIBILITY]

**Owns:**  
[DATA / LOGIC / INTERFACE]

### Component 2 — [NAME]
**Responsibility:**  
[RESPONSIBILITY]

**Owns:**  
[DATA / LOGIC / INTERFACE]

## Data model

Describe:
- authoritative data stores;
- local caches;
- personal/sensitive data;
- retention/deletion behavior;
- migrations;
- export/import requirements.

## External integrations

| Integration | Purpose | Authentication | Failure behavior |
|---|---|---|---|
| TBD | | | |

## Environments

Recommended promotion model:

```text
local/dev → CI → staging/test → approved production
```

Document differences between environments and how configuration is supplied.

## Deployment model

[DESCRIBE BUILD, ARTIFACT, DEPLOYMENT, AND ROLLBACK FLOW]

Prefer promotion of a known artifact over rebuilding different code for each environment when the stack supports it.

## Trust boundaries

Identify boundaries such as:
- device ↔ backend;
- public internet ↔ application;
- tenant ↔ tenant;
- application ↔ third-party service;
- CI ↔ production;
- human administrator ↔ customer data.

See `docs/SECURITY.md` for security requirements.

## Architectural change policy

A material architecture change should include:
1. updated architecture documentation;
2. tests/validation appropriate to the risk;
3. migration/rollback considerations;
4. a durable project-memory entry when future agents need the rationale.

## Diagrams

Add Mermaid or image-based diagrams here or under `docs/` as the architecture becomes concrete.
