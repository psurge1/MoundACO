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
- Keep the UI bare bones and minimal: no header, title/hero section, branding, decorative panels, or promotional copy. The simulation is the page; use compact native controls and functional labels.
- Limit prolonged exploration to a small scout minority; discourage repeated unproductive foraging and bring unsuccessful workers home.
- Pheromone trails should look smooth rather than pixelated or blocky.
- Use pleasing, restrained colors with stronger distinctions between nearby and medium/high-strength trails. Overlaps should darken progressively and may eventually blend, but not too early.
- Next planned milestone: several rival colonies competing for food, territory, and potentially other resources. Discuss behavior before implementation; [RIVAL_COLONIES.md](RIVAL_COLONIES.md) holds the detailed discussion. Each colony's nest, ants, and trails should share a color family.
- Generate maps procedurally with obstacle regions and no unreachable open pockets.
- Allow multiple discovered paths to compete and become stronger based on efficiency over time; do not immediately supply ants with the optimal return path.
- Add a subtle energy/distance cost to encourage efficiency indirectly. Do not hard-code optimal decisions or guarantee convergence; evaluate whether physical costs and feedback can produce improvements.
- Represent ants as dots for now; do not implement detailed ant graphics.
- Use TypeScript and Vite. Canvas 2D was selected during implementation.
- Ask a couple of design questions before implementation and store the answers in `AGENTS.md` as well as these notes.
- Start with one colony and allow clicking to place food.
- Food does not replenish automatically; the colony depends on user-supplied food.
- Running out of food must affect colony population.
- More food can cause population growth, including recovery from earlier losses while the colony is alive.
- Colonies can go extinct. An extinct colony cannot revive, even if more food is added.

## Implemented first version

The user authorized implementation after the design questions were resolved. The application lives in `web/` and uses TypeScript, Vite, plain HTML/CSS controls, and Canvas 2D.

The initial single-colony version described below has now been extended with rival colonies. See the current implementation and verification section in [RIVAL_COLONIES.md](RIVAL_COLONIES.md) and the latest log entry for the effective behavior. Earlier proposals and test counts below are historical.

- One colony with dot-based workers, a fixed central nest, click/tap/keyboard food placement, finite food patches, local exploration, obstacle-aware return navigation, and an evaporating pheromone grid.
- Procedural obstacle regions use a random stream derived from the map seed independently of ant behavior. Flood fill from the nest identifies disconnected cavities and converts them into solid terrain. All remaining open cells connect through cardinal passages wide enough for ant dots; diagonal-only connections are not counted.
- An 80-unit protected nest clearing supports spawning and initial food placement. Searchers avoid walls and only detect nearby visible food. Both loaded and empty returners retrace their own recorded outbound route. The map distance field is used for connectivity/diagnostics, not ant steering. Food placement requires its whole patch to fit; blocked cells receive no pheromone deposits.
- Smooth continuous ant positions over a grid-based pheromone field; no visible movement grid or illustrated ant sprites.
- One in eight spawned ants scouts farther. Workers begin with 14–20 simulated seconds and may gain one 10-second extension from a real pheromone trail outside the nest clearing; scouts have 45–65 seconds. Empty returners retrace their route without depositing food pheromone, then choose a new departure direction.
- Route memory erases revisited loops and straightens only nearby visible bends (within 24 units). Detours around different sides of obstacles remain distinct. Loaded returners now deposit a uniform 0.6 pheromone per actual unit walked. The prior route-quality and return-time multipliers were removed for the energy experiment. Base speeds are 55 units/s for empty returns, 45 for loaded returns, and 40 for searchers, with a soft fatigue factor of 0.9–1.
- Ants have 100 energy, spending 0.012 per actual unit walked (15% extra when loaded). Both outbound and return travel count, including wandering that disappears from route memory. Returning ants rest at the nest until energy recovers at 8 per simulated second. Fatigue never immobilizes or directly kills an ant; ordinary starvation still applies. Recovery needs no additional food charge or reserve threshold.
- Worker departures favor locally advertised pheromone routes. Failed trips reduce the priority of their original departure direction; that penalty fades with a 40-second half-life, so an area can be reconsidered later. Scouts retain more heading persistence and less trail attraction to reach undiscovered areas.
- Pheromone sensors and deposits interpolate between cell centers. A display-only blur and a 4× interpolated opacity raster produce soft trail edges without displaying grid cells or changing the simulation's evaporation.
- World colors use earth-brown ground, darker brown obstacles, and olive food. A separate `ColonyPalette` supplies matching nest, ant, and trail colors, with teal as the current default. Carried food is a small olive dot within the ant body. Renderer/raster instances accept a colony palette; only one colony is simulated.
- Display contrast now uses a narrower `[1, 6, 1] / 8` blur, a light-to-deep colony-color ramp across density 0–12, and opacity `245 * density / (density + 4)`. Neighboring paths retain a valley and high-strength signals keep changing visibly before reaching the existing field cap. Field values and ant behavior are unchanged.
- Shared food reserve supports consumption and surplus-funded births. Population can recover while alive; zero population is terminal. New colony clears the world and starts a separate colony.
- Pause/resume, 0.5×/1×/2×/4× speed, trail visibility, trail half-life, starting population, map seed, and energy on/off controls, plus an average-energy readout. Initial population and seed changes apply on reset. `New map` chooses a fresh seed and starts a new colony; `New colony` reuses the selected seed and energy setting.
- Starts without food patches; the user supplies all world food. A small initial nest reserve provides time to experiment.
- Fixed 30 Hz simulation, seeded random choices, bounded frame catch-up, and no progression in hidden tabs. Runs entirely in the browser; no backend or saved sessions.
- Minimal responsive UI uses a viewport-filling simulation area, compact native controls and stats, collapsed settings, and plain status messages. There is no header, title section, sidebar, decorative backdrop, or external font dependency.

### Initial tuning (implementation choices)

| Parameter | Default |
| --- | --- |
| World | 1000 × 640 simulation units |
| Initial workers | 48 (12–120 selectable for a new colony) |
| Initial nest reserve | 36 food units |
| Food per click | 80 units |
| Consumption | 0.006 food units per worker per simulated second |
| Growth condition | Reserve exceeds `population * 0.9 + 8` |
| Growth cost / interval | 4 food units / one birth per 3 seconds of sustained surplus |
| Population cap | 350 workers |
| Starvation grace | 15 seconds of continuous empty reserves |
| Starvation loss | 3% of workers rounded up every 1.5 seconds after the grace period |
| Trail half-life | 22 simulated seconds (adjustable 5–60) |
| Ant energy | 100 maximum |
| Movement energy cost | 0.012 per unit, ×1.15 while carrying |
| Nest recovery | 8 energy per simulated second |
| Fatigue slowdown | Up to 10%, with no immobilization |

### Verification and findings

- Thirty-four automated tests pass, covering foraging, population, accounting, repeatability, smooth fields, map connectivity, remembered routes, competing trails, and energy. Rendering regressions also check progressive darkening, high-strength contrast, separation between nearby paths, and independent colony palettes with a shared strength/opacity scale.
- TypeScript checks and the Vite production build pass.
- The local Vite page returns HTTP 200. Browser automation could not open the app because its access host is unavailable; visual layout, browser interactions, and browser frame rate remain unverified.
- An isolated Node engine benchmark advanced 60 simulated seconds in approximately 68 ms with 48 starting ants and 102 ms with 350 starting ants, using one food patch with ten clicks of food. These exclude rendering and are not browser frame-rate measurements.
- Initial dependency installation needed network access outside the sandbox. The test runner uses `node --import tsx --test` to avoid the CLI's sandbox-incompatible IPC listener.
- Remaining limitations: no terrain editing, save/load, or formal ACO shortest-path guarantees. Learning routes is slower than the former precomputed homing shortcut and requires sustained food supply for long experiments. Tuning should be evaluated through playtesting.

## Product direction

Begin as an observable ant-foraging sandbox. The player places food and watches one colony discover and reinforce routes around procedurally generated obstacles. Food availability affects the colony's population; objectives are optional.

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
5. **Multiple colonies (future goal):** build on the shared color-family convention with separate colony state and trails. Interaction rules remain undecided. Specialized workers, changing environments, and larger worlds remain optional later possibilities.

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
- The procedural map initially supplied shortest homeward routes. This bypassed the desired learning process and has been replaced with each ant's own route memory. Map connectivity utilities must not steer ants.
- Evaporation, exploration, and deposition must be tuned together. Strong feedback can trap ants on a poor route; weak feedback can prevent stable trails.
- Simulation-level behavior is now checked by automated scenarios; browser behavior remains unverified because browser infrastructure is unavailable.

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

### 2026-11-05 — First implementation

- User asked for any remaining questions or implementation. No further questions were necessary to begin.
- Implemented the first sandbox in `web/` with the agreed colony, food supply, growth, and irreversible extinction rules.
- Selected conservative default rates and documented them above; these can change based on playtesting.
- Maintained the independent seeded engine, added meaningful simulation tests, and verified the production build.
- Browser access host is unavailable, so visual and browser interaction verification remains outstanding.
- A private Sites project was registered and its ID persisted in `web/.openai/hosting.json`. Automatic approval review then rejected source synchronization/publication: building the app did not authorize exporting the project source to that external destination. No source was pushed and no version was deployed. Local implementation and checks are complete; uploading/publishing requires explicit user approval.

### 2026-11-05 — Minimal simulation interface

- User rejected the initial presentation as too styled and AI-generated. They want a bare-bones simulation, explicitly without a header or title page.
- Removed the branding, hero, sidebar, slogans, styled cards, custom fonts, decorative grid, and ornamental nest/food details.
- Replaced them with native controls, plain statistics, collapsed settings, a short placement hint, and a canvas using the remaining viewport space.
- Preserved simulation behavior. The renderer now fits the world with a uniform scale so dots stay circular; food placement ignores the margins outside the world.
- Saved this preference in `AGENTS.md` to guide future changes. Publication remains blocked pending explicit approval; this update stays local.

### 2026-11-05 — Unproductive exploration and smooth trails

- User observed too many ants spending long periods away from food and requested a penalty for this behavior while preserving some scouting. They also reported blocky pheromone trails.
- Added search budgets, empty returns, fading penalties for unsuccessful departure directions, and recruitment toward locally advertised food routes. One in eight spawned ants is a longer-range scout. No extra colony food penalty or mortality was introduced.
- Narrowed scout steering changes and reduced scout trail attraction after a regression scenario exposed poor discovery of a replacement food source. Distant discovery and source replacement now pass across three seeds.
- Comparative scenario: 48 starting ants, 20 food clicks at (720, 320), seeds 1847/42/17, sampled during simulated seconds 60–120. The fraction on the empty side (x < 400) changed from 33.6%/29.0%/34.5% to 7.2%/6.0%/3.9%. Deliveries by 120 seconds changed from 229/221/216 to 509/539/538. These are scenario measurements, not guarantees for every layout.
- Replaced cell-snapped sensing/deposition with interpolation and added a display-only smoothed trail raster. Inspected an exported real simulation trail raster and confirmed a continuous soft edge; full browser visual QA remains unverified.
- Measured the raster update alone at about 1.2 ms per frame in Node on this machine; this excludes browser drawing and is not an end-to-end frame-rate measurement.
- All 14 automated tests and the production build pass. UI remains bare bones and work remains local.

### 2026-11-05 — Connected procedural obstacle maps

- User requested procedurally generated obstacle regions without unreachable pockets.
- Added seeded, overlapping obstacle patches on the existing 8-unit grid. Flood fill from the protected nest clears no new routes; instead, enclosed floor pockets become solid terrain. Every remaining open cell is reachable through cardinal connections.
- Added collision clearance, local wall avoidance, blocked food placement, obstacle-masked pheromone deposits/rendering, and shared distance-field homing with visible waypoints.
- A sampled-ray shortcut check initially allowed corner grazing. Replaced it with segment intersection against expanded obstacle cells; sampled homeward route checks now pass. A U-shaped obstacle scenario also verifies real returners can escape concave terrain and deliver food.
- Kept the minimal interface: added one native `New map` button, renamed the seed label, and added a gray obstacle legend. The map button confirms replacement before changing the seed or clearing the colony.
- Existing foraging regressions use explicit empty-map fixtures; terrain has separate integration scenarios. Boundary avoidance intentionally changes seeded movement paths, so the distant replacement-food scenario now allows 180 seconds (roughly three scout budgets) instead of 120.
- All 20 tests and the production build pass. Independently flood-filled 100 seeded maps and checked safe movement/foraging plus sampled return paths on five generated maps. Inspected an exported default terrain image; browser UI verification remains unavailable.
- Isolated Node measurements advanced 60 simulated seconds on the default map in about 83 ms at 48 initial ants and 216 ms at 350, excluding rendering. These are not browser frame-rate measurements.
- Future terrain edits must rebuild navigation/connectivity and invalidate the renderer cache. No terrain painting or save/load was added; work remains local.

### 2026-11-05 — ACO and multiple food sources: explanation and inspection

- User asked whether ACO ants are greedy toward the first food source along a path and requested an explanation of ants, pheromones, and trails.
- ACO is a family of optimization algorithms. Typical next-step selection is probabilistic, weighted by pheromone and a problem-specific heuristic; taking the first encountered food is a separate foraging-model choice. Reinforcement, evaporation, and continued exploration balance exploitation and discovery. Reference: [Marco Dorigo's ACO overview](https://www.scholarpedia.org/article/Ant_colony_optimization).
- Our sandbox is ACO-inspired. Pheromone is a scalar concentration field rather than a stored directed route. Carrying ants deposit it while returning; workers sample forward directions, and scouts explore farther. Shared terrain navigation, fixed scout roles, and failed-direction penalties are explicit simplifications, not universal ACO rules.
- Code inspection found an insertion-order bias: local food targeting uses `Array.find` for the first visible, nonempty patch within 65 units. Pickup uses the first eligible patch within 14 units. When more than one patch qualifies, this prefers the earlier array entry rather than necessarily the nearest patch or first one physically along the route.
- With food A before food B on the same corridor, a rule that collects immediately at A naturally intercepts traffic toward B until A is exhausted; discovering or preferring B requires exploration or another food-selection objective. A stronger trail represents reinforced recent use, not guaranteed global optimality.
- Proposed future refinement: select the nearest visible food, or use a distance/quality-weighted choice if food quality is introduced. This is a recommendation only; no simulation behavior was changed in response to this explanatory question.

### 2026-11-05 — README behavior reference

- User requested saving the ant/ACO behavior explanation in `README.md`.
- Added current search, collection, homeward navigation, pheromone reinforcement/evaporation, scouting, and failed-direction rules, plus the multiple-food example and insertion-order caveat. Kept nearest-visible selection explicitly proposed, not implemented.
- Documentation only; simulation behavior is unchanged.

### 2026-11-05 — Competing routes and gradual improvement

- User observed ants immediately sharing an optimal return path on obstacle maps and requested multiple trails with efficient routes gaining strength over time.
- Confirmed the cause: shared distance-field homing chose a short return bypass regardless of the route an ant had discovered, then advertised that bypass with pheromone.
- Replaced all ant homing with per-trip breadcrumbs. Both loaded and empty returners follow their own discovered routes. Route memory erases revisited loops and straightens only nearby visible bends, preserving competing obstacle bypasses. No simulated ant calls the shortest-route utility.
- Reinforcement now depends on remembered route length, with continued evaporation and a softer worker trail bias. A discovered trail can earn a worker one bounded search extension, allowing it time to follow a detour. Empty ants return faster but deposit nothing.
- Adjusted opacity to preserve visible differences at medium/high pheromone density; the minimal legend now says darker trails are stronger.
- Verified a seeded asymmetric fork experiment (seed 5, 80 initial ants, 200 reserve units, stocked food at (780, 320)). At 120 seconds, the longer branch had about 196 summed signal versus 72 for the shorter branch. During seconds 420–480, the shorter branch averaged about 1.87 times the longer branch's signal. Both remained present. This demonstrates one gradual improvement scenario, not universal global-optimum convergence.
- Inspected exported simulation trail rasters at 120 and 480 seconds: distinct obstacle bypasses were visible, with stronger lower/shorter reinforcement later. Browser UI verification remains unavailable.
- Updated regressions to reflect the intentionally slower, discovered-route returns: the flat-map recruitment scenario expects over 100 deliveries and under 20% occupancy on the empty side, replacing oracle-era thresholds. The distant-source scenario uses a documented reserve buffer and longer observation windows to isolate exploration from starvation. Food accounting remains checked.
- All 24 tests and the production build pass. Updated README behavior documentation and agent instructions; the UI remains minimal and work remains local.

### 2026-11-05 — Subtle energy pressure and paired experiments

- User proposed a subtle energy score that makes long trips more costly and asked to observe intrinsic efficiency rather than prescribe logically optimal ants.
- Removed the explicit remembered-route quality formula and return-time deposition decay. All carriers now deposit 0.6 pheromone per actual unit walked; energy and trip-distance metrics never enter direction weights or deposition strength.
- Added 100-unit energy budgets, distance-based expenditure with a 15% carrying surcharge, at most 10% fatigue slowdown, and nest recovery at 8 energy/second. Normal 1,000-unit trips require roughly 1.5–1.7 seconds of recovery. Zero-energy ants can still return, and energy causes no additional deaths or food debit. Existing upkeep applies while resting; empty reserves do not trap all ants in recovery.
- Actual movement is charged even if route memory later erases a loop; blocked attempts cost nothing. Added aggregate walking, completed-food-trip distance, energy-used, and ant-rest-time metrics solely for observation.
- Kept the interface minimal: one average-energy statistic and a checkbox in Settings. Disabling energy removes drain, fatigue, and mandatory rest; a fresh seeded reset makes a cleaner visual comparison than changing it mid-run.
- Added `web/scripts/compare-energy.ts`, invoked with `npm run experiment:energy`: eight paired energy-off/on trials, 80 starting ants, 200 starting reserve units, 8,000 world food units, asymmetric fork geometry, 480 simulated seconds each. No results are used to steer the ants. Population and exploration feedback are allowed to evolve normally.

| Seed | Mean food-trip distance off / on | Deliveries off / on |
| --- | --- | --- |
| 0 | 1388 / 1295 | 529 / 418 |
| 1 | 1324 / 1362 | 446 / 469 |
| 2 | 1349 / 1327 | 517 / 381 |
| 3 | 1397 / 1309 | 469 / 397 |
| 4 | 1315 / 1283 | 454 / 477 |
| 5 | 1310 / 1303 | 507 / 531 |
| 17 | 1355 / 1273 | 431 / 472 |
| 42 | 1315 / 1294 | 472 / 482 |

- Mean paired completed-trip distance changed by approximately −2.8%; seven seeds shortened and one lengthened. Rest occupied about 5.8% of ant-time. Total deliveries changed by approximately −2.6%, while mean food per total distance walked rose by approximately 4.6%. These are descriptive results from a small sample, not proof of general optimization or causal isolation from timing/population feedback. No tuning was applied to force the experiment to improve.
- The previous exact initial-longer-branch assertion no longer applies after removing direct route rewards and changing timing. The regression now checks discovery of both branches and stronger later reinforcement of the shorter branch in its seeded scenario; a different seed may behave differently.
- All 31 tests and the production build pass. README and agent instructions record the model, comparison command, findings, and limits. Browser UI verification remains unavailable; changes remain local.

### 2026-11-05 — Visible energy toggle

- User requested an energy on/off toggle. The existing toggle was inside collapsed Settings; moved it into the main control row and labeled it `Energy` so it is immediately discoverable.
- Reused the existing behavior: off disables energy drain, fatigue, and recovery; on enables them. Changes take effect on the next simulation step, and the selected setting is used for new colonies. The energy readout displays `off` when disabled.
- Updated README and agent instructions. No simulation-rule changes.

### 2026-11-05 — Palette, trail contrast, and future colony identities

- User requested a more pleasing palette and less premature blending between trails, while retaining gradual darkening at overlaps. During that work, they clarified that multiple colonies are a future goal and nests, ants, and trails should be color coded together.
- Replaced stark white/gray and olive trails with warm neutral surfaces, stone obstacles, olive food, and a coordinated teal colony family. Kept system fonts, native compact controls, and the existing layout; added no decorative UI.
- The colony's nest, ants, and trails now use one `ColonyPalette`. Carrying ants retain their colony identity and show a small food-colored dot. World food and terrain colors are independent of colony identity. Renderer and trail raster can receive separate colony palettes without sharing/recoloring each other's buffers; actual multi-colony simulation is still future work.
- Reduced display blur so parallel trails 16 units apart retain a visible valley, and replaced the early-saturating single-color opacity map with a progressive shade/opacity ramp. Dense overlaps still converge at the existing field cap. No physical pheromone values, navigation, or energy rules changed.
- Inspected before/after trail raster samples using the exact same simulated field: path separation and dark-overlap contrast improved, and ant/nest/trail colors matched. These are exported renderer samples, not full browser UI screenshots; browser interaction verification remains unavailable.
- All 34 tests and the production build pass. Added regression coverage for strong-trail contrast, nearby-path separation, and independent colony palette application. Updated README and agent instructions; work remains local.

### 2026-11-05 — Earth-brown map theme

- User requested a brownish background map theme.
- Changed map ground to muted sand/earth brown (`#dfcfb8`), outside-map margins to deeper sand (`#cebaa0`), and obstacles to darker earth (`#a58d72`). Kept the teal colony family and minimal controls.
- Updated the obstacle legend, browser theme color, README, and agent instructions. Display-only change; no simulation behavior changed.

### 2026-11-05 — Rival-colony behavior planning

- User requested several rival colonies competing for food, territory, and other resources, with a behavior discussion before implementation.
- Created [RIVAL_COLONIES.md](RIVAL_COLONIES.md) to track confirmed direction, proposed mechanics, questions, and implementation readiness. Linked it from agent instructions and README.
- Proposed starting with two otherwise equivalent colonies as an incremental implementation, local encounters, soft territory, and colony-specific food trails. These are proposals only; user has not selected colony count, combat, territory, or scent behavior.
- First discussion round asks what happens when rivals meet, what territory means, and how rival scent should affect ants. Player role, nest attacks, food loss/theft, and initial placement remain for later rounds.
- Current work is documentation and discussion only; no multi-colony simulation code changed.

### 2026-11-05 — Reset rivalry scope and derive rules through questions

- User rejected the initial rival-colony draft as too large and assumption-heavy, requested an extensive question round, and asked for a new bare-bones implementation plan grounded in the answers.
- User proposed rival nests as food sources to incentivize attacks. Exact contents, theft/access, defensive behavior, and damage remain open.
- User proposed potentially adding an enemy-detected pheromone that attracts ants to frontlines. Inclusion and all recruitment rules remain undecided.
- Replaced the active rivalry document with a 22-question decision worksheet and a conditional four-step build sequence. Withdrew prior defaults about colony count/equality, carrier retreat, territory, rival scent, and deferring raids.
- Questions cover raids, combat, cargo losses, roles, retreat/energy, alarm triggers and priorities, signal recognition, recruitment termination, territory, setup, player role, extinct nests, and end conditions.
- The concrete implementation plan will be finalized after answers and follow-ups resolve the chosen behaviors. No rivalry code changed.

### 2026-11-05 — Rivalry question 1

- User requested the rivalry questionnaire be asked one question at a time.
- User answered "both": stored nest reserves and ants/brood should provide food. Exact prey, conversion quantities, and a separate brood model remain unresolved.
- Recorded this in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: access to stored nest food. No implementation changes.

### 2026-11-05 — Rivalry question 2 and volunteered encounter rules

- User chose immediate food pickup at rival nests. Picking up reserves is not gated by a raid timer or defeating defenders; combat is a separate ant-to-ant interaction.
- Rival encounters usually lead to fighting or fleeing. Fleeing ants drop whatever food they carry. Fights end when one ant dies or an ant retreats.
- Recorded partial answers for later encounter/carrier questions, while leaving exact fight/flight decisions, combat mechanics, retreat rules, and dropped-food ownership unresolved.
- Next main question: can nests themselves be damaged or destroyed? Discussion only; no simulation changes.

### 2026-11-05 — Rivalry question 3

- User confirmed that nests cannot be damaged/destroyed directly; raids only steal food and kill ants through their interactions.
- Colony extinction continues to occur when population reaches zero. Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`.
- Next question addresses combat resolution; rival encounters and their possible outcomes are already partially defined. No implementation changes.

### 2026-11-05 — Rivalry question 5: combat resolution

- User selected quick probabilistic fights, ending in an ant dying or retreating, rather than health/damage exchanges over several seconds.
- Exact outcome probabilities and modifiers remain open. Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`.
- Next question: can multiple ants engage one rival, or are fights pairwise? No implementation changes.

### 2026-11-05 — Rivalry question 6: group engagements

- User confirmed that multiple ants can gang up on one rival. Combat is not limited to isolated one-on-one fights.
- How local numbers modify death/retreat probabilities remains open. Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`.
- Next question: disposition of food carried by a killed ant. No implementation changes.

### 2026-11-05 — Rivalry question 7: cargo transfer

- User specified that a killed ant's carried food goes directly to an attacker. If both ants die, it is lost.
- User explicitly does not want food clutter around encounters; do not create dropped-food piles.
- The earlier fleeing/drop rule needs a follow-up: whether cargo from a fleeing ant transfers to the rival or is discarded. Group-combat recipient, carrying capacity, and biomass handling remain unresolved.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. No implementation changes.

### 2026-11-05 — Surrendered food and carrier exception

- User confirmed that food surrendered while fleeing transfers directly to the rival; no ground food piles are created.
- User added that two food-carrying rivals must not fight. Recorded this as an exception to normal rival encounters.
- Next follow-up clarifies whether two carriers simply pass without any other interaction. Carrying capacity, group recipients, and carrier-versus-empty behavior remain unresolved. No implementation changes.

### 2026-11-05 — Carrier-pair exception confirmed

- User confirmed that two food-carrying rivals simply pass each other and retain their respective cargo, with no fighting or food transfer.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: whether current workers/scouts fight or a separate soldier role should exist. No implementation changes.

### 2026-11-05 — Rivalry question 8: one ant type

- User specified one ant type for now: existing workers and scouts can fight. No separate soldier caste.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Scouting remains a behavior of the existing ant type.
- Next question: should a carrier encountering an empty-handed rival always surrender/flee or sometimes fight? No implementation changes.

### 2026-11-05 — Carrier-versus-empty coverage clarified

- User called the latest question redundant and clarified that an empty-handed rival can engage a carrier; the winner takes the food (or keeps it if already carrying).
- Use the general encounter rules with the two-carrier peaceful-pass exception. Fleeing still transfers cargo to the rival; do not add a separate automatic-surrender carrier rule.
- Avoid asking redundant combinations of already-agreed rules. Next unresolved decision: local numbers as a modifier to winning/retreat odds. No implementation changes.

### 2026-11-05 — Rivalry question 10: retreat probability

- User chose random retreat probability as a property of each colony. All colonies should have the same retreat chance for now.
- Retreat chance does not change with nearby ally/enemy counts. Its numerical value and roll timing remain unset; group effects on winning/death remain separate unresolved decisions.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: energy's role in combat. No implementation changes.

### 2026-11-05 — Rivalry question 11: no combat energy effects

- User chose no additional energy effects in combat: no extra energy cost for fighting and no energy-based combat/retreat modifier.
- Existing toggleable movement, fatigue, and recovery remain. Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`.
- Next question: emission trigger for the proposed enemy-detected pheromone. No implementation changes.

### 2026-11-05 — Rivalry question 12: enemy-detected pheromone

- User chose fighting or fleeing as the emission trigger. The enemy-detected signal is now confirmed, with mere sightings excluded.
- Peaceful encounters between two carriers consequently do not emit this signal. Recognition, responders, priority, persistence, and ending recruitment remain open.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: own versus rival signal recognition. No implementation changes.

### 2026-11-05 — Rivalry question 13: own-colony pheromones

- User chose own-colony pheromone recognition only, for both food and enemy-detected signals. Rival fields do not influence navigation through attraction or avoidance.
- Direct encounters with rival ants still use the agreed fight/flight and cargo rules.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: which ants respond to enemy-detected pheromone. No implementation changes.

### 2026-11-05 — Rivalry question 14: recruitment fraction

- User chose an adjustable fraction of nearby empty-handed ants as responders to enemy-detected pheromone. Food-carrying ants are not recruited by it.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Default fraction, range, selection method/timing, and setting scope remain open.
- Next question: whether a selected responder prioritizes the enemy signal over nearby food. No implementation changes.

### 2026-11-05 — Rivalry question 15: enemy priority

- User chose enemy-signal priority for recruited ants, over nearby food. A food encounter does not cancel recruitment; food-carrying ants remain ineligible for initial recruitment.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: what ends a recruited ant's response. No implementation changes.

### 2026-11-05 — Rivalry question 16: response termination

- User specified that recruitment ends when the responding ant's fight resolves, by retreating or winning. It then resumes ordinary behavior, with existing cargo rules still applying.
- Stale alarms where no fight occurs, signal persistence, and re-recruitment eligibility remain unresolved; no timeout/decay cancellation was assumed.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next follow-up: reaching an alarm after enemies have left. No implementation changes.

### 2026-11-05 — Rivalry question 16 follow-up: stale alarms

- User chose immediate resumption of foraging when a responder reaches the alarm area and finds no enemies; it does not wait for the pheromone to fade.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Re-recruitment eligibility and signal persistence remain unresolved, so repeated recruitment to a stale alarm must not be assumed.
- Next question: whether territory needs an explicit ownership/capture mechanic or emerges from colony activity. No implementation changes.

### 2026-11-05 — Rivalry question 17: emergent territory

- User chose territory that emerges naturally, potentially based on pheromone trails, with no explicit ownership.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. No ownership, capture, exclusive-access borders, or separate territorial field/overlay is selected. Own-colony-only pheromone recognition remains unchanged.
- Simplified the conditional implementation outline accordingly. Next question: initial colony count. No implementation changes.

### 2026-11-05 — Rivalry question 18: adjustable colony count

- User chose an adjustable colony count for the first rival version. Default count, range, and reset/live-change behavior are not yet selected.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: how nest positions are chosen. No implementation changes.

### 2026-11-05 — Rivalry question 19: placement clarification

- User replied "either" when asked about automatic seeded versus manual nest placement. Both appear acceptable, but requiring both modes versus having no preference is unresolved.
- Recorded the literal answer and ambiguity in `RIVAL_COLONIES.md` and `AGENTS.md`; next ask for that clarification rather than selecting a mode. No implementation changes.

### 2026-11-05 — Rivalry question 19: both placement modes

- User clarified that both seeded automatic and manual nest placement should be available.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: equal versus different starting populations and food reserves. No implementation changes.

### 2026-11-05 — Rivalry question 19: equal starting conditions

- User chose equal starting ant populations and food reserves for all colonies, rather than per-colony starting differences.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Exact shared starting values remain open. Next question: player role. No implementation changes.

### 2026-11-05 — Rivalry question 20: observer role

- User chose an observer role, with shared food placement and no direct ant/colony commands. Existing setup and simulation controls remain.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: remaining food at extinct nests. No implementation changes.

### 2026-11-05 — Rivalry question 21: extinct nests

- User confirmed that extinct nests remain on the map and leftover food remains lootable by other colonies. This does not revive the extinct colony.
- Recorded in `RIVAL_COLONIES.md` and `AGENTS.md`. Next question: whether a last surviving colony ends the run. No implementation changes.

### 2026-11-05 — Rivalry question 22: continue the sandbox

- User chose to continue the simulation when only one colony survives, without an automatic victory/end state. No replacement or revival of extinct colonies is implied.
- Recorded in `RIVAL_COLONIES.md`, `AGENTS.md`, and the README's planned milestone description.
- Main questionnaire completed with some partially resolved mechanics. Continue one-at-a-time follow-ups on consequential gaps before finalizing the bare-bones plan; next is separate brood simulation versus defeated adults as food. No implementation changes.

### 2026-11-05 — Correction: nest brood is edible; adult ants are not

- User clarified that adult ants must not be food. Their carried cargo can transfer, but adult death itself produces no food or edible remains; an empty-handed victim yields nothing.
- Rival nests contain food stores and brood, both available as enemy food sources. This supersedes earlier ambiguous "both" notes that included adult-ant biomass.
- Updated `RIVAL_COLONIES.md`, `AGENTS.md`, and README's planned milestone wording. Brood maturation, replenishment, quantities, and yields remain unresolved.
- Next question: whether brood is a simple lootable reserve or matures into new adults. No implementation changes.

### 2026-11-05 — Brood lifecycle and slow recovery

- User confirmed gradual brood production and eventual maturation into adult ants, connecting the lifecycle to food-supported growth.
- User emphasized slow production so colonies cannot quickly replenish populations. Production rate and maturation timing both need to prevent rapid replacement; no numerical values, starting brood, or costs have been selected.
- Planned rival growth will use food → brood → adults instead of the current direct spawning model. Current simulation code is unchanged.
- Updated `RIVAL_COLONIES.md`, `AGENTS.md`, and README's planned milestone. Next question: whether a colony with no adults but remaining brood counts as extinct. Permanent extinction itself remains agreed.

### 2026-11-05 — Brood-aware extinction

- User defined extinction as both brood and adults being gone. A colony with no adults but surviving brood is still alive and can recover when brood matures.
- This changes the planned extinction test from the prototype's adult-only count; once adults and brood are both zero, extinction remains permanent.
- Recorded in `RIVAL_COLONIES.md`, `AGENTS.md`, and README. Next: food requirements for maturation of existing brood. No implementation changes.

### 2026-11-05 — Correction: uninterrupted brood maturation

- User first said brood should pause development without food, then explicitly withdrew that answer: brood should continue developing.
- No pause rule was persisted or implemented before the correction. Existing brood now explicitly continues maturation even with empty reserves. Food-supported production of new brood is a separate process; no food-free production or brood starvation mortality is implied.
- Updated `RIVAL_COLONIES.md`, `AGENTS.md`, and README. Next unresolved question: local numerical advantage in winning odds, distinct from retreat probability. No implementation changes.

### 2026-11-06 — Numerical advantage with limited complexity

- User ideally wants numerical advantage to improve winning chances, but expressed concern about complexity for the current version.
- Recorded the desired direction without assuming that a particular first-version implementation is approved. Proposed using local allied/enemy headcounts to bias the existing quick combat roll, avoiding coordinated battle simulation.
- Retreat remains an equal initial per-colony random probability, unaffected by headcount. Next clarify whether to include this lightweight win-odds bias now. No implementation changes.

### 2026-11-06 — Numerical advantage deferred

- User declined including the proposed lightweight headcount bias in the first rival version. Keep individual combat odds equal without numerical-advantage modifiers. The earlier permission for multiple ants to engage one rival remains; coordinated group combat is not required.
- Better odds from numerical superiority remain a future design goal, not current scope. Retreat probability is unchanged.
- Synchronized AGENTS.md and RIVAL_COLONIES.md. Planning only; no simulation changes. Next clarify nest-loot priority between reserves and brood.

### 2026-11-06 — Nest-loot priority

- Confirmed: raiders prioritize stored food, taking brood only once the rival nest has no stored food. This does not select brood yield or cargo quantities.
- Updated AGENTS.md, RIVAL_COLONIES.md, and the README planned-feature description. Planning only; no simulation changes.
- Next clarification: retreat destination and resumption of foraging.

### 2026-11-06 — Retreat ends in foraging

- Confirmed: retreating ants move away from the fight and resume foraging; they do not have to return to their nest. Cargo still transfers directly to the rival under the existing surrender rule.
- Recorded in AGENTS.md and RIVAL_COLONIES.md. A short disengagement/cooldown rule is still proposed, not confirmed; next clarify whether retreat temporarily prevents renewed combat and alarm recruitment. Planning only; no simulation changes.

### 2026-11-06 — No retreat cooldown

- Confirmed: no cooldown after retreat. Ants may encounter rivals and be recruited by alarms again immediately; no temporary combat immunity or recruitment exclusion. This supersedes the proposed cooldown in the preceding entry.
- Recruitment selection frequency and stale-alarm handling remain open. Synchronized AGENTS.md and RIVAL_COLONIES.md; planning only, no simulation changes.
- Next question: setup-only colony-count changes versus adding/removing colonies during a run.

### 2026-11-06 — Live colony additions and removals

- Confirmed: configure colony count at startup and allow adding/removing colonies during a run, without resetting the world. This extends observer setup controls; it does not authorize direct ant commands or automatic revival.
- Exact live placement, starting resources, and removal semantics remain open. Updated AGENTS.md, RIVAL_COLONIES.md, and README planned features. No simulation changes.
- Next clarification: complete removal versus retaining a manually removed colony's nest/stores as loot.

### 2026-11-06 — Manual removal erases the colony

- Confirmed: manually removing a colony makes all its ants, nest, stores, brood, and trails/signals disappear. No loot remains. This differs from natural extinction, which still leaves a lootable nest.
- Updated AGENTS.md, RIVAL_COLONIES.md, and README planned behavior. Planning only; no simulation changes.
- Next question: whether the adjustable alarm recruitment fraction is shared globally or configurable per colony.

### 2026-11-06 — Global alarm recruitment fraction

- Confirmed: the adjustable fraction of nearby empty-handed alarm responders is a single shared setting applied to every colony. Ants still respond only to their own colony's signals.
- Synchronized AGENTS.md and RIVAL_COLONIES.md. Planning only; no simulation changes. Next question: whether enemy signals should fade faster than food trails.

### 2026-11-06 — Enemy signals fade faster

- Confirmed: enemy pheromones decay faster than food trails, limiting attraction to old fights. Exact decay/lifetime remains undecided tuning. No retreat cooldown is introduced.
- Synchronized AGENTS.md and RIVAL_COLONIES.md. Planning only; no simulation changes. Next question: whether colonies begin with brood or must produce their first brood during the run.

### 2026-11-06 — Brood starts at zero

- Confirmed: colonies begin with adults and food reserves, without brood. Brood is produced later during the run, under the agreed slow food-supported lifecycle.
- Synchronized AGENTS.md, RIVAL_COLONIES.md, and README planned behavior. No simulation changes. Next question: random versus closest-first selection of nearby empty-handed alarm responders.

### 2026-11-06 — Simplicity takes priority; interview closed

- User rejected the excessive number of nitpicky questions and requested a simple simulation with basic parameters. Stop the questionnaire, including the pending random-versus-nearest recruitment question.
- Confirmed behavioral decisions stand. Routine selection methods, numeric values, radii, and edge-case handling should use simple shared implementation defaults, clearly labeled as tuning rather than user decisions. They no longer block the build plan.
- Replaced the conditional rivalry outline with a compact sequence: multiple-colony state/setup; slow brood lifecycle and raiding; quick encounters; alarm response and verification. Reuse existing mechanics and keep controls minimal.
- Updated AGENTS.md and RIVAL_COLONIES.md to prevent resuming the exhaustive worksheet. Updated README planning status. No implementation in this planning-only turn.

### 2026-11-06 — Rival colonies implemented after plan approval

- User approved the simplified plan with "it looks good." Implemented shared map/food, separate colony engines and trails, equal starts, startup count 1–8, automatic/manual nest placement, and live addition/removal. Distinct active colors survive removals and additions without collisions. New simulation resets the run; explicit new colonies have fresh identities.
- Food-first nest raids collect reserves immediately (including fractional final units), then brood. One stolen brood yields one food cargo. Adult ants are not edible. Encounters transfer existing cargo directly; two carriers pass. Quick equal-odds losing-ant selection followed by a 30% retreat chance; no headcount multiplier, cooldown, combat energy, or prolonged damage system. Multiple local opponents can engage; each pair only once per step, in seeded shuffled order.
- Shared tuning: brood costs 4 reserves per 8 seconds of surplus and matures after 40 seconds; 350 combined adults/brood cap. Colonies start with 36 reserves and selected adult population, no brood. Existing brood matures without reserves/adults. A regression test caught newborns inheriting the adult-less colony's expired starvation grace; restoration now starts the normal grace again.
- Shared alarm fraction defaults 25%. A stable distributed willingness value selects responders rather than repeated recruitment rolls. Own-colony alarms only, nearby empty-handed ants, enemy priority, immediate release when no enemy remains, no retreat exclusion. Alarm decay half-life 3 seconds clamped below food decay. Fields are separate; food trails are rendered, no separate alarm overlay.
- Nest placement uses existing connected terrain with 32 clearance and 100 separation; terrain is not modified. Manual placement pauses while placing; a live addition restores the prior pause state. Removal clears all colony-owned state and signals; natural extinction leaves a lootable nest. Extinction requires zero adults and zero brood.
- Verified: 43 tests and TypeScript/Vite production build pass. New tests cover shared/isolated state, replay with live actions, placement, maturation, permanent extinction, loot priority/fractional cargo, peaceful carriers, combat transfer, no cooldown, signal isolation/decay, and stale responders. Existing foraging tests were adapted to brood cost accounting and slower growth (longer distant-discovery observation and lower fixed-time throughput threshold).
- Safari UI checks verified layout, pause, automatic live addition, full removal, manual live placement, and keyboard food placement. Browser connector host was unavailable; native Safari access worked. This supersedes the earlier blanket browser-unverified limitation for those checked interactions; mobile/resizing and large-colony frame rates are still unmeasured.
- README and AGENTS synchronized. Work stays local; no Sites upload/publication. Balance defaults are provisional implementation tuning; prior energy-experiment results predate this lifecycle change and have not been rerun for the new version.

### 2026-11-06 — Trail rendering fix and readable fight duration

- User reported only one colony's trails rendering and changed the combat requirement: fights must last at least a second. Use simulated time, consistent with pause and speed controls. This supersedes instant resolution, without introducing health/damage or a retreat cooldown.
- Found shared mutable trail canvas/ImageData in the renderer. Replaced it with independent per-colony surfaces, with reset invalidation and removal cleanup. Shared draw-source aliasing was the suspected cause; the regression verifies independent retained sources/colors and Safari visually confirms simultaneous teal/red trails after the fix.
- Added pending pair engagements with a one-second duration. Fighting ants stop foraging/moving, keep normal colony upkeep, emit alarms, and remain visibly colony-colored dots (slightly enlarged). Existing equal-odds outcome and direct cargo rules run after the timer. Additional attackers get their own full timers; dead/removed participants cancel invalid engagements and free survivors.
- Verified all 46 tests and the production build. Added rendering regression through hide/reset/removal, pre-resolution timing/positions/cargo, additional-attacker duration, and mid-fight colony removal checks. Updated README, rivalry notes, and AGENTS. Work remains local.

### 2026-11-06 — Food-rich colonies mature brood faster

- User requested faster offspring maturation and population growth as colony food stores increase. This supersedes a fixed 40-second maturation period; existing brood still develops when reserves are empty.
- Implemented remaining developmental time per brood and a shared smooth rate `1 + reserve / (reserve + 100)`. Baseline is 40 simulated seconds at zero food; maintained abundant reserves approach a 20-second minimum. The scale/upper bound are implementation tuning, not user-selected numbers. Only stored colony food contributes, not nearby uncollected patches.
- Each simulation tick applies the current rate to existing brood; changing stores never resets or reverses progress. No extra maturation food charge. Production cost/interval and the combined adult/brood cap are preserved to keep replenishment gradual.
- Tests verify earlier first maturation at increasing reserves, the speed bound, response to food gained/lost partway through development, and continued unfed development. Faster births changed the old single-seed route dominance result; expanded that stochastic check to three seeds, retaining both-route discovery, sustained reinforcement, deliveries, and food conservation for each, plus at least one stronger efficient branch. No guaranteed optimality is claimed.
- README, AGENTS, and rivalry defaults updated. No UI changes or source publication.

- Verification for food-dependent maturation: all 48 tests, TypeScript checks, Vite production build, and `git diff --check` pass.

### 2026-11-06 — Visible populations, food quantity, and faster speeds

- User requested that each colony show its population, control over the size of food being placed, and speeds above 4×.
- Added live adult counts beside each nest, with clear colony names in the existing stats row. Brood remains a separate count in stats; extinction labels remain distinct. Nest labels near the bottom move above the nest to stay visible.
- Added a native Food per click number control, default 80, accepting 1–10,000 whole food units. This controls patch quantity (including top-ups), with current amount reflected in placement messages and used by mouse/touch/keyboard placement. The amount persists through new simulations. Patch footprint/clearance rules stay consistent; engine rejects invalid amounts and tracks selected quantities in standalone food accounting.
- Added 8×, 16×, and 32× options. Simulation still uses fixed 1/30-second steps, with at most 64 steps and a 12 ms simulation-work budget per render frame, bounded backlog, and backlog reset on speed changes. Faster speeds are best effort depending on device/population; no simulation rules are skipped to accelerate time.
- Verified all 49 tests, TypeScript/Vite production build, and diff whitespace checks. A new test covers custom patch amounts, merging, validation, old default callers, and food accounting. Safari check confirmed 500-unit placement, visible nest population labels, and selection/advancement at 32×. No new ornamental styling or publication.

### 2026-11-06 — GitHub Pages setup

- User requested preparing the project for GitHub Pages deployment. Inspection found the local branch is main, no configured Git remote, and no prior GitHub workflow or Vite config.
- Added `.github/workflows/pages.yml`: PR/push checks use Node 24, lockfile-based installation, all tests, and production build under web/. Only successful main pushes/manual main runs upload web/dist and deploy via official Pages actions; PRs do not publish. Action revisions are pinned using the current official Vite deployment example. Deployment uses the github-pages environment and scoped Pages/OIDC permissions.
- Added Vite relative base `./` to support repository subpaths and domain-root hosting without guessing a repo name. README documents Pages activation and the manual trigger. No new package dependency, source push, GitHub setting change, or live deployment was performed; no remote is available in this checkout.
- Official references checked: https://vite.dev/guide/static-deploy, https://vite.dev/guide/build#relative-base, and GitHub's custom Pages workflow guide. The previous Sites restriction remains unrelated to this requested GitHub Pages setup.

- Verification: all 49 tests and production build pass; workflow YAML parses; both generated JS/CSS asset URLs resolve under a simulated `/AntColonies/` Pages prefix and point to existing build files; `git diff --check` passes. Actual GitHub Actions execution remains unverified until the repository is connected and pushed.

### 2026-11-06 — Connect and activate GitHub Pages

- User confirmed the remote was configured and pushed. Verified origin is git@github.com:psurge1/MoundACO.git, default branch main, repository public, with Pages not yet enabled and no workflow runs.
- Found the Pages workflow and Vite configuration were still untracked locally and absent from the pushed commit. Completing the setup requires committing/pushing these files and enabling workflow-based Pages publishing.
- Verified the five pinned action revisions against their official GitHub releases through the API; they match checkout v7.0.1, setup-node v7.1.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1.
