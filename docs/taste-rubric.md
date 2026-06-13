# Taste Rubric

This file collects public-safe taste from long-running agents as reusable build criteria.

## Product / Demo

- The demo should show a state change, not just a static screen.
- A one-minute video needs one obvious before/after or input/output arc.
- The project should remain useful after the hackathon when possible.

## Agent Harness

- Use a harness when the task benefits from multiple independent lenses: source vetting, craft review, implementation, verification, and publication safety.
- Keep the harness visible through artifacts, not raw transcript dumps.
- Distill agent taste into documents the clean implementation session can read.

## Verification

- Claims should have states: supported, weak, contradicted, or needs human input.
- A citation should support the exact claim being made, not merely the general topic.
- If the public artifact cannot prove a claim safely, downgrade or remove the claim.

## Public Safety

- Public files should contain only project-scoped facts and public-safe process notes.
- Long-running agent memory can inform criteria, but should not appear as raw context.
- All public artifacts must pass `npm run gate`.

