# CLAUDE.md

The guide for agents in this repository is [AGENTS.md](AGENTS.md). Read it first; everything there applies.

The short version: principles in [PRINCIPLES.md](PRINCIPLES.md), decisions in [docs/decisions/](docs/decisions/README.md), behavior rules in [contract/rules.md](contract/rules.md). v3 work targets the `next` branch. Layers point one way (protocol → core → vue → playground), plugins never import each other, the consumer owns lasting state, and one user action gives one `update:query`.
