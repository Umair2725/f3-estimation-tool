---
name: motion-video
description: |
  Turn a feature explainer, product demo, or PR walkthrough of the F3 Estimation Tool into a brief and build it as a claude.ai Motion film (scrubbable, commentable, exports MP4).
  Use on "/motion-video", "make a video", "explainer video", "demo video", "animate this flow".
argument-hint: "<subject> [internal | management] [PR number or OpenSpec change] [screenshots or UI component path]"
user_invocable: true
---

# Motion Video

Build a short explainer, demo, or PR walkthrough of the F3 Estimation Tool as a film from the claude.ai **Motion** Artifact type. The type carries its own authoring instructions (style, colors and length form, scenes, score, export); this skill only shapes the brief and applies this repo's guardrails. Never restate or override the type's rules.

## Inputs

| Input | Required | Notes |
| --- | --- | --- |
| Subject | Yes | What the film explains or demos |
| Audience | Yes | `internal` (the build team, reviewers) or `management` (Folio3 leadership, estimators, anyone outside the build); decides the truth rule in step 3 |
| Beats | Yes | What the viewer sees, in order; drafted from the source when one is given, then confirmed |
| Source | No | The PR, the OpenSpec change, or the spec the film is about |
| Material | No | Screenshots, logo, brand colors, fonts, or a UI component path to recreate |
| On-screen text | No | Captions or labels; there is no voiceover |
| Length, aspect | No | Only when the user gives them; never ask (the Motion form owns style, colors, and length) |

## 1. Build the brief

Fill the inputs from `$ARGUMENTS`, the conversation, and the source. Ask once, in one message, for any required input still missing.

When the user says "just make it" (or "surprise me", "don't ask"), ask nothing: the audience defaults to `management`, the stricter rule in step 3, drafted beats stand as written, and a feature step 3 cannot settle is left out. State the defaults in one line before step 4, so the first revision can correct them. A missing subject is still asked, since there is nothing to draft from.

```text
Subject: <what the film explains or demos>
Audience: <internal | management>: <who watches it, and what they should understand or do afterwards>
Source: <PR, OpenSpec change, or spec, if any>
Beats:
1. <opening: the problem or the hook>
2. <step, screen, or idea>
3. <step, screen, or idea>
4. <closing: the outcome, call to action, or where the change lives>
On-screen text: <short captions or labels>
Material: <screenshots, logo, brand colors, fonts, or a UI component path to recreate>
Length: <seconds, only if the user gave it>. Aspect: <16:9, 9:16, or 1:1, only if the user gave it>
```

Beats describe what the viewer sees, never how it animates.

## 2. Gather material

- **Screenshots, logo, brand files:** use what the user attaches. Never invent a Folio3 logo or brand colors; leave a placeholder and name it in the close.
- **UI to recreate:** read the page or component under `src/app/` that owns the screen (on the source PR's branch when the change is unmerged), so the film matches the real screen. The UI uses the tokens in `src/app/globals.css` and the classes in `src/components/ui.ts`.
- **Data on screen:** fictional values only: the seeded clients (Northwind Clinics, Contoso Logistics, Fabrikam Energy), the sample requests, and the test users (Dev Estimator, Dev Tech Lead, Dev Architect, Dev Admin). Never real client names, estimates, rates, uploaded documents, or anything from `samples/`, `uploads/` or `local-data/`. Anyone who can open the film can read its store.

## 3. Check what is true

The spec for each feature the film shows is in `openspec/specs/<capability>/spec.md`; work still in progress is in `openspec/changes/<change>/`. The product brief (`docs/product-brief.md`) says what is planned, and which features are out of scope.

Then apply the audience's rule, and say which in the brief:

- **`management`:** show a feature as available only when its change is merged to `main` (check with `git merge-base --is-ancestor <commit> origin/main` after `git fetch`). Once the tool runs on AWS, "available" means deployed there. Planned features from the brief, open PRs and changes still in `openspec/changes/` are labelled "Coming soon" inside the film, or left out. Out-of-scope features (for example F-05) are never shown.
- **`internal`:** unmerged work may appear as it will behave, and the film says where it lives: an end card naming the PR or branch and its state (open or merged).

A feature that needs a service not set up yet (an Anthropic key with credit, SMTP, Google sign-in on the host) is shown only if it has been seen working, or labelled "Coming soon".

## 4. Create the film

1. Find the type: Artifact `action: "list"`, `scope: "types"`, `type_query: "Motion"`. Use the `type_url` it returns.
2. Create the film with that `type_url` and a `title` naming the subject (never "Video"), then follow the type's instructions with the brief as the request.

## 5. Revise and hand off

Reviewers pin comments to a moment or a time range on the timeline; apply each round in one pass by the type's revising rules. The finished film's **Export** button saves MP4 or GIF. The film is private until the user shares it.
