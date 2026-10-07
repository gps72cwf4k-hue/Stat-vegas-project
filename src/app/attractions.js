/*
 * Attraction metadata for the navigation.
 *
 * This file is metadata only: it lists what each attraction is called and
 * which course topic it covers. It contains no formulas and no simulation
 * logic — those live in the individual features when they are built.
 *
 * Field meanings:
 *   id    — short identifier used as the selected value (never shown to users)
 *   title — English name shown in the navigation and the page heading
 *   group — "Casino" or "Others", used to group the navigation
 *   topic — the course topic this attraction demonstrates (README section 3)
 */

export const attractions = [
  {
    id: 'poker',
    title: 'Poker',
    group: 'Casino',
    topic: 'Set theory, event algebra, discrete space, combinatorics',
  },
  {
    id: 'roulette',
    title: 'Roulette & Rare Jackpot',
    group: 'Casino',
    topic: 'Independence, Bernoulli scheme, Poisson approximation',
  },
  {
    id: 'loaded-die',
    title: 'Loaded Die',
    group: 'Casino',
    topic: 'Total probability, Bayes',
  },
  {
    id: 'house-edge',
    title: 'The House Edge',
    group: 'Casino',
    topic: 'Random variables, PMF/CDF, expectation, variance, distributions',
  },
  {
    id: 'two-dice',
    title: 'Two Dice',
    group: 'Casino',
    topic: 'Joint distributions, marginals, covariance, densities',
  },
  {
    id: 'birthday',
    title: 'Birthday Paradox',
    group: 'Others',
    topic: 'Discrete space, independence',
  },
  {
    id: 'darts',
    title: 'Geometric Darts',
    group: 'Others',
    topic: 'General probability space, uniform density',
  },
  {
    id: 'monty-hall',
    title: 'Monty Hall',
    group: 'Others',
    topic: 'Conditional probability, Bayes',
  },
]

/* The attraction selected when the app first opens. */
export const defaultAttractionId = 'monty-hall'

/**
 * Find one attraction by its id.
 *
 * @param {string} id - The attraction id to look up.
 * @returns {object | undefined} The matching attraction, or undefined.
 */
export function getAttractionById(id) {
  return attractions.find((attraction) => attraction.id === id)
}
