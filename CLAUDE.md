# CLAUDE.md

The guide for agents in this repository is [AGENTS.md](AGENTS.md). Read it first; everything there applies.

The short version: principles in [PRINCIPLES.md](PRINCIPLES.md), decisions in [docs/decisions/](docs/decisions/README.md), behavior rules in [contract/rules.md](contract/rules.md). `main` is the released 3.x line and takes patch fixes; work for the next minor version targets `next`, which is merged into `main` when that minor is released. Layers point one way (protocol → core → vue → playground), plugins never import each other, the consumer owns lasting state, and one user action gives one `update:query`.
