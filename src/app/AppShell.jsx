import { useState } from 'react'
import { attractions, getAttractionById } from './attractions.js'
import HomePage from './HomePage.jsx'
import ControlPanel from '../components/ControlPanel.jsx'
import ChartPanel from '../components/ChartPanel.jsx'
import TheoryCard from '../components/TheoryCard.jsx'
import MontyHall from '../features/monty-hall/MontyHall.jsx'
import Roulette from '../features/roulette/Roulette.jsx'
import HouseEdge from '../features/house-edge/HouseEdge.jsx'
import LoadedDie from '../features/loaded-die/LoadedDie.jsx'
import Poker from '../features/poker/Poker.jsx'
import TwoDice from '../features/two-dice/TwoDice.jsx'
import Birthday from '../features/birthday/Birthday.jsx'
import '../components/panels.css'

/*
 * The sidebar navigation. The first entry is Home (the catalog); the rest are
 * the existing attraction groups. Group labels use the metadata group names.
 */
const navGroups = [
  { label: 'Casino', group: 'Casino' },
  { label: 'Other Attractions', group: 'Others' },
]

/* Sentinel id for the Home catalog view. */
const HOME = 'home'

/**
 * Render one sidebar navigation button.
 *
 * @param {object} props
 * @param {string} props.label - Visible text.
 * @param {boolean} props.isSelected - Whether this item is the current view.
 * @param {() => void} props.onClick - Selection handler.
 * @returns {import('react').ReactElement} The navigation button.
 */
function NavButton({ label, isSelected, onClick }) {
  return (
    <button
      type="button"
      className={
        isSelected
          ? 'sidebar__link sidebar__link--selected'
          : 'sidebar__link'
      }
      aria-current={isSelected ? 'page' : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/**
 * The application shell: a Stat-Vegas sidebar plus a main column with a slim
 * top bar. The main column shows either the Home catalog or an attraction
 * placeholder view. All navigation is local state — no router, URL or storage.
 *
 * @returns {import('react').ReactElement} The shell layout.
 */
function AppShell() {
  // Home is the initial view; selecting an attraction swaps the main content.
  const [selectedId, setSelectedId] = useState(HOME)
  const isHome = selectedId === HOME
  const selected = isHome ? undefined : getAttractionById(selectedId)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <p className="sidebar__brand-name">Stat-Vegas</p>
          <p className="sidebar__brand-subtitle">Casino &amp; Paradoxes</p>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <ul className="sidebar__list">
            <li>
              <NavButton
                label="Home"
                isSelected={isHome}
                onClick={() => setSelectedId(HOME)}
              />
            </li>
          </ul>

          {navGroups.map((navGroup) => (
            <div className="sidebar__group" key={navGroup.group}>
              <h2 className="sidebar__group-label">{navGroup.label}</h2>
              <ul className="sidebar__list">
                {attractions
                  .filter((attraction) => attraction.group === navGroup.group)
                  .map((attraction) => (
                    <li key={attraction.id}>
                      <NavButton
                        label={attraction.title}
                        isSelected={attraction.id === selectedId}
                        onClick={() => setSelectedId(attraction.id)}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar__note">
          Educational simulations only. No real money.
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <span className="topbar__tagline">Learn. Explore. Play.</span>
        </header>

        <main className="app-content">
          {isHome ? (
            <HomePage onSelect={setSelectedId} />
          ) : selected.id === 'monty-hall' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <MontyHall />
            </article>
          ) : selected.id === 'roulette' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <Roulette />
            </article>
          ) : selected.id === 'house-edge' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <HouseEdge />
            </article>
          ) : selected.id === 'loaded-die' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <LoadedDie />
            </article>
          ) : selected.id === 'poker' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <Poker />
            </article>
          ) : selected.id === 'two-dice' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <TwoDice />
            </article>
          ) : selected.id === 'birthday' ? (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <Birthday />
            </article>
          ) : (
            <article className="attraction-view">
              <h1 className="attraction-view__title">{selected.title}</h1>
              <p className="attraction-view__topic">{selected.topic}</p>
              <p className="attraction-view__badge">Not implemented yet</p>

              <div className="placeholder-grid">
                <ControlPanel>
                  <p className="placeholder-text">
                    The labeled inputs for this attraction will appear here: the
                    parameters, the number of trials and an optional seed, plus
                    the Run and Reset buttons.
                  </p>
                </ControlPanel>

                <ChartPanel>
                  <p className="placeholder-text">
                    After a run, this panel will show the simulated value, the
                    theoretical value, the difference between them, a chart and
                    a short plain-English summary.
                  </p>
                </ChartPanel>

                <TheoryCard>
                  <p className="placeholder-text">
                    This panel will explain the exact mathematics: the formula,
                    its assumptions, what each variable means and the
                    theoretical result.
                  </p>
                </TheoryCard>
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}

export default AppShell

