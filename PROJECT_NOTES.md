# Ant Colonies — project notes

This is the persistent record of requirements, proposals, findings, and open questions from project conversations. Read it before planning or changing the project. Update it when a conversation establishes something useful for future work; keep proposals distinct from decisions.

## Confirmed requirements

- Build a game/simulation of ant colonies with a basis in ant colony optimization (ACO).
- Run it on the web.
- Start simple and expand incrementally.
- Plan before implementing the simulation.
- Preserve conversation learnings and findings in this file.
- Maintain an `AGENTS.md` that directs agents to this file and a basic `README.md`.
- Prioritize a relaxing sandbox with a basic UI.
- Represent ants as dots for now; do not implement detailed ant graphics.
- Use TypeScript and Vite; Canvas 2D remains proposed.
- Ask a couple of design questions before implementation and store the answers in `AGENTS.md` as well as these notes.
- Start with one colony and allow clicking to place food.
- Food does not replenish automatically; the colony depends on user-supplied food.
- Running out of food must affect colony population.
- More food can cause population growth, including recovery from earlier losses while the colony is alive.
- Colonies can go extinct. An extinct colony cannot revive, even if more food is added.

## Proposed product direction

Begin as an observable ant-foraging sandbox. The player places food and watches one colony discover and reinforce routes. Food availability affects the colony's population. Obstacles are a later possibility; objectives are optional.

The initial simulation should be inspired by ACO rather than presented as a biologically accurate model or a formal optimizer. ACO ideas to make visible are decentralized exploration, probabilistic route choices, pheromone reinforcement, and evaporation. Shorter successful round trips can receive more reinforcement opportunities, helping efficient routes emerge without guaranteeing the shortest route.

The relaxing sandbox direction, food placement, and food-dependent population are confirmed. Other mechanics below remain recommendations pending discussion. Objectives and deeper colony management are optional future ideas, not planned requirements.

## Proposed first playable version

### World and behavior

- A small, bounded, two-dimensional grid rendered from above.
- One colony with a fixed nest, user-placed finite food patches, and a population of worker ants. Each click adds a fixed amount of food; exact placement rules and quantities remain proposed.
- Each ant has a position, heading, and one of two states: searching or returning with food.
- Searchers choose among nearby traversable cells using a weighted random choice: exploration, heading persistence, and attraction to food-trail pheromone. Keep some chance of exploration even on strong trails.
- Finding food consumes one unit and switches the ant to returning. Reaching the nest delivers it and resets the ant to searching.
- For the first version, returners navigate toward the nest with a simple local direction heuristic and deposit food-trail pheromone. This deliberate simplification lets us demonstrate trail formation without solving nest navigation first.
- Pheromone evaporates over simulation time and has a bounded intensity. Start without diffusion; add it only if needed.
- Start with no obstacles. Obstacle placement depends on a return-navigation approach that can handle detours.
- Confirmed population behavior: food supports growth while the colony is alive; shortages can reduce population; reaching zero population is permanent extinction for that colony. Adding food after extinction cannot trigger growth or respawning.
- Proposed population model: delivered food fills a shared nest reserve; population consumes that reserve over simulation time. Sustained depletion triggers gradual population loss after a grace period. A sustained surplus funds new workers at the nest. Consumption, growth costs/rates, grace period, and population cap remain to be tuned.

### Interface

- Canvas showing ants, nest, food, and an optional pheromone heatmap.
- Pause/resume, reset, and simulation speed controls.
- Click the world to add food patches, including while paused.
- Adjustable initial ant population and pheromone evaporation rate with sensible defaults and limits. Live population follows the food model rather than a population slider.
- Display colony food reserve, active ants, and elapsed simulation time; give a quiet visual indication when food is low.
- Clearly indicate extinction. Reset starts a new colony; it does not revive the previous colony.
- Show the random seed and allow replaying a reset with the same seed and settings. Reproducing interactive runs also requires the same food-placement inputs at the same simulation steps.

### First-version acceptance checks

- From a fresh seeded run, ants explore, collect food, return, and increase the delivered-food counter.
- For selected demonstration seeds, repeated trips produce a visible pheromone trail; stochastic behavior means not every run must converge.
- Changing evaporation visibly affects trail persistence.
- Clicking adds finite food; food never replenishes automatically.
- Delivered food supports the colony, sustained starvation reduces population, and timely feeding can prevent starvation losses under the chosen population rules.
- Sufficient food allows a living colony to grow, including recovering from population losses.
- A colony can reach zero population; subsequent food placement and simulation steps never revive it. Reset creates a new colony.
- Pause freezes simulation state, speed changes simulated time consistently, and reset restores the initial state.
- Replaying the same seed, settings, food-placement inputs, and simulation steps produces the same state.
- The simulation remains responsive at the default population in a modern desktop browser; establish a measured performance target during implementation.

## Proposed technical approach

- Confirmed: TypeScript and Vite. Proposed renderer: Canvas 2D for a lightweight browser application.
- Plain HTML/CSS controls initially; introduce a UI framework only if the interface warrants it.
- Keep the simulation engine independent of rendering and browser events.
- Advance the engine in fixed simulation steps; render with `requestAnimationFrame`. Limit catch-up work so a stalled tab cannot freeze the UI.
- Use a seeded random-number generator and store simulation parameters together.
- Represent pheromone as a grid of numeric values, with ants stored separately.
- Start entirely in the browser, with no backend, accounts, or database.
- Consider a Web Worker only if profiling shows simulation work causes UI delays.

Suggested structure when implementation begins:

```text
src/
  simulation/  # World, ants, pheromone, seeded randomness, stepping
  rendering/   # Canvas drawing and world/screen transforms
  ui/          # Controls and input handling
  main.ts      # Application wiring
```

## Incremental roadmap

1. **Foraging and feeding foundation:** build the first version above, including click-to-place food and food-dependent population. Verify trail formation, starvation behavior, and repeatable runs before expanding.
2. **Interactive terrain:** expand food editing and add obstacles alongside detour-capable return navigation. Observe recovery when a route is blocked.
3. **Optimization experiments:** add controlled layouts with competing routes and compare discovery time, food throughput, and route length across seeds. Introduce stronger ACO rules if useful, such as rewarding successful routes by their length.
4. **Game loop:** choose a small objective, such as delivering a food target within a time limit or surviving on a food budget. Add resource costs and upgrades only once the basic loop is fun.
5. **Colony depth:** consider competing colonies, specialized workers, changing environments, and larger worlds individually, guided by playtesting and performance.

Each phase should leave a usable simulation. Avoid committing to later mechanics before testing the current phase.

## Validation approach

- Unit checks for state transitions, food accounting (including consumption and proposed growth costs), starvation and growth, permanent extinction, pheromone evaporation/bounds, and seeded repeatability with identical inputs.
- Deterministic simulation scenarios for integration checks; evaluate emergence across multiple seeds rather than using a fragile single-run shortest-path assertion.
- Browser checks for controls, rendering, resizing, and responsiveness.
- Record observed behavior and measurements here. Do not label expected behavior as an experimental finding.

## Open questions

- How quickly should starvation reduce population, and what initial food reserve/grace period keeps the sandbox relaxing?
- What growth rate, food cost, and population cap keep expansion readable and performance predictable?
- Is a stylized grid aesthetic appropriate, or should rendering eventually look organic with smooth ant motion?
- How closely should later versions follow formal ACO algorithms versus intuitive colony behavior?
- Is mobile/touch support needed in the first version, or can it follow desktop interaction?

## Findings and risks

- Repository inspection on 2026-11-05 found no application files or existing project documentation.
- ACO inspiration does not by itself define a game loop; objectives remain an explicit later design choice.
- Direct nest navigation is suitable for an unobstructed first world, but obstacles require a navigation change.
- Evaporation, exploration, and deposition must be tuned together. Strong feedback can trap ants on a poor route; weak feedback can prevent stable trails.
- No simulation has been implemented or experimentally validated yet.

## Conversation log

### 2026-11-05 — Initial planning

- User requested a web ant-colony game/simulation based on ACO, starting simple and growing over time.
- User requested persistent conversation notes, agent instructions referencing them, and a basic README.
- Created the initial proposal, roadmap, and documentation. Implementation and technical choices remain proposed until discussed or authorized.

### 2026-11-05 — Sandbox direction and pre-implementation questions

- User chose a relaxing sandbox direction, basic UI, and dots to represent ants.
- User accepted TypeScript and Vite.
- User requested a couple of questions before implementation, with the results stored in `AGENTS.md`.
- Asked about first-version food placement and automatic food replenishment; answers are pending. No implementation has started.

### 2026-11-05 — Food interaction and population answers

- User chose click-to-place food and one colony to start.
- User chose manual food supply, with no automatic replenishment, and specified that running out of food should affect colony population.
- Recorded these answers in `AGENTS.md` and updated the first-version scope.
- Proposed a shared food reserve with consumption and gradual starvation losses; exact population dynamics remain undecided. No implementation has started.

### 2026-11-05 — Growth and permanent extinction

- User confirmed that more food can grow the colony and restore lost population while it is alive.
- User confirmed that a colony can die out completely and cannot come back alive.
- Recorded these decisions in `AGENTS.md`. Extinction is terminal for the colony; reset is interpreted as creating a new colony.
- Exact consumption and growth rules remain proposed/tunable. No implementation has started.
