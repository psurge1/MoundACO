# Agent instructions

Read [PROJECT_NOTES.md](PROJECT_NOTES.md) before planning or changing this project. It is the persistent record of requirements, conversation learnings, findings, proposals, and open questions.

- Update `PROJECT_NOTES.md` when conversations establish requirements, decisions, useful findings, or changes in direction.
- Clearly distinguish confirmed requirements, proposed choices, and experimentally verified findings. Do not silently promote a proposal into a user decision.
- Keep the project incremental: implement and verify a small usable step before adding complexity.
- Follow the latest user instructions when they supersede these notes, and record the change.
- Keep `README.md` accurate as setup, commands, and features become available.

## User design decisions

- Aim for a relaxing sandbox.
- Keep the UI basic.
- Represent ants as dots for now; do not implement detailed ant graphics.
- Use TypeScript and Vite. Canvas 2D remains the proposed renderer.
- Start with exactly one colony.
- Allow the user to click to place food in the first version.
- Food does not replenish automatically; ants depend on the user adding more.
- Running out of food must affect colony population.
- More food can grow the colony, including restoring population lost to shortages, while the colony is still alive.
- A colony can die out completely. Extinction is permanent for that colony: food cannot revive it, and it must never automatically respawn.
- Record design answers in this file as well as the project notes.

## Population model still to refine

- Proposed: delivered food enters a shared colony reserve, consumed over simulation time according to population. Sustained depletion gradually reduces population after a grace period.
- Consumption rate, grace period, growth rate/cost, and population cap remain undecided. Do not treat the proposed reserve model as an explicit user decision.
- Treat extinction as a terminal state when population reaches zero. A reset, if provided, starts a new colony rather than reviving the extinct one.
- The two pre-implementation questions have been answered. The project remains in planning until implementation is requested.
