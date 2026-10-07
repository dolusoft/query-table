# 0009 npm as the only package distribution channel

Status: Accepted (2026-10-07), decided by Zahid. Supersedes the package tarball distribution part of [0006](0006-release-3.md).

## Context

Since 3.0.0, the three packages have been distributed as GitHub Release tarballs. Consumers installed the Vue tarball and mapped its protocol and core dependencies to release assets with `overrides`. The packages are now on npm at 3.1.0, with trusted publishing and SLSA provenance. No consumer installs from a package tarball URL or listens for the release dispatch.

## Decision

- npm is the only distribution channel for the three packages.
- `.github/workflows/release.yml` publishes through npm trusted publishing behind the `release` environment, with provenance. Both `npm` and `publish` retain the environment's reviewer gate.
- The GitHub Release keeps its notes and `conformance-<revision>.tgz` asset, as promised by ADR 0008 for runners that do not install the package. Package tarballs are not uploaded.
- Verification still packs all three packages for npm publishing and tests their installation outside the workspace.

## Consequences

- Consumers install by package name and version; the protocol and core resolve as dependencies without `overrides`.
- There is no consumer repository dispatch; consumers choose when to upgrade.
- Local tarball overrides remain in the pack-install check to simulate registry dependency resolution before publishing.
- ADR 0006's original acceptance text remains as history.

## Trade-off

Consumers need access to npm for packages, rather than a GitHub Release package URL. The conformance suite remains directly downloadable for independent runners.
