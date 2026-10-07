import { createSeededRng } from './rng.js';

const DOOR_COUNT = 3;
const DOORS = [0, 1, 2];

/** Engine bound for the number of experiments (1 is allowed for tests/edges). */
const MIN_EXPERIMENTS = 1;
const MAX_EXPERIMENTS = 50000;

/**
 * Assert that a value is a usable random source: a function returning numbers
 * in [0, 1).
 *
 * @param {unknown} rng Candidate random source.
 * @throws {TypeError} If `rng` is not a function.
 */
function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError(`simulateMontyHallTrial requires an rng function, received ${typeof rng}.`);
  }
}

/**
 * Uniformly select a door (0, 1 or 2) from one random value.
 *
 * @param {number} value A value in [0, 1).
 * @returns {number} A door index in {0, 1, 2}.
 */
function pickDoor(value) {
  return Math.floor(value * DOOR_COUNT);
}

/**
 * Pick the index-th entry of a list from one random value already scaled to
 * the list length (i.e. `rng() * list.length`), keeping every index in range.
 *
 * @param {number} scaled A value in [0, list.length).
 * @returns {number} An index in [0, list.length].
 */
function pickIndex(scaled) {
  return Math.floor(scaled);
}

/**
 * Simulate one explicit Monty Hall trial.
 *
 * The process is performed step by step (never "draw a win with probability
 * 2/3"), and the outcomes are derived from the actual car location. This engine
 * is deliberately independent of the theoretical model in `src/math`.
 *
 * Steps:
 * 1. Choose the car door uniformly from {0, 1, 2}.
 * 2. Choose the player's initial door independently and uniformly.
 * 3. Legal host doors are those that are neither the player's door nor the car.
 * 4. If two legal host doors exist, choose one uniformly; if only one, use it.
 * 5. The switch door is the remaining door (not the initial, not the opened one).
 * 6. Stay wins iff the initial door was the car; switch wins iff the switch
 *    door is the car. Exactly one of the two strategies wins.
 *
 * @param {() => number} rng Random source returning values in [0, 1).
 * @returns {{ carDoor: number, initialDoor: number, openedDoor: number,
 *   switchDoor: number, stayWin: boolean, switchWin: boolean }} The doors and
 *   the paired stay/switch outcomes for this single trial.
 * @throws {TypeError} If `rng` is not a function.
 */
export function simulateMontyHallTrial(rng) {
  assertRng(rng);

  const carDoor = pickDoor(rng());
  const initialDoor = pickDoor(rng());

  // Legal host doors: not the player's door and not the car door.
  const legalHostDoors = DOORS.filter((door) => door !== initialDoor && door !== carDoor);
  const openedDoor = legalHostDoors[pickIndex(rng() * legalHostDoors.length)];

  // The switch door is the only door that is neither the initial nor the opened one.
  const switchDoor = DOORS.find((door) => door !== initialDoor && door !== openedDoor);

  return {
    carDoor,
    initialDoor,
    openedDoor,
    switchDoor,
    stayWin: initialDoor === carDoor,
    switchWin: switchDoor === carDoor,
  };
}

/**
 * Prepare one playable Monty Hall round from the user's initial door choice.
 *
 * Models uniform, independent hidden car placement and an informed host. The
 * car draw happens when the user makes the first choice, which is
 * distributionally equivalent to preparing it beforehand because the draw does
 * not depend on `initialDoor`.
 *
 * Steps:
 * 1. Choose the car door uniformly from {0, 1, 2} using `rng`.
 * 2. Legal host doors are those that are neither `initialDoor` nor the car.
 * 3. If two legal host doors exist, choose one uniformly; if only one, use it.
 * 4. The switch door is the other unopened door (not the initial, not opened).
 *
 * This helper does NOT pick a final decision for the user and never uses a
 * "win with probability 2/3" shortcut: the result depends on the actual car
 * location, which the caller keeps hidden until the reveal.
 *
 * @param {number} initialDoor The player's initial door: 0, 1 or 2.
 * @param {() => number} [rng] Random source returning values in [0, 1).
 *   Defaults to `Math.random`.
 * @returns {{ initialDoor: number, carDoor: number, openedDoor: number,
 *   switchDoor: number }} The hidden doors for this round. No decision is
 *   preselected; the player chooses stay or switch in the UI.
 * @throws {TypeError} If `initialDoor` is not 0, 1 or 2, or `rng` is not a
 *   function.
 */
export function createInteractiveMontyHallRound(initialDoor, rng = Math.random) {
  if (!Number.isInteger(initialDoor) || !DOORS.includes(initialDoor)) {
    throw new TypeError(
      `createInteractiveMontyHallRound initialDoor must be 0, 1 or 2, received ${initialDoor}.`,
    );
  }
  if (typeof rng !== 'function') {
    throw new TypeError(
      `createInteractiveMontyHallRound requires an rng function, received ${typeof rng}.`,
    );
  }

  const carDoor = pickDoor(rng());

  // Legal host doors: not the player's door and not the car door.
  const legalHostDoors = DOORS.filter((door) => door !== initialDoor && door !== carDoor);
  const openedDoor = legalHostDoors[pickIndex(rng() * legalHostDoors.length)];

  // The switch door is the only door that is neither the initial nor the opened one.
  const switchDoor = DOORS.find((door) => door !== initialDoor && door !== openedDoor);

  return {
    initialDoor,
    carDoor,
    openedDoor,
    switchDoor,
  };
}

/**
 * Validate the number of experiments for the engine.
 *
 * The engine accepts 1 (useful for edge tests). The future UI is still
 * responsible for restricting the user to [100, 50000].
 *
 * @param {unknown} experiments Candidate experiment count.
 * @throws {TypeError|RangeError} If it is not an integer within [1, 50000].
 */
function assertExperiments(experiments) {
  if (typeof experiments !== 'number') {
    throw new TypeError(`experiments must be a number, received ${typeof experiments}.`);
  }
  if (!Number.isInteger(experiments)) {
    throw new RangeError(`experiments must be an integer, received ${experiments}.`);
  }
  if (experiments < MIN_EXPERIMENTS || experiments > MAX_EXPERIMENTS) {
    throw new RangeError(
      `experiments must be within [${MIN_EXPERIMENTS}, ${MAX_EXPERIMENTS}], received ${experiments}.`,
    );
  }
}

/**
 * Run a Monty Hall simulation and return paired switch/stay results.
 *
 * Both strategies are evaluated on the same trials: `switchWins + stayWins`
 * equals `experiments`, and their empirical rates sum to approximately 1. The
 * returned rates are raw `wins / experiments` ratios (not rounded or formatted).
 *
 * @param {{ experiments: number, seed?: number }} params
 *   `experiments`: integer in [1, 50000] (the UI keeps the user in [100, 50000]).
 *   `seed`: optional; if present and not `undefined` it is validated by
 *   `createSeededRng` (seed 0 is honored and is NOT treated as absent). Strings
 *   are rejected — the future UI must parse input before calling this engine.
 * @returns {{ experiments: number, switchWins: number, stayWins: number,
 *   switchWinRate: number, stayWinRate: number }} Aggregate counts and rates.
 * @throws {TypeError|RangeError} If the arguments are invalid.
 */
export function runMontyHallSimulation({ experiments, seed } = {}) {
  assertExperiments(experiments);

  // Validate the seed before choosing the RNG so invalid seeds fail fast.
  const hasSeed = seed !== undefined;
  if (hasSeed) {
    // Reuse the RNG's validation and normalization by constructing once.
    createSeededRng(seed);
  }

  const rng = hasSeed ? createSeededRng(seed) : Math.random;

  let switchWins = 0;
  let stayWins = 0;

  for (let i = 0; i < experiments; i += 1) {
    const trial = simulateMontyHallTrial(rng);
    if (trial.switchWin) {
      switchWins += 1;
    }
    if (trial.stayWin) {
      stayWins += 1;
    }
  }

  return {
    experiments,
    switchWins,
    stayWins,
    switchWinRate: switchWins / experiments,
    stayWinRate: stayWins / experiments,
  };
}
