# 0019 Release versions: the next minor or the next patch, never a major

Status: Accepted (2026-10-23), decided by the repository owner.

## Context

Nothing stopped a pull request or a tag from carrying `4.0.0`, or from skipping a number (`3.11.1` → `3.14.0`). The owner does not release major versions, and consumers install by exact version (ADR 0009).

## Decision

- No major release. A breaking need enters as an opt-in addition in a minor.
- A released version is the next minor (`3.12.0` → `3.13.0`, patch 0) or the next patch (`3.12.0` → `3.12.1`) of the latest released `v*` tag, ordered by semver. Pre-release suffixes are not released.
- `scripts/check-release-version.mjs` enforces it. CI runs it on every pull request (a version equal to an existing tag, that is no bump, passes). The `version` job of `release.yml` runs it with `--release`, leaving the tag being released out of the comparison, so a re-run of the latest tag passes.

## Consequences

- A wrong version turns the pull request red, before the tag.
- The tags must be fetched (`fetch-tags: true`) in both workflows.
- Re-running the release of an older tag after a newer one exists fails ("not greater"); that is intended.

## Trade-off

A real breaking change cannot ship under a new major without superseding this record first.
