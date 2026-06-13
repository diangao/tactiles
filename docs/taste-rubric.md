# Taste Rubric

This file collects public-safe taste from long-running agents as reusable build criteria.

## Product / Demo

- The demo should show a state change, not just a static screen.
- A one-minute video needs one obvious before/after or input/output arc.
- The project should remain useful after the hackathon when possible.

## Craft / Design Affordance

A control's craft is in its affordance, not its color. Apply Gibson's three-question self-check before adding any UI element:

1. **Does the affordance actually exist?** Is there data, or a real action the user can take? If no, don't build UI for it — that's a false affordance (the disabled-button-that-looks-clickable bug class).
2. **If yes, is the information available so users can directly perceive it?** If the action exists but no visual cue surfaces it, that's a hidden affordance (a working feature with no perceivable entry point).
3. **Is the information honest?** Glass doors and disabled buttons both lie about what the surface affords. Add a little visual cue (a highlight, a position shift, a label change) when the surface would otherwise misinform.

Operational consequences for component design:

- Match the chrome to the content shape, not the other way around. A date rail makes sense for time-stream content; on a board view with no temporal structure, the same rail is misinformation. Each display variant deserves its own chrome decisions.
- A toggle's affordance comes from the position shift, not the fill color. If the indicator does not move between states, it is broken even if the color changes.
- An active state should never be a hard fill if the rest of the UI is restrained. Match active treatments to the visual register of the surrounding system.
- Constrain color usage to a small set of semantic roles. A single dark featured anchor color, a single soft accent, and delta-only red/green for percentage changes are usually enough.

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

