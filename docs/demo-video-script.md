# ScriptOps demo video — recording script

Target runtime: **2:50–2:58**. The narration below is about 3,000 characters. Record at a calm ElevenLabs pace and leave the described pauses; trim pauses, not product footage, if needed.

## Full narration

Film production plans become stale the moment a screenplay changes. A producer may be told that a scene has moved to a rainy night, gained a child witness, or now needs a controlled vehicle sequence. But the consequence is scattered across the shooting schedule, budget, locations, casting, permits, and safety notes. That is the production friction ScriptOps is built to solve.

ScriptOps is a private, human-supervised production workspace. I start with an uploaded screenplay, then review the scenes before any planning work begins. Here, every accepted scene keeps a link to its source material, and parser warnings must be acknowledged. The producer is in control of the input before the system spends generation budget or produces a plan.

From that reviewed screenplay, ScriptOps builds one connected baseline: scene breakdown, shooting schedule, budget band, locations, and casting briefs. The work is durable on Google Cloud. Cloud Run hosts the application, Firestore preserves the project and approved versions, Cloud Tasks runs the staged workflow, Cloud Storage holds private source files and exports, and Gemini on Vertex AI generates schema-checked planning stages.

The critical research layer is Parallel. This is not a decorative search box. ScriptOps calls Parallel Search at runtime to find current, cited production evidence: permit and location risks, cost assumptions, child-performer requirements, night-work limits, and safety constraints. That evidence is validated for relevance and freshness, then attached to the plan. If the required coverage is missing, the plan does not quietly continue.

Now for Revision Ripple. I select this approved scene and describe a real change: move it to a rainy night, add a child witness, and make the escape a controlled stunt. ScriptOps creates a complete proposal while keeping the approved baseline immutable. In the proposal, the producer can see the schedule impact, the budget range, candidate locations, casting implications, and the retained evidence that supports those conclusions.

Nothing changes just because the model produced an answer. The producer can inspect the proposal, discard it, or explicitly approve it. Approval creates an immutable next plan version atomically, so a partial schedule or budget update can never silently overwrite the production baseline. The plan history retains earlier approved versions, and each version can be exported as an owner-scoped production PDF.

ScriptOps turns a screenplay change from a chain of disconnected follow-ups into a reviewable production decision. It combines Gemini on Google Cloud with Parallel’s current evidence to give producers a deterministic, multi-step workflow: review the source, research the constraints, see the ripple, and approve the full plan only when it is ready.

## Scene-by-scene recording plan

| Time | Length | Picture and action | Narration section | Transition |
| --- | ---: | --- | --- | --- |
| 0:00–0:18 | 18s | Open on the ScriptOps project screen; slowly pan from selected screenplay scene to the five production artifact cards. Add a small title overlay: “A screenplay change changes everything.” | Paragraph 1 | Fade from black; gentle push-in. |
| 0:18–0:40 | 22s | Show the accepted-scene review. Briefly expand one source block and show the parser-warning acknowledgement area. | Paragraph 2 | Straight cut on “private, human-supervised.” |
| 0:40–1:03 | 23s | Scroll across the approved production artifacts: breakdown, schedule, budget, locations, casting. If needed, use a restrained callout label over each card. | Paragraph 3 | Match cut from the accepted scene to the plan badge. |
| 1:03–1:30 | 27s | Show the evidence/provenance panel or approved-plan details containing citations. Use a single compact architecture overlay only if the runtime flow cannot be seen in the product. | Paragraph 4 | Cross-dissolve; animate a subtle path from Parallel evidence to plan evidence. |
| 1:30–2:03 | 33s | Return to the selected scene. Type the rainy-night/child-witness/controlled-stunt change, click propose, then cut to the finished proposal. Show schedule, budget, locations, casting, and evidence summaries. | Paragraph 5 | Hard cut on “Now for Revision Ripple”; use a brief speed ramp only while the job is running. |
| 2:03–2:31 | 28s | Hold on the explicit Approve and Discard buttons; show the approved Plan v3 history and one export entry. Do not show a real external document with sensitive data. | Paragraph 6 | Slow zoom out; cut from the proposal to version history after “approve it.” |
| 2:31–2:55 | 24s | End on the workspace with the selected scene and plan history. Overlay: “Review source. Research constraints. Approve the ripple.” | Paragraph 7 | Fade to title card and repository/hosted-project URLs. |

## Visual direction

- Record the actual hosted product for almost all shots. Use a synthetic screenplay and avoid personal data.
- Keep cuts purposeful and the cursor slow. Pause for roughly one second after each important state change so judges can read it.
- Use no more than two static cards: the opening title and the final URL card. A compact architecture overlay during the Parallel explanation is optional, not a separate presentation.
- Export in 1080p with English narration or subtitles. Keep the final runtime under 3:00.
