# CLAUDE.md

This document describes how I prefer to work together on software projects.

## Core Principles

- Build software incrementally.
- Prefer simple, maintainable solutions.
- Optimize for readability over cleverness.
- Avoid unnecessary abstractions.
- When multiple reasonable approaches exist, explain the trade-offs before choosing.

---

# Development Process

Do **not** attempt to build an entire feature in one iteration.

Instead:

1. Understand the problem.
2. Propose a plan.
3. Wait for approval if the architecture is changing significantly.
4. Implement one logical milestone.
5. Stop and allow review before continuing.

I prefer many small successful iterations over large autonomous coding sessions.

---

# Architecture

Before introducing a new library, framework, service, or dependency:

- Explain why it is needed.
- Consider whether the existing stack already solves the problem.
- Prefer fewer dependencies.

Avoid premature optimization.

Design for future extension, but don't build features I haven't requested.

---

# Long Running Tasks

If a task is likely to take more than a few minutes:

- Tell me first.
- Let me choose whether to run it myself.
- If it is appropriate for you to run it, display progress as work proceeds.

Avoid long periods without visible progress.


---

# Refactoring

Refactor opportunistically when working in an area.

Avoid large "cleanup" passes unless requested.

Keep changes localized.

---

# Documentation

Explain architectural decisions.

Code should generally be self-documenting.

Prefer concise comments explaining *why* rather than *what*.

---

# When Unsure

If there are multiple reasonable options:

- Don't guess.
- Present the alternatives.
- Recommend one.
- Explain why.

---

# UI

Prefer clean, minimal interfaces.

Functionality is more important than visual polish in early versions.

---

# Testing

Prefer small testable components.

Write tests for non-trivial logic.

Avoid excessive boilerplate.

---

# Performance

Do not optimize prematurely.

Make the design correct first.

Measure before optimizing.

---

# Communication

Keep responses concise.

When beginning work:

- Briefly explain what you plan to do.
- State any assumptions.
- Mention any risks.

When finishing work:

- Summarize what changed.
- Mention anything I should review.
- Suggest the logical next step.

---

# Problem Solving

When solving a problem:

- Understand the underlying issue instead of patching symptoms.
- Prefer root-cause fixes.
- Keep solutions as simple as possible.

---

# Libraries

Prefer well-supported open-source libraries over writing infrastructure from scratch.

Avoid unnecessary dependencies.

---

# My Preferences

I value:

- clean architecture
- maintainable code
- incremental progress
- thoughtful design
- readable code

more than rapid feature development.

I would rather spend an extra hour designing something well than spend days replacing it later.

---

# Default Assumption

If I haven't asked for something, don't build it.

Implement the smallest solution that satisfies the current milestone while keeping future extension straightforward.