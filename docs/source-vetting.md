# Source Vetting

This artifact distills public-safe research scouting criteria into rules a clean implementation session can use. It should guide what the project treats as evidence, how claims are routed, and when a claim should be downgraded.

## Provenance

- author: long-running research scout, manually distilled
- source: repeated public-source triage and launch/research routing practice
- allowed content: public criteria, public-source handling, reusable verification rules
- forbidden content: raw chat history, private watchlists, credentials, private channel references, or personal identifiers

## Source Hierarchy

Use the narrowest source that directly proves the claim.

1. Primary artifact: official project page, paper, repository, changelog, documentation, job post, benchmark page, dataset page, or company announcement.
2. First-party social post: founder, lab, company, researcher, or maintainer announcing the artifact.
3. Independent corroboration: credible third-party coverage, user adoption, benchmark reproduction, customer evidence, or community technical discussion.
4. Aggregator signal: launch directories, newsletters, reposts, generic social amplification, or search snippets.
5. Unsupported context: rumor, anonymous claim, unlabeled screenshot, private pitch, or unverifiable internal claim.

Primary artifacts decide factual claims. Social traction can justify attention, but it should not be treated as proof that the product works.

## Claim States

- `supported`: the exact claim is backed by a primary artifact or strong independent corroboration.
- `weak`: the claim is plausible but only backed by self-description, early access pages, low-context social posts, or indirect evidence.
- `contradicted`: a source directly conflicts with the claim.
- `needs-human`: the claim depends on private domain knowledge, a customer interview, a founder answer, or a source that cannot be safely accessed.
- `out-of-scope`: the claim may be true, but it does not affect the current project decision.

Do not upgrade a claim because the surrounding project is exciting. A strong project can still contain weak claims.

## Routing Rules

Classify a source by the decision it can change.

- Research substrate: papers, datasets, benchmarks, eval harnesses, agent-runtime primitives, safety methods, or open-source infrastructure that should shape how the project is built.
- Launch substrate: new products, company strategy, deployment patterns, adoption signals, or market moves that affect positioning.
- Person or craft substrate: builders, writing, project portfolios, engineering culture, or taste references that shape who to study.
- Program substrate: fellowships, grants, accelerators, cohorts, deadlines, and verified application requirements.
- Reference shelf: durable reading material with no update stream. Store it as context, not as monitored news.

When in doubt, route by the artifact, not by the author's reputation.

## Evidence Thresholds

Promote an item when at least one of these is true:

- It introduces a new technical primitive the project can use.
- It changes the map of a market, role, or deployment pattern.
- It provides a reusable benchmark, dataset, source code, workflow, or public method.
- It is an official source with direct relevance to the project direction.
- It has unusually strong independent adoption or discussion for its domain.
- It fills a known blind spot in the current project plan.
- It shows a concrete real-world constraint being changed, such as cost, access, latency, reliability, or handoff burden.

Hold or skip when:

- The only proof is a launch page with generic claims.
- The only signal is paid promotion, repost volume, or directory placement.
- The artifact is a repeat of something already captured.
- The public link does not prove the claim being made.
- The item is interesting but does not change any project decision.

## Impact Check

For Build Day ideas, prefer artifacts with a hard before-and-after:

- specific person or group served;
- real constraint changed, not just information displayed;
- visible input-to-output demo;
- measurable delta such as cost, time, access, reliability, or quality;
- AI used as leverage inside a system, not as the whole product;
- public rights to the code, data, and assets used in the demo.

Avoid ideas where the main artifact is a dashboard, analyzer, advisor, or generic chatbot unless the workflow produces a concrete external action.

## Traction Calibration

Treat social metrics as attention evidence, not truth evidence.

- Likes, reposts, bookmarks, and views are useful for prioritization.
- A high bookmark-to-like ratio can indicate technical utility.
- High reposts with low likes can indicate promotion, bot-like spread, or coordinated amplification.
- Small-account source posts can still matter when backed by a strong primary artifact.
- A low-traction official post can still matter if the artifact is decision-relevant.

Never cite traction alone as proof of quality.

## Duplicate Checks

Before adding an item, check whether it is:

- the same artifact under a new announcement;
- a version update of an existing tracked project;
- a market-context update rather than a new launch;
- a repeated paper under a new aggregator page;
- a derivative writeup that should be attached to an existing source.

If it is a duplicate with new information, append the new fact to the existing item instead of creating a parallel record.

## Citation Discipline

Each report line should answer three questions:

1. What exact claim is being made?
2. Which source proves that exact claim?
3. What remains unproven?

Prefer citations that point to stable URLs. Avoid relying on screenshots unless the screenshot is the artifact being evaluated.

## Failure Conditions

Downgrade or reject a claim when any of these are present:

- The link is dead, gated, or unrelated to the described claim.
- The source only says "AI-powered" without a concrete workflow, artifact, or user.
- The product claims customers but does not name them or provide a verifiable deployment pattern.
- The benchmark lacks task details, verifier details, or contamination controls.
- The launch claims open source but the repository is empty, stale, or missing core code.
- The project claims production use but only shows waitlist, demo, or mock data.
- The source is materially conflicted and no independent corroboration exists.

## Output Contract

For each vetted item, produce:

- title
- source URL
- artifact type
- claim state
- one-sentence read
- evidence used
- weak side or open question
- routing recommendation

The one-sentence read should explain why the item matters for the project, not summarize the whole page.
