# Scripts

Put repeatable project automation here.

Good candidates include:
- local validation wrappers;
- deterministic build helpers;
- release-preparation checks;
- schema validation;
- code generation;
- artifact checksums;
- environment sanity checks.

## Script rules

Scripts should:
- be safe to rerun where practical;
- fail clearly on error;
- avoid embedding secrets;
- document prerequisites;
- avoid destructive production actions by default;
- support CI use where useful.

Prefer a single documented validation entry point such as `scripts/validate` once a project's stack is known.


## Master-template validation scripts

- `validate_project_profile.py` — validates `config/project-profile.json`, capability dependencies, and the files required by selected packs. Generated/adopted projects keep this script because Project Baseline uses it.
- `test_validate_project_profile.py` — master-template self-test for representative capability combinations used by Template Integrity CI. A generated greenfield project may remove it during bootstrap unless that child deliberately maintains or extends capability-validator behavior.

Keep capability-selection logic in the versioned validator rather than duplicating it inside workflow YAML.
