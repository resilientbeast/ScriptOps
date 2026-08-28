# Learner Profile

## Participant

- Name: Arkadiusz Hukalowicz
- Background: Early-stage builder with minimal coding experience, using TypeScript and AI coding assistants.
- What brought them to the hackathon: Not collected; onboarding intentionally does not ask this question.

## Project Idea

- Initial idea: **ScriptOps**, a human-supervised pre-production system for indie producers. It converts a screenplay into five connected artifacts—scene breakdown, shooting schedule, budget band, grounded location options, and casting briefs—and uses **Revision Ripple** to propagate an approved script or production change through all five with an explainable before/after impact view.
- Primary user: Indie producer. First assistant directors and production managers are downstream collaborators, not the primary persona.
- Signature moment: Revision Ripple. One approved change visibly cascades through scenes, schedule, budget, locations, and casting, proving coordinated multi-agent behavior rather than one-shot report generation.
- Demo input strategy: Lead with a polished pre-loaded screenplay for reliability; retain PDF upload as a brief proof that the product is not hardcoded.
- Scope fallback order: Protect schedule and budget first, then locations, then casting briefs if time compresses. The intended MVP still updates all five artifacts.

## Technical Experience

- Experience level: Minimal coding experience.
- Languages/frameworks known: TypeScript; no framework preference stated yet.
- AI coding tools used before: AI coding assistants.
- Prior experience planning before coding: Not stated; provide explicit architecture, contracts, acceptance criteria, and verification guidance.

## Build Preferences

- Preferred pace: Structured and decisive, with enough explanation to understand the product and safely direct AI coding assistants.
- Likely support needs: Conservative stack choices, annotated file structure, explicit data flow, copyable commands, small verifiable stages, and early de-risking of PDF parsing and external APIs.
- Notes for downstream commands:
  - Preserve the value proposition: **nothing gets dropped when things change**.
  - Visual metaphor: an air traffic control tower at night—quiet, dark, precise, and calmly tracking many moving dependencies.
  - Product feel: borrow Linear's restrained dark UI, sharp typography, fast state transitions, and operational trust.
  - Base experience should be 95% calm, professional, and boring-competent. Concentrate the cinematic expression in the Revision Ripple sequence.
  - Ripple motif: a script edit drops like a stone; concentric rings reach schedule, budget, locations, and casting in sequence, illuminating each as its update completes.
  - Palette: near-black surfaces with one warm amber/gold accent reserved for ripple animation and active states.
  - Typography: clean geometric sans for interface chrome; monospace for budgets, timecodes, and precision data.
  - Intended post-ripple emotion: control—complexity has resolved itself without creating five new coordination tasks.
