import { attractions } from './attractions.js'
import './HomePage.css'

/*
 * Home media assets (Vite URL imports). Filenames are used exactly as they
 * exist on disk. Loaded here rather than in the shared metadata file so the
 * shared attraction metadata stays presentation-free.
 */
import heroImage from '../assets/home/hero.PNG'
import cardPoker from '../assets/home/cadr-poker.JPG'
import cardRoulette from '../assets/home/cadr-roulette.JPG'
import cardLoadedDie from '../assets/home/cadr-loaded-die.JPG'
import cardHouseEdge from '../assets/home/card-house-edge.JPG'
import cardTwoDice from '../assets/home/card-two-dice.JPG'
import cardBirthday from '../assets/home/card-birthday.JPG'
import cardMontyHall from '../assets/home/card-monty-hall.JPG'
import cardGeometricDarts from '../assets/home/card-geometric-darts.JPG'

/* Per-attraction card media, keyed by the ids used in the attraction metadata. */
const cardImages = {
  poker: cardPoker,
  roulette: cardRoulette,
  'loaded-die': cardLoadedDie,
  'house-edge': cardHouseEdge,
  'two-dice': cardTwoDice,
  birthday: cardBirthday,
  darts: cardGeometricDarts,
  'monty-hall': cardMontyHall,
}

/*
 * Presentation-only badge labels mapped from the approved README topics.
 * Kept small and explicit here so the shared metadata file is not changed.
 */
const topicBadges = {
  poker: 'Topic 1',
  roulette: 'Topic 3',
  'loaded-die': 'Topic 4',
  'house-edge': 'Topic 5',
  'two-dice': 'Topic 6',
  birthday: 'Topic 1',
  darts: 'Topic 2',
  'monty-hall': 'Topic 4',
}

/* The catalog is split into the same two groups used elsewhere. */
const casinoAttractions = attractions.filter(
  (attraction) => attraction.group === 'Casino',
)
const otherAttractions = attractions.filter(
  (attraction) => attraction.group === 'Others',
)

/**
 * One attraction card. The whole card is a single native button.
 *
 * @param {object} props
 * @param {object} props.attraction - Attraction metadata (id, title, topic).
 * @param {(id: string) => void} props.onSelect - Called with the attraction id.
 * @returns {import('react').ReactElement} The card button.
 */
function AttractionCard({ attraction, onSelect }) {
  return (
    <button
      type="button"
      className="attraction-card"
      onClick={() => onSelect(attraction.id)}
    >
      <img
        className="attraction-card__media"
        src={cardImages[attraction.id]}
        alt={`${attraction.title} illustration`}
        loading="lazy"
        decoding="async"
      />
      <span className="attraction-card__title">{attraction.title}</span>
      <span className="attraction-card__topic">{attraction.topic}</span>
      <span className="attraction-card__footer">
        <span className="attraction-card__badge">
          {topicBadges[attraction.id]}
        </span>
        <span className="attraction-card__action">Explore</span>
      </span>
    </button>
  )
}

/**
 * The Home catalog page: an introductory hero, the attraction catalog and a
 * short "How it works" note. Informational only — no simulation or formulas.
 *
 * @param {object} props
 * @param {(id: string) => void} props.onSelect - Opens an attraction by id.
 * @returns {import('react').ReactElement} The Home page.
 */
function HomePage({ onSelect }) {
  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__text">
          <h1 className="home-hero__title">Stat-Vegas</h1>
          <p className="home-hero__subtitle">Casino &amp; Paradoxes</p>
          <p className="home-hero__lead">
            An interactive way to learn probability and mathematical statistics
            through casino games and famous paradoxes.
          </p>
          <a className="home-hero__cta" href="#attraction-catalog">
            Start Exploring
          </a>
        </div>
        <img
          className="home-hero__media"
          src={heroImage}
          alt="Illustration of a casino table with playing cards, dice and a roulette wheel"
          decoding="async"
        />
      </section>

      <section
        id="attraction-catalog"
        className="home-catalog"
        aria-labelledby="catalog-heading"
      >
        <h2 id="catalog-heading" className="home-catalog__heading">
          Choose an attraction
        </h2>

        <div className="home-catalog__grid home-catalog__grid--casino">
          {casinoAttractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              attraction={attraction}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div className="home-catalog__grid home-catalog__grid--others">
          {otherAttractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              attraction={attraction}
              onSelect={onSelect}
            />
          ))}

          <div className="how-it-works">
            <h3 className="how-it-works__title">How it works</h3>
            <ol className="how-it-works__steps">
              <li>Choose an attraction</li>
              <li>Run an experiment</li>
              <li>Compare results with theory</li>
            </ol>
            <p className="how-it-works__closing">
              Not just a game — probability in action.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage
