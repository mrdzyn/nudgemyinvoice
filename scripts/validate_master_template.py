#!/usr/bin/env python3
"""Validate the master-template inventory and template-mode policy.

This script is master-only; child repositories must not call it. E2a retains
both the legacy dedicated required check and the new master-only baseline steps
until the project owner approves a safe required-check cutover.
"""

import json, pathlib, sys
root=pathlib.Path(".")
required=[
    "README.md","AGENTS.md","config/project-profile.json",
    "docs/PRODUCT.md","docs/ARCHITECTURE.md","docs/STATUS.md","docs/HANDOFFS.md","docs/PROJECT-MEMORY.md",
    "docs/SECURITY.md","docs/TESTING.md","docs/RELEASE.md","docs/REPOSITORY-SETUP.md","docs/CAPABILITY-PACKS.md",
    "docs/DESIGN-SYSTEM.md","docs/ACCESSIBILITY.md",
    "design/README.md","design/figma/README.md","design/tokens/design-tokens.json",
    "design/components/COMPONENT-CATALOG.md","design/resources/DESIGN-RESOURCE-CATALOG.md",
    "design/platforms/apple.md","design/platforms/android.md","design/platforms/web.md","design/platforms/windows.md",
    "design/integrations/google-maps.md","design/integrations/google-workspace.md",
    "release/android-signing.md",
    "store/README.md","store/SUBMISSION-METADATA.md","store/DATA-PRIVACY-DECLARATION.md",
    "store/AGE-CONTENT-RATINGS.md","store/JURISDICTION-MATRIX.md","store/apple.md",
    "store/google-play.md","store/microsoft-store.md","store/huawei-appgallery.md",
    "store/wordpress-org.md","store/china-mainland-games.md",
    "integrations/README.md","integrations/revenuecat.md","integrations/freemius.md","integrations/paddle.md",
    ".agent/TASK-CONTRACT.md","tasks/TEMPLATE.md",".github/pull_request_template.md",
    "scripts/README.md","scripts/validate_project_profile.py","scripts/test_validate_project_profile.py",
    "scripts/validate_master_template.py",
    ".github/workflows/ci.yml",".github/workflows/common-validation.yml",".github/workflows/template-integrity.yml",
]
missing=[p for p in required if not (root/p).is_file()]
if missing:
    print("::error::Master template is missing capability files:")
    print("\n".join(missing)); sys.exit(1)
with (root/"config/project-profile.json").open(encoding="utf-8") as fh:
    profile=json.load(fh)
if profile.get("repositoryMode") != "template":
    raise SystemExit("::error::Master template project profile must remain in template mode")
with (root/"design/tokens/design-tokens.json").open(encoding="utf-8") as fh:
    json.load(fh)
print("Complete master-template inventory is valid.")
