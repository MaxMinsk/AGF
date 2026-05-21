# Game-design Agent Cadence

> **Status: operational.** First pass: 2026-05-21.
> Companion to `agent.md` (role + file ownership) and the design docs
> (`gdd.md`, `visual-style.md`, `gameplay-systems.md`,
> `characters-and-visual.md`). This file answers a different question
> from `agent.md` — that one says **what** the game-design agent
> writes; this one says **when** and **how** to call it.

---

## 1. When to call the game-design agent

Four triggers, ranked by value. If none of these apply, calling the
agent is probably wasted effort — dev or QA is the right surface.

### 1.1 Pre-sprint planning (the highest-value trigger)

**Trigger**: dev is about to plan the next sprint.

**Why**: dev pulls from `backlog/proposed-stories/` at sprint-plan
time. A pre-sprint design pass drains the inbox, files anything
missing, and re-ranks priorities so the dev terminal isn't
guessing.

**Cadence**: once per sprint, on the day the previous sprint's PR
merges OR the day before the next sprint opens.

**Session shape**: ~30 minutes. Read the latest merged sprint
archive, diff intent vs reality in the GDD, top up the inbox.

### 1.2 Design decision needed

**Trigger**: a question landed that can't be answered by code or
test — "should we use Mixamo?", "should the character be
procedural?", "is friendly-fire on by default?"

**Why**: design decisions belong in `docs/game-design/`, not in
chat transcripts that disappear next session. The agent's job is
to record the call + the reasoning + update the relevant memory
so future sessions don't relitigate.

**Cadence**: ad-hoc, whenever the question surfaces.

**Session shape**: 15–60 minutes depending on depth. Usually:
think aloud → recommend → save memory + update GDD/sub-doc → file
proposal(s) if the decision unlocks new work.

### 1.3 Post-ship QA feedback that hits the design layer

**Trigger**: QA verified a story or the user tried the build and
said "this doesn't work in principle" — not "this is broken" but
"the design itself is wrong" (the S98 blast-prediction decal is
the canonical example).

**Why**: a design rejection needs to be recorded so dev + QA + a
future design session don't propose it again. Code revert is dev's
job; design memory + GDD update is the agent's job.

**Cadence**: ad-hoc, same day as the feedback if possible.

**Session shape**: 10–15 minutes. Save a `feedback-*` memory entry,
update the relevant section of GDD with the rejection + reason,
file a follow-up proposal if the rejection opened a gap.

### 1.4 Direction change

**Trigger**: the project's centre of gravity is moving — new sample
game, new MVP target, new audience hypothesis. The 2026-05-20
session that pivoted Kaboom Crew toward "modern network game" is
the canonical example.

**Why**: every dependent design doc needs a coordinated rewrite,
not piecemeal updates. The agent's job is to land the rewrite as
one coherent pass rather than five sprints of drift.

**Cadence**: rare — every 1–3 months at most.

**Session shape**: 1–2 hours. Big GDD revision, multiple sub-docs
touched, batch proposals filed.

---

## 2. When NOT to call the game-design agent

Listed explicitly so the boundary stays sharp.

- **Implementation, refactoring, code review** — dev terminal.
- **Verifying merged PRs against acceptance lines** — QA terminal.
- **Filing bug tickets** — QA terminal.
- **Running tests, fixing failures, debugging the build** — dev.
- **Daily status / standup-shaped check-ins** — there is nothing for
  the design agent to do day-to-day. Designs don't drift hourly.
- **Recording a proposal that's already fully formed in your head**
  — you can drop the JSON file directly into
  `backlog/proposed-stories/` yourself. The agent is for proposals
  that need *thinking*, not transcription.
- **Reviewing dev's implementation choices** — the agent specifies
  intent, not implementation. Pushback on "how dev chose to ship
  this" is QA's job (does it match acceptance?) or the user's
  (architecture call).

If you call the agent for one of the above, the right response is
"this is a dev / QA / direct-edit task" plus a redirect — not
silent compliance.

---

## 3. Minimum effective call (repeat sessions)

The first call in a new repo needs the full kickoff from
`agent.md §How to launch the game-design terminal`. Repeat calls
don't.

For repeat calls, this is sufficient:

```
you are the game-design agent. <trigger + specifics>
```

Examples:

- `you are the game-design agent. pre-sprint check before S101 — dev
  picking up GDP-007 (multiplayer). re-rank priorities, file what's
  missing.`
- `you are the game-design agent. user feedback: bombs feel too
  weak with default range=2 at hard difficulty. capture as design
  intent and propose if needed.`
- `you are the game-design agent. we're switching the sample game
  from Kaboom Crew to <X>. full direction-change pass.`

The agent has memory access; it will pull:
- `feedback-no-blast-prediction-decal` (don't propose blast decals)
- `project-procedural-characters` (no Mixamo, procedural path only)
- `project-flagship-sample-kaboom-crew` (sample identity)
- `feedback-workflow`, `feedback-language`, etc. (cross-session
  norms)

So you don't need to re-explain the project, the language rule, or
the rejection list. State the trigger; the agent fills in the rest.

---

## 4. What the agent does autonomously

No confirmation needed — the agent just does these.

- Update GDD when current sections clearly contradict reality
  (post-ship divergence, etc.).
- File proposed-stories with priority + epic + acceptance hints.
  Dev decides whether to promote.
- Close open questions in GDD / sub-docs when the user confirmed
  the call in chat.
- Refresh `MEMORY.md` index when adding a memory entry.
- Cross-link related docs (`see also` sections) when content drifts
  across files.
- Reorder priorities (`must` ↔ `should` ↔ `could`) within an
  existing proposal when scope shifts — this is design judgment,
  not user-facing.

---

## 5. What needs the user

- "Do X / don't do X in principle" calls (any rejection-on-principle
  rule).
- Out-of-scope additions when the user wants to revisit a previously
  rejected feature.
- Long-term scope direction (`when does MVP-2 close?`, `is MVP-3
  persistent world or polish?`).
- Sprint-level priority overrides ("multiplayer first, polish later"
  — that's the user's call).

The agent's default on these is to recommend + flag, not decide.

---

## 6. Memory contract — what the agent expects to be loaded

The agent reads the auto-memory system on every call. The relevant
state today (2026-05-21):

**Project memories:**
- `project-procedural-characters` — procedural mesh + animation,
  no Mixamo / authored rigs.
- `project-flagship-sample-kaboom-crew` — codename DynaBomber stays
  in notes; public name Kaboom Crew.
- `project-src-vite-entry` — engine boundaries.
- `project-pending-cyrillic-check` — repo-language CI.

**Feedback memories the agent must honour:**
- `feedback-no-blast-prediction-decal` — never propose on-floor
  blast prediction.
- `feedback-language` — Russian in chat, strict English in repo.
- `feedback-workflow` — auto-commit on Implemented, sprint loop
  conventions.
- `feedback-autonomy` — make reasonable calls and continue.
- `feedback-no-clipboard-state-transfer` — programmatic bridges
  only.
- `feedback-reuse-before-new` — grep engine primitives first.
- `feedback-qa-pr-finality` — don't push to a QA PR after it opens.
- `feedback-sprint-size` — default 8–12 stories per sprint.

When any of these go stale, the design agent should update them in
the same session that surfaced the change.

---

## 7. Hand-off rules

The design agent's outputs hand off to dev and QA. Sharp boundaries:

**To dev:**
- A new `*.story-proposal.json` lands in
  `backlog/proposed-stories/`. Dev picks it up at sprint-plan time
  via the (planned) `propose:promote` script. If the script doesn't
  exist yet, dev reads the file and creates the sprint story
  manually.
- An updated GDD / sub-doc means dev should re-read the relevant
  section before next sprint. The agent doesn't notify dev
  explicitly — the file change is the signal.
- A new epic referenced in a proposal (e.g.
  `KABOOM-CREW-CHARACTERS`) means dev creates the epic file in
  `backlog/epics/` when promoting the first story. The agent does
  NOT create epic files — that's outside its write-ownership.

**To QA:**
- A GDD section is the verification surface for "did the shipped
  feature match design?" QA reads the GDD; the agent never reads
  QA tickets to change design (because doing so would let bugs
  rewrite intent).
- If QA files a "design itself is wrong" ticket, that's trigger
  §1.3 — but the ticket alone doesn't change design; the user has
  to confirm the rejection-in-principle before the agent acts.

---

## 8. Sample session shapes

Three concrete patterns the agent has played out in 2026-05-20 /
2026-05-21. Use these as templates.

### 8.1 Direction-change session (~90 min, 2026-05-20)

1. Read the kickoff prompt (full one — new direction).
2. Read current state: `gdd.md`, the working notes, the example
   project, the active sprint.
3. Rewrite GDD top-to-bottom under the new direction.
4. File 5 proposed-stories covering the next 1–2 sprints under the
   new direction.
5. Summarise decisions + open questions back to the user.

### 8.2 Design-decision session (~60 min, 2026-05-20)

1. Receive a focused question ("procedural vs Mixamo?").
2. Pull current GDD + relevant sub-docs.
3. Write the trade-off analysis as a sub-doc
   (`characters-and-visual.md`).
4. Save a `project-*` memory locking the decision.
5. Update GDD + remove the now-closed open question.
6. File any proposals the decision unlocked.

### 8.3 Pre-sprint check (~30 min, projected)

1. `git pull --rebase origin main` mentally — read the latest
   `BACKLOG_ARCHIVE.md` entries to see what shipped.
2. List `backlog/proposed-stories/` — anything > 7 days old gets
   a re-check (still valid? still scoped right? still right
   priority?).
3. Diff GDD's "shipped" sections vs actual archive — flag drift.
4. File new proposals if a gap surfaced.
5. Report the inbox state + any priority shuffles to the user.

---

## 9. Anti-patterns

- **Calling the agent for an answer it can't give without a user
  decision.** If the question is "should we add X?", the agent
  recommends but doesn't decide. Calling the agent twice for the
  same recommendation doesn't change the decision — the user has
  to call it.
- **Calling the agent to "review" dev's PR.** PR review is dev's
  responsibility plus the optional `/review` skill. The agent
  reads merged work to keep design in sync, not to gate it.
- **Letting the agent run as a daemon ("watch the repo and tell
  me when design needs updating").** The agent is reactive, not
  proactive — there's no signal it could watch that would justify
  the polling cost. Use the four triggers in §1.
- **Cross-talking with the dev terminal in the same session.** The
  agent's write-ownership is non-overlapping with dev for a
  reason. If a session starts mixing implementation + design,
  split it: do design here, dev work in a separate session.
- **Mixing chat language and repo language.** Russian in chat is
  fine; everything written to the repo is English. The agent
  enforces this on itself; if a tool result leaks
  non-English content into the repo, the agent re-edits before
  closing the session.

---

## 10. Open operational questions

- **`propose:promote` script.** GDD agent.md mentions it as a
  planned dev-side helper analogous to `qa:promote`. Until it
  exists, dev does promotion manually. When it lands, the agent's
  archive-on-promote step will be automated.
- **Subagent definition (`.claude/agents/game-designer.md`).**
  Pending per `agent.md`. Once it exists, the kickoff prompt
  becomes implicit and §3 simplifies to "call subagent
  game-designer with <trigger>".
- **`engine doctor` proposed-story inbox warning.** S99 ships a
  `Proposed-story inbox: N pending (oldest: <date>)` line with a
  warning at > 7 days. When that line exists, the trigger §1.1
  pre-sprint check becomes "doctor warning fired → run the
  agent." Until then, the cadence in §1.1 is manual.
