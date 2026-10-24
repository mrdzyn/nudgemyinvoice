#!/usr/bin/env python3
"""Self-tests for project capability profile selection rules."""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate_project_profile.py")
SPEC = importlib.util.spec_from_file_location("validate_project_profile", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load validate_project_profile.py")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

PROJECT_REPO = "example/project"
REPO_ROOT = SCRIPT.parent.parent
MASTER_GUARD = "if: github.repository == 'mrdzyn/ai-native-project-template'"


def profile(
    *,
    design=False,
    store=False,
    platforms=None,
    storefronts=None,
    integrations=None,
    mode="project",
):
    return {
        "schemaVersion": 1,
        "repositoryMode": mode,
        "capabilities": {
            "design": design,
            "storeRelease": store,
        },
        "platforms": platforms or [],
        "storefronts": storefronts or [],
        "integrations": integrations or [],
    }


def required(p):
    return set(validator.required_files_for_profile(p, PROJECT_REPO))


def expect_error(p, contains):
    try:
        validator.required_files_for_profile(p, PROJECT_REPO)
    except validator.ProfileValidationError as exc:
        assert contains in str(exc), (contains, str(exc))
    else:
        raise AssertionError(f"Expected validation error containing: {contains}")


def expect_cleanup_error(root, p, contains, repository=PROJECT_REPO):
    try:
        validator.validate_generated_project_cleanup(root, p, repository)
    except validator.ProfileValidationError as exc:
        assert contains in str(exc), (contains, str(exc))
    else:
        raise AssertionError(f"Expected cleanup validation error containing: {contains}")


def expect_repository_error(root, p, contains, repository=PROJECT_REPO):
    try:
        validator.validate_repository(root, p, repository)
    except validator.ProfileValidationError as exc:
        assert contains in str(exc), (contains, str(exc))
    else:
        raise AssertionError(f"Expected repository validation error containing: {contains}")


# Generated-project cleanup behavior.
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "docs").mkdir(parents=True)
    (root / ".github/workflows").mkdir(parents=True)
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n",
        encoding="utf-8",
    )
    (root / ".github/workflows/template-integrity.yml").write_text(
        "jobs:\n  template-integrity:\n"
        "    if: github.repository == 'mrdzyn/ai-native-project-template'\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove the inherited master-only Template Integrity workflow",
    )

    # The master-only path itself is forbidden in child projects even if
    # somebody edits or removes the original repository guard.
    (root / ".github/workflows/template-integrity.yml").write_text(
        "name: Child-renamed integrity workflow\n"
        "jobs:\n  check:\n    runs-on: ubuntu-latest\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove the inherited master-only Template Integrity workflow",
    )

    (root / ".github/workflows/template-integrity.yml").unlink()
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n"
        "<!-- MASTER_TEMPLATE_MEMORY_START -->\n"
        "### M-001 — Master-only decision\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    # Partial marker cleanup must still fail closed.
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n"
        "<!-- MASTER_TEMPLATE_MEMORY_END -->\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    # Removing only markers/notes is insufficient if unmistakably
    # master-specific durable entries remain.
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-005 — Technology-agnostic master template\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    # New master-template durable entries must also fail cleanup even if
    # somebody strips the marker block manually.
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-022 — User-facing delivery is design-first\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-023 — Agent testing is objective-based and risk-proportionate\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-024 — Adoption ends with one canonical source and pruned optional guidance\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-025 — Cross-agent continuation is repository-backed\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove inherited master-template PROJECT-MEMORY entries",
    )

    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-001 — Project-specific decision\n",
        encoding="utf-8",
    )
    (root / "docs/HANDOFFS.md").write_text(
        "# Repository Handoffs\n"
        "<!-- HANDOFF_ENTRIES_START -->\n"
        "<!-- MASTER_TEMPLATE_HANDOFFS_START -->\n"
        "## Handoff: P7.0-C1\n"
        "<!-- MASTER_TEMPLATE_HANDOFFS_END -->\n"
        "<!-- HANDOFF_ENTRIES_END -->\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove the inherited master-template HANDOFFS block",
    )

    # Partial master-handoff marker cleanup must still fail closed.
    (root / "docs/HANDOFFS.md").write_text(
        "# Repository Handoffs\n"
        "<!-- HANDOFF_ENTRIES_START -->\n"
        "<!-- MASTER_TEMPLATE_HANDOFFS_END -->\n"
        "<!-- HANDOFF_ENTRIES_END -->\n",
        encoding="utf-8",
    )
    expect_cleanup_error(
        root,
        profile(),
        "remove the inherited master-template HANDOFFS block",
    )

    # Project handoffs remain valid after the master-only block is removed.
    (root / "docs/HANDOFFS.md").write_text(
        "# Repository Handoffs\n"
        "<!-- HANDOFF_ENTRIES_START -->\n"
        "## Handoff: PROJECT-C1\n"
        "<!-- HANDOFF_ENTRIES_END -->\n",
        encoding="utf-8",
    )
    validator.validate_generated_project_cleanup(root, profile(), PROJECT_REPO)

    # The master repository intentionally keeps master-only artifacts.
    (root / ".github/workflows/template-integrity.yml").write_text(
        "jobs:\n  template-integrity:\n"
        "    if: github.repository == 'mrdzyn/ai-native-project-template'\n",
        encoding="utf-8",
    )
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "<!-- MASTER_TEMPLATE_MEMORY_START -->\n",
        encoding="utf-8",
    )
    (root / "docs/HANDOFFS.md").write_text(
        "<!-- MASTER_TEMPLATE_HANDOFFS_START -->\n"
        "## Handoff: P7.0-C1\n"
        "<!-- MASTER_TEMPLATE_HANDOFFS_END -->\n",
        encoding="utf-8",
    )
    validator.validate_generated_project_cleanup(
        root,
        profile(mode="template"),
        validator.MASTER_REPOSITORY,
    )


# A physically pruned greenfield child is valid with core files only.
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    child_profile = profile()

    for relative in validator.CORE_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")

    (root / "config/project-profile.json").write_text(
        json.dumps(child_profile),
        encoding="utf-8",
    )
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-001 — Project-specific decision\n",
        encoding="utf-8",
    )

    verified = validator.validate_repository(root, child_profile, PROJECT_REPO)
    assert set(verified) == set(validator.CORE_FILES)
    assert not (root / "design").exists()
    assert not (root / "store").exists()
    assert not (root / "integrations").exists()

    # Selecting a capability still fails closed if its required files were pruned.
    expect_repository_error(
        root,
        profile(design=True, platforms=["web"]),
        "Missing files for the core operating model or selected capability packs",
    )


def seed_core_files(root, child_profile):
    """Create the core operating-model files of a project repository."""
    for relative in validator.CORE_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")
    (root / "config/project-profile.json").write_text(
        json.dumps(child_profile), encoding="utf-8"
    )
    (root / "docs/PROJECT-MEMORY.md").write_text(
        "# Project Memory\n\n## Durable memory entries\n"
        "### M-001 — Project-specific decision\n",
        encoding="utf-8",
    )


def run_child_cli(root, repository=PROJECT_REPO):
    """Run the child's own copy of the validator the way common-validation does."""
    return subprocess.run(
        [sys.executable, "-I", "scripts/validate_project_profile.py",
         "--repository", repository],
        cwd=root, capture_output=True, text=True, check=False,
    )


# Conditional CI-caller wiring: unit-level behaviour.
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / ".github/workflows").mkdir(parents=True)
    caller = root / ".github/workflows/ci.yml"

    def wiring_error(contains):
        try:
            validator.validate_ci_caller_wiring(root)
        except validator.ProfileValidationError as exc:
            assert contains in str(exc), (contains, str(exc))
        else:
            raise AssertionError(f"Expected wiring error containing: {contains}")

    # Brownfield: no ci.yml at all.
    validator.validate_ci_caller_wiring(root)
    # Brownfield: independent canonical CI that never calls the template.
    caller.write_text("name: CI\non: [push]\njobs:\n  t:\n    runs-on: x\n"
                      "    steps:\n      - run: npm test\n", encoding="utf-8")
    validator.validate_ci_caller_wiring(root)
    # Brownfield: a different local reusable workflow is not our business.
    caller.write_text("jobs:\n  a:\n    uses: ./.github/workflows/own-ci.yml\n",
                      encoding="utf-8")
    validator.validate_ci_caller_wiring(root)
    # A commented-out reference does not count as a call.
    caller.write_text("# uses: ./.github/workflows/common-validation.yml\n"
                      "name: CI\n", encoding="utf-8")
    validator.validate_ci_caller_wiring(root)

    # Block-scalar false positive (Codex P2): text inside `run: |` / `>-`
    # scripts is not a reusable-workflow call.
    for style in ("|", ">-", "|+"):
        caller.write_text(
            "jobs:\n  gen:\n    runs-on: x\n    steps:\n"
            f"      - run: {style}\n"
            "          echo 'uses: ./.github/workflows/common-validation.yml'\n"
            "          uses: ./.github/workflows/common-validation.yml\n"
            "\n"
            "          uses: ./.github/workflows/common-validation.yml\n",
            encoding="utf-8",
        )
        validator.validate_ci_caller_wiring(root)
    # A job-level block scalar (e.g. a description) is skipped too.
    caller.write_text("jobs:\n  a:\n    description: |\n"
                      "      uses: ./.github/workflows/common-validation.yml\n"
                      "    runs-on: x\n", encoding="utf-8")
    validator.validate_ci_caller_wiring(root)
    # Step-level `uses:` and non-`jobs` top-level keys are not job calls.
    caller.write_text("jobs:\n  a:\n    steps:\n"
                      "      - uses: ./.github/workflows/common-validation.yml\n",
                      encoding="utf-8")
    validator.validate_ci_caller_wiring(root)
    caller.write_text("env:\n  uses: ./.github/workflows/common-validation.yml\n",
                      encoding="utf-8")
    validator.validate_ci_caller_wiring(root)
    # Indented commented-out job call does not count.
    caller.write_text("jobs:\n  a:\n    # uses: ./.github/workflows/common-validation.yml\n"
                      "    runs-on: x\n", encoding="utf-8")
    validator.validate_ci_caller_wiring(root)

    # Genuine call after a block scalar in an earlier job still fails closed.
    caller.write_text("jobs:\n  t:\n    steps:\n      - run: |\n          echo hi\n"
                      "  baseline:\n    permissions:\n      contents: read\n"
                      "    uses: ./.github/workflows/common-validation.yml # call\n",
                      encoding="utf-8")
    wiring_error("reusable workflow is missing")
    # Mismatched quotes are not a valid call form.
    assert not validator.calls_common_validation(
        "jobs:\n  b:\n    uses: './.github/workflows/common-validation.yml\"\n"
    )

    # Template call without its callee fails closed, however it is written.
    for line in (
        "uses: ./.github/workflows/common-validation.yml",
        "uses: './.github/workflows/common-validation.yml'",
        'uses: "./.github/workflows/common-validation.yml" # baseline',
    ):
        caller.write_text(f"jobs:\n  b:\n    {line}\n", encoding="utf-8")
        wiring_error("reusable workflow is missing")

    # ...and passes once the callee exists.
    (root / ".github/workflows/common-validation.yml").write_text(
        "on:\n  workflow_call:\n", encoding="utf-8"
    )
    validator.validate_ci_caller_wiring(root)


# Physically pruned generated child built from the repository's REAL caller,
# reusable workflow and validator.
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    seed_core_files(root, profile())
    for relative in (
        ".github/workflows/ci.yml",
        ".github/workflows/common-validation.yml",
        "scripts/validate_project_profile.py",
    ):
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO_ROOT / relative, target)

    # Master-only artifacts are physically absent from the child.
    for relative in (
        ".github/workflows/template-integrity.yml",
        "scripts/validate_master_template.py",
        "scripts/test_validate_project_profile.py",
    ):
        assert not (root / relative).exists(), relative

    caller_text = (root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    common_text = (root / ".github/workflows/common-validation.yml").read_text(
        encoding="utf-8"
    )
    assert validator.calls_common_validation(caller_text), "caller must call callee"
    assert re.search(r"^\s*workflow_call:", common_text, re.MULTILINE)
    assert "scripts/validate_project_profile.py" in common_text

    # Every step that touches master-only scripts keeps its repository guard,
    # so it is skipped (not failed) in a child that pruned those scripts.
    steps = re.split(r"(?m)^\s*- name:", common_text)[1:]
    master_steps = [
        step for step in steps
        if "validate_master_template.py" in step
        or "test_validate_project_profile.py" in step
    ]
    assert len(master_steps) == 2, len(master_steps)
    for step in master_steps:
        assert MASTER_GUARD in step, step

    # Positive: the pruned child passes through its own CLI.
    result = run_child_cli(root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Project profile is valid" in result.stdout

    # Negative: delete the reusable callee -> fail closed with a clear error.
    (root / ".github/workflows/common-validation.yml").unlink()
    result = run_child_cli(root)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "reusable workflow is missing" in result.stdout, result.stdout

    # Brownfield compatibility: custom canonical CI, no template files at all.
    (root / ".github/workflows/ci.yml").write_text(
        "name: Existing CI\non: [pull_request, push]\njobs:\n  test:\n"
        "    runs-on: ubuntu-latest\n    steps:\n      - run: make test\n",
        encoding="utf-8",
    )
    result = run_child_cli(root)
    assert result.returncode == 0, result.stdout + result.stderr

    # Brownfield with no ci.yml.
    (root / ".github/workflows/ci.yml").unlink()
    result = run_child_cli(root)
    assert result.returncode == 0, result.stdout + result.stderr

    # Existing protections still apply inside the child fixture.
    (root / ".github/workflows/template-integrity.yml").write_text(
        "name: leftover\n", encoding="utf-8"
    )
    result = run_child_cli(root)
    assert result.returncode == 1
    assert "Template Integrity workflow" in result.stdout


# Valid: core-only project.
core = required(profile())
assert "docs/HANDOFFS.md" in core
assert "docs/DESIGN-SYSTEM.md" not in core
assert "store/AGE-CONTENT-RATINGS.md" not in core
assert "integrations/revenuecat.md" not in core

# Valid: web design project.
web = required(profile(design=True, platforms=["web"]))
assert "docs/DESIGN-SYSTEM.md" in web
assert "design/platforms/web.md" in web
assert "release/android-signing.md" not in web

# Valid: Android platform requires the Android signing contract.
android = required(profile(design=True, platforms=["android"]))
assert "design/platforms/android.md" in android
assert "release/android-signing.md" in android

# Valid: Apple + Google Play app-store project.
app_stores = required(
    profile(store=True, storefronts=["apple", "google-play"])
)
assert "store/apple.md" in app_stores
assert "store/google-play.md" in app_stores
assert "release/android-signing.md" in app_stores
assert "store/AGE-CONTENT-RATINGS.md" in app_stores
assert "store/JURISDICTION-MATRIX.md" in app_stores

# Valid: WordPress.org + Freemius does not pull app-store-only controls.
wordpress = required(
    profile(
        store=True,
        storefronts=["wordpress-org"],
        integrations=["freemius"],
    )
)
assert "store/wordpress-org.md" in wordpress
assert "integrations/freemius.md" in wordpress
assert "store/DATA-PRIVACY-DECLARATION.md" in wordpress
assert "store/AGE-CONTENT-RATINGS.md" not in wordpress
assert "store/JURISDICTION-MATRIX.md" not in wordpress
assert "release/android-signing.md" not in wordpress

# Valid: Huawei AppGallery also requires the Android signing contract.
huawei = required(profile(store=True, storefronts=["huawei-appgallery"]))
assert "store/huawei-appgallery.md" in huawei
assert "release/android-signing.md" in huawei

# Valid: RevenueCat-only integration.
revenuecat = required(profile(integrations=["revenuecat"]))
assert "integrations/revenuecat.md" in revenuecat
assert "store/README.md" not in revenuecat

# Invalid: Google Maps integration without design capability.
expect_error(
    profile(integrations=["google-maps"]),
    "Google design integrations require capabilities.design=true",
)

# Invalid: storefront without store-release capability.
expect_error(
    profile(storefronts=["apple"]),
    "Selecting storefronts requires capabilities.storeRelease=true",
)

# Invalid: unknown selector.
unknown = profile()
unknown["integrations"] = ["unknown-service"]
expect_error(unknown, "Unknown integrations")

# Invalid: generated/adopted repository accidentally left in template mode.
expect_error(
    profile(mode="template"),
    "Generated/adopted repositories must set repositoryMode to 'project'",
)

print("Project capability profile self-test matrix passed.")
