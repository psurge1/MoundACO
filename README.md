# Ant Colonies

A relaxing browser sandbox exploring ant foraging and emergent trails through ideas from ant colony optimization (ACO). Ants are dots. The interface is a simulation canvas with compact native controls and stats.

The sandbox starts with two rival colonies on a procedurally generated obstacle map. All open terrain is connected. Ants explore and reinforce paths with pheromones. Food does not replenish automatically: food supports population growth, while shortages reduce population. A colony that dies out cannot be revived.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
cd web
npm ci
npm run dev
```

Open the local URL printed by Vite.

```sh
npm test       # Simulation scenarios
npm run build # TypeScript checks and production build
npm run experiment:energy # Eight paired runs, energy on/off
npm run preview
```

## Deploy to GitHub Pages

The workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml) tests and builds the app on pull requests and pushes to `main`. Successful pushes to `main` deploy only `web/dist` to GitHub Pages. It uses Node.js 24 and the checked-in npm lockfile; no personal access token or deployment dependency is needed.

1. Push this repository, including the workflow, to `main` on [psurge1/MoundACO](https://github.com/psurge1/MoundACO).
2. In that repository, open **Settings → Pages → Build and deployment**, and set **Source** to **GitHub Actions**.
3. Push to `main`, or open **Actions → GitHub Pages → Run workflow** on `main`.
4. Once the deployment succeeds, open the URL shown by the deployment job or in **Settings → Pages** (normally `https://<owner>.github.io/<repository>/`).

Vite uses relative asset paths, so no repository name needs to be hard-coded. To check the production output locally, run `npm run build` then `npm run preview` from `web/`. The workflow publishes generated files only; `dist` stays out of source control. If you use a different deployment branch, update the workflow's branch filters and `refs/heads/main` conditions together.

See the official [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite relative-base documentation](https://vite.dev/guide/build#relative-base).

## How to play

- Use **Food per click** to choose 1–10,000 food units (default 80), then click or tap open space to place them. Nearby clicks top up the same patch by the selected amount. Brown regions block movement. Food needs clearance from obstacles and nests.
- Each colony's nest, ant dots, and smooth food trails share a color. Live adult population appears beside each nest; brood is counted separately in the stats row. Carried food is a small olive dot. Ants discover routes locally and retrace their own journeys home; they receive no shortest-path map.
- **Settings** provides starting colony count (1–8), starting adults, seed, and automatic/manual nest placement. These startup values apply with **New simulation**. Manual setup waits for you to place the selected number of nests. **New map** chooses a fresh seed.
- **Add colony** works during a run, using the placement mode in Settings. For manual placement, click open space to place the new nest. Select a colony number and **Remove** to erase its ants, nest, brood, food stores, and trails.
- Every colony starts with equal adults and 36 stored food, with no brood. Surplus food slowly creates brood, which matures into adults even if reserves run out. Default tuning: 4 food per brood, at most one every 8 seconds of surplus, then maturation takes 40 seconds with empty stores and approaches 20 seconds as stored food increases (about 27 seconds if 100 reserves are maintained). Food changes also affect brood already developing; progress is preserved. Adults plus brood are capped at 350 per colony.
- Raiders collect rival stored food first, then brood when stores are empty. Adult ants are not food. Rival ants stop to fight for at least one simulated second before resolving as death or retreat; carried food goes directly to the winner. Two loaded rivals pass peacefully. Retreating ants resume foraging without a cooldown.
- Fighting/fleeing emits a short-lived alarm for that colony. **Alarm response** is one shared setting controlling the fraction of nearby empty-handed ants recruited. Responders prioritize enemies, then resume normal behavior after resolution or finding no enemy. Enemy signals fade faster than food trails; the canvas currently displays food trails only.
- Empty stores eventually cause starvation losses. Extinction requires both zero adults and zero brood and is permanent. Naturally extinct nests remain lootable. The sandbox continues with one survivor; you can explicitly add a new colony at any time within the limit.
- Pause, choose 0.5× through 32× speed (including 8× and 16×), hide trails, or toggle **Energy** in the toolbar. Energy affects walking and nest recovery; it does not affect combat. Per-colony stats show adults, brood, stored food, status, and average energy.
- Keyboard: focus the canvas, move the placement cursor with arrow keys, and press Enter or Space to place food or a nest.

High speeds are best effort on slower devices; fixed simulation steps and bounded frame work keep controls responsive. The simulation stops progressing in hidden tabs. Refreshing loses the current session. Repeating a run requires the same seed, settings, and timed food-placement inputs.

## Ant behavior and pheromones

This sandbox is inspired by ant colony optimization (ACO). Typical ACO algorithms choose steps probabilistically using pheromone and a problem-specific heuristic. Collecting the first encountered food is a separate foraging rule, not an inherent requirement of ACO. See [Marco Dorigo's ACO overview](https://www.scholarpedia.org/article/Ant_colony_optimization).

The current simulation follows these rules:

- **Search:** ants target visible, nonempty food within 65 simulation units. Otherwise, they sample pheromone in forward directions and make a weighted random choice, with some preference for continuing forward. Walls block movement and food detection.
- **Collect:** an ant within 14 units of an eligible food patch takes one unit and heads home. Rival nest pickup happens within 20 units: reserves first (up to one unit, including a fractional remainder), otherwise one brood becomes one food unit. Each ant carries at most one unit.
- **Remember and return:** each ant records its outbound route and follows those breadcrumbs home, with or without food. Revisited loops are erased and visible bends within 24 units can be straightened. Ants receive no precomputed shortest route around obstacles.
- **Reinforce:** carrying ants deposit the same pheromone per unit actually walked, independent of route length or energy. Shorter round trips can repeat sooner, giving efficient routes more reinforcement opportunities. Empty returns deposit no food pheromone. There is no direct route-quality reward or return-time multiplier.
- **Energy and rest:** ants start with 100 energy. Walking costs 0.012 energy per simulation unit, with a 15% increase while carrying. Lower energy gradually reduces speed by at most 10%. After returning, ants recover 8 energy per simulated second before departing again. A typical 1,000-unit trip adds roughly 1.5–1.7 seconds of rest. Energy cannot strand or directly kill ants. Resting ants remain subject to normal colony upkeep/starvation; recovery adds no separate food charge and can continue even when reserves are empty.
- **Follow:** worker departures favor nearby advertised trails and reduce preference for directions that yielded unsuccessful trips. During a trip, workers favor stronger pheromone signals; their choices remain probabilistic.
- **Explore:** one in eight spawned ants is a scout, with weaker trail attraction and a longer search budget. Workers begin with 14–20 simulated seconds and can earn one 10-second extension when following a real trail away from the nest. Scouts search for 45–65 seconds. Unsuccessful ants return home and try another departure direction. Failed-direction penalties fade with a 40-second half-life.
- **Evaporate:** pheromone fades continuously, with a default half-life of 22 simulated seconds, adjustable in Settings. Paths lose influence when deliveries stop reinforcing them.

A food trail is a concentration pattern in a colony-specific field. Ants sense only their own colony's food and alarm pheromones. Each ant also has its own temporary route memory. Darker trails indicate stronger pheromone. Different discoveries can advertise competing paths around an obstacle; reinforcement and evaporation can let a shorter discovered path overtake an initially popular detour. This is gradual and stochastic, with no guarantee of finding the global optimum. Scout roles, breadcrumb memory, and failed-direction penalties are explicit simulation choices, not universal ACO rules.

Trail colors progress from light to deep shades of the colony's color as concentration rises. A narrower display blur keeps nearby paths more distinct; overlaps still darken and eventually blend at high concentration. The color scale is fixed across frames and changes no simulation rules.

### Energy experiment

Energy affects movement and recovery rather than telling ants which route is best. Actual walking spends energy, including wandering that is later removed from route memory. Trip-distance statistics are measurements only; ants never consult them to choose a direction.

For a visual comparison, restart the same seed with **Energy** on/off and repeat food placement as closely as possible. For reproducible inputs, run `npm run experiment:energy` from `web/`. It compares eight seeds on the same fork map for 480 simulated seconds per run, with equal starting reserves and food supply.

In the original single-colony sample (before the brood/rivalry update), energy-enabled runs had about 2.8% shorter completed food trips on average, with improvements in seven of eight seeds. Ants spent about 5.8% of their time resting. Total deliveries were about 2.6% lower, while food delivered per total distance walked was about 4.6% higher. This sample has not been rerun with the new lifecycle. Outcomes varied; these descriptive results do not establish a general optimization benefit. Timing, exploration, and colony growth all interact, and the previous explicit route-length reward has been removed.

### Multiple food sources

For a corridor arranged as `Nest → Food A → Food B`, ants that collect at A return before reaching B. This can reinforce the route to A and intercept traffic toward B until A is exhausted, although scouts can still discover B.

**Current selection caveat:** both targeting and pickup use the first qualifying patch in the food array (`Array.find`). When multiple patches qualify, selection follows placement order, rather than necessarily choosing the nearest patch or the first one physically along the path. Nearest-visible selection is a proposed refinement; it has not been implemented.

## Status and structure

TypeScript + Vite + Canvas 2D, entirely in the browser. 49 automated tests and the production build pass. Tests cover existing foraging, connected maps, remembered routes, energy, trail rendering, and the new lifecycle, encounters, cargo transfers, isolated alarms, live colony management, one-second fights, independent rendered colony trails, and repeatability.

Safari checks verified the layout, pause, live addition/removal, manual live nest placement, and keyboard food placement. Large-population performance and mobile layouts need further playtesting. Rivalry defaults and the agreed rules are recorded in [RIVAL_COLONIES.md](RIVAL_COLONIES.md); numeric values are implementation tuning rather than biological claims.

- `web/src/simulation/`: seeded engine, terrain generation/navigation, ants, food, population, pheromones.
- `web/src/rendering/`: canvas renderer.
- `web/src/main.ts`: controls, input, and fixed-step loop.
- `web/tests/`: simulation scenarios and food accounting checks.

## Project documents

- [Project notes and plan](PROJECT_NOTES.md): requirements, proposed first version, roadmap, conversation history, and open questions.
- [Agent instructions](AGENTS.md): guidance for maintaining project context.
- [Rival-colony discussion](RIVAL_COLONIES.md): confirmed behaviors, current defaults, and the discussion history.

## Development approach

Keep changes small and verify foraging, population rules, and map connectivity before adding complexity. Terrain editing and save/load are not implemented yet.
