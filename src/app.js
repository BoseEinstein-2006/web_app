// The whole game lives in this one file because this is a static GitHub Pages app.
// There is no backend: every screen, score, deck update, and resume action is local.

// localStorage key used to persist and resume an unfinished game.
const STORAGE_KEY = "party-card-game-state-v1";

// The page sets this in index.html. Bump it when deploying changes that should
// force existing browsers to load fresh files and reset older saved state.
const APP_VERSION = window.APP_VERSION || "dev";
const VERSION_KEY = "party-card-app-version";

// The spec asks for timed turns; changing this value adjusts all turns at once.
const TURN_SECONDS = 60;

// The game has three rounds using the same deck with different clue rules.
const MAX_ROUNDS = 3;

// #app is the only DOM mount point. render() replaces its contents per screen.
const app = document.querySelector("#app");

// Loaded once from public/cards.json at startup.
let allCards = [];

// state is the single source of truth for the app.
// If localStorage contains a saved game, loadState() restores it immediately.
let state = loadState();

// Holds the interval id while an active turn is counting down.
let timerId = null;

init();

async function init() {
  // Cards must be available before the setup screen can validate deck size.
  allCards = await loadCards();
  render();
}

async function loadCards() {
  try {
    // GitHub Pages serves public/cards.json as a plain static asset.
    const response = await fetch("./public/cards.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load cards");
    return await response.json();
  } catch (error) {
    // Tiny fallback deck prevents a completely blank app if the JSON request fails.
    return [
      { id: 1, name: "Harry Potter" },
      { id: 2, name: "Darth Vader" },
      { id: 3, name: "Albert Einstein" },
      { id: 4, name: "Mona Lisa" },
      { id: 5, name: "Godzilla" },
    ];
  }
}

function loadState() {
  try {
    // If index.html announces a new app version, throw away old saved state.
    // This prevents an old localStorage screen from hiding a newly deployed home UI.
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion !== APP_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, APP_VERSION);
      return null;
    }

    // A saved JSON blob means the user can close the browser and continue later.
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    // If saved data is corrupted, fail safely by starting from the home screen.
    return null;
  }
}

function saveState() {
  // Save after every meaningful game action: correct, skip, turn end, round end, etc.
  if (state) {
    localStorage.setItem(VERSION_KEY, APP_VERSION);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function clearState() {
  // Used by Play Again to throw away the finished game before starting setup.
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  state = null;
}

function render() {
  // Each render owns its own event listeners/timer. Clearing avoids duplicate timers.
  clearInterval(timerId);
  timerId = null;

  if (!state) {
    renderHome();
    return;
  }

  // Basic screen router: state.screen decides which UI function draws the page.
  if (state.screen === "setup") renderSetup();
  if (state.screen === "rules") renderRules();
  if (state.screen === "turn-start") renderTurnStart();
  if (state.screen === "active-turn") renderActiveTurn();
  if (state.screen === "turn-summary") renderTurnSummary();
  if (state.screen === "round-complete") renderRoundComplete();
  if (state.screen === "game-over") renderGameOver();
}

function renderHome() {
  // Resume appears only when there is a saved game in localStorage.
  const hasSavedGame = Boolean(localStorage.getItem(STORAGE_KEY));
  app.innerHTML = `
    <section class="screen hero">
      <h1>Monikers у нас дома</h1>
      <div class="button-stack">
        <button class="primary" data-action="new-game">Новая игра</button>
        <button class="secondary" data-action="resume-game" ${hasSavedGame ? "" : "disabled"}>Продолжить игру</button>
        <button class="rules-button" data-action="rules">Правила</button>
      </div>
    </section>
  `;

  on("new-game", () => {
    // New Game does not immediately create the deck; it first opens setup.
    state = { screen: "setup" };
    render();
  });

  on("resume-game", () => {
    if (!hasSavedGame) return;

    // Resume restores the exact previous state, including round/team/deck.
    state = loadState();
    render();
  });

  on("rules", () => {
    // Rules is not saved as a game state; it is just a temporary info screen.
    state = { screen: "rules" };
    render();
  });
}

function renderRules() {
  app.innerHTML = `
    <section class="screen rules-screen">
      <button class="back-button" data-action="back-home" aria-label="Назад">←</button>
      <img class="rules-image" src="./gorilla_image.jpg" alt="Правила игры" />
    </section>
  `;

  on("back-home", () => {
    state = null;
    render();
  });
}

function renderSetup() {
  // Setup collects the team names and deck size needed to start a game.
  const defaults = getSetupDefaults();
  app.innerHTML = `
    <section class="screen card-panel setup-screen">
      <button class="back-button setup-back-button" data-action="back-home" aria-label="Назад">←</button>
      <form id="setup-form" class="setup-form">
        ${field("teamA", "Название команды 1", defaults.teamA, "text")}
        ${field("teamB", "Название команды 2", defaults.teamB, "text")}
        ${field("deckSize", "Карт в колоде", defaults.deckSize, "number", 5, allCards.length)}
        <button class="primary" type="submit">Начать игру</button>
      </form>
    </section>
  `;

  on("back-home", () => {
    state = null;
    render();
  });

  document.querySelector("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // Clamp deck size so the user cannot ask for more cards than cards.json contains.
    const deckSize = clamp(Number(form.get("deckSize")) || 40, 5, allCards.length);

    // A new game uses a random subset of the built-in card database.
    const selectedCards = shuffle([...allCards]).slice(0, deckSize);

    // This object is the full game save file. Keeping it serializable makes
    // localStorage resume simple and reliable.
    state = {
      screen: "turn-start",
      round: 1,
      teams: [
        { name: clean(form.get("teamA")) || "Команда А" },
        { name: clean(form.get("teamB")) || "Команда Б" },
      ],
      currentTeam: 0,

      // originalDeck never changes; rounds 2 and 3 rebuild from this same card set.
      originalDeck: selectedCards.map((card) => card.id),

      // Store cards by id so the mutable decks only need to carry small ids.
      cardsById: Object.fromEntries(selectedCards.map((card) => [card.id, card])),

      // remainingDeck is the live draw pile for the current round.
      remainingDeck: shuffle(selectedCards.map((card) => card.id)),

      // guessedPile and skippedPile mirror the deck-management rules in the spec.
      guessedPile: [],
      skippedPile: [],

      // roundScores[roundIndex][teamIndex], e.g. roundScores[0][1] is Team B in round 1.
      roundScores: Array.from({ length: MAX_ROUNDS }, () => [0, 0]),
      totalScores: [0, 0],

      // lastTurn powers the summary screen; activeTurn powers the timer/card screen.
      lastTurn: null,
      activeTurn: null,
    };
    saveState();
    render();
  });
}

function getSetupDefaults() {
  return {
    teamA: state?.teams?.[0]?.name || "Команда А",
    teamB: state?.teams?.[1]?.name || "Команда Б",
    deckSize: state?.originalDeck?.length || 40,
  };
}

function field(name, label, value, type, min = null, max = null) {
  // Small helper keeps the setup form markup consistent and readable.
  const attrs = [
    `id="${name}"`,
    `name="${name}"`,
    `type="${type}"`,
    `value="${value}"`,
    min !== null ? `min="${min}"` : "",
    max !== null ? `max="${max}"` : "",
  ].join(" ");

  return `
    <label>
      <span>${label}</span>
      <input ${attrs} />
    </label>
  `;
}

function renderTurnStart() {
  // Turn Start is the handoff screen. The phone can be passed before the timer starts.
  app.innerHTML = `
    <section class="screen card-panel center setup-screen">
      <button class="back-button setup-back-button" data-action="back-setup" aria-label="Назад">←</button>
      <p class="round-label">РАУНД ${state.round}</p>
      <h2>Ход команды ${currentTeam().name}</h2>
      <p class="lede">Осталось карт: ${state.remainingDeck.length}</p>
      <button class="primary" data-action="start-turn">Начать ход</button>
    </section>
  `;

  on("start-turn", startTurn);
  on("back-setup", () => {
    // Return to setup with the selected values preserved for quick corrections.
    state.screen = "setup";
    saveState();
    render();
  });
}

function startTurn() {
  // Skips belong to a single turn, so each new turn begins with an empty skipped pile.
  state.skippedPile = [];

  // Store startedAt instead of decrementing saved seconds. This makes refresh/resume
  // during a turn behave naturally because remaining time is calculated from real time.
  state.activeTurn = {
    startedAt: Date.now(),
    duration: TURN_SECONDS,
    score: 0,
    skipped: 0,
    correctIds: [],
    skippedIds: [],
    currentCardId: state.remainingDeck[0],
  };
  state.feedback = null;
  state.screen = "active-turn";
  saveState();
  render();
}

function renderActiveTurn() {
  const turn = state.activeTurn;

  // The timer is derived from Date.now(), so it stays accurate even if rendering pauses.
  const secondsLeft = getSecondsLeft(turn);

  if (secondsLeft <= 0) {
    endTurn();
    return;
  }

  const card = state.cardsById[turn.currentCardId];
  app.innerHTML = `
    <section class="screen play-screen ${state.feedback ? `flash-${state.feedback}` : ""}">
      <button class="back-button play-back-button" data-action="cancel-turn" aria-label="Назад">←</button>
      <div class="top-row">
        <span>РАУНД ${state.round}</span>
        <span>${currentTeam().name}</span>
      </div>
      <div class="timer" data-timer>${secondsLeft}</div>
      <article class="current-card">${card?.name || "Нет карты"}</article>
      <div class="action-grid">
        <button class="correct" data-action="correct">Правильно</button>
        <button class="skip" data-action="skip">Пропустить</button>
      </div>
    </section>
  `;

  on("cancel-turn", cancelActiveTurn);
  on("correct", markCorrect);
  on("skip", markSkipped);

  if (state.feedback) {
    const feedback = state.feedback;
    setTimeout(() => {
      if (state?.screen === "active-turn" && state.feedback === feedback) {
        state.feedback = null;
        saveState();
        render();
      }
    }, 260);
  }

  // Repaint only the timer text every 250ms. Card/scores rerender after button clicks.
  timerId = setInterval(() => {
    const nextSeconds = getSecondsLeft(turn);
    const timer = document.querySelector("[data-timer]");
    if (timer) timer.textContent = nextSeconds;
    if (nextSeconds <= 0) endTurn();
  }, 250);
}

function markCorrect() {
  const cardId = state.activeTurn.currentCardId;

  // Correct cards leave the remaining deck permanently for this round.
  state.remainingDeck = state.remainingDeck.filter((id) => id !== cardId);
  state.guessedPile.push(cardId);
  state.activeTurn.correctIds.push(cardId);

  // Update both the active-turn score and the persistent round/total scoreboards.
  state.activeTurn.score += 1;
  state.roundScores[state.round - 1][state.currentTeam] += 1;
  state.totalScores[state.currentTeam] += 1;
  state.feedback = "correct";

  // If no skipped cards are waiting, the final correct card completes the round.
  // If skipped cards exist, the turn ends so they can return and be guessed later.
  if (state.remainingDeck.length === 0) {
    if (state.skippedPile.length === 0) {
      completeRound();
    } else {
      endTurn();
    }
    return;
  }

  // Otherwise the next card is simply the new first card in the remaining deck.
  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function markSkipped() {
  const cardId = state.activeTurn.currentCardId;

  // Skipped cards leave the live deck for now, but return at the end of the turn.
  state.remainingDeck = state.remainingDeck.filter((id) => id !== cardId);
  state.skippedPile.push(cardId);
  state.activeTurn.skippedIds.push(cardId);
  state.activeTurn.skipped += 1;
  state.feedback = "skip";

  // If every visible card was skipped, end the turn and recycle the skipped pile.
  if (state.remainingDeck.length === 0) {
    endTurn();
    return;
  }

  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function cancelActiveTurn() {
  clearInterval(timerId);

  const correctIds = state.activeTurn?.correctIds || [];
  const skippedIds = state.activeTurn?.skippedIds || [];

  // Undo score/card changes from this unfinished turn before returning to handoff.
  state.guessedPile = state.guessedPile.filter((id) => !correctIds.includes(id));
  state.skippedPile = state.skippedPile.filter((id) => !skippedIds.includes(id));
  state.roundScores[state.round - 1][state.currentTeam] -= correctIds.length;
  state.totalScores[state.currentTeam] -= correctIds.length;
  state.remainingDeck = shuffle([...state.remainingDeck, ...correctIds, ...skippedIds]);

  state.activeTurn = null;
  state.feedback = null;
  state.screen = "turn-start";
  saveState();
  render();
}

function endTurn() {
  clearInterval(timerId);

  // The important deck rule: skipped cards come back, then the deck is reshuffled.
  state.remainingDeck = shuffle([...state.remainingDeck, ...state.skippedPile]);

  // Snapshot summary info before switching teams, because the summary screen needs both.
  state.lastTurn = {
    teamName: currentTeam().name,
    score: state.activeTurn?.score || 0,
    nextTeamName: otherTeam().name,
    remaining: state.remainingDeck.length,
  };
  state.skippedPile = [];
  state.activeTurn = null;
  state.feedback = null;

  // Teams alternate every turn: Team A -> Team B -> Team A -> ...
  state.currentTeam = state.currentTeam === 0 ? 1 : 0;
  state.screen = "turn-summary";
  saveState();
  render();
}

function renderTurnSummary() {
  // The summary is the pause between teams after the timer runs out.
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">Время вышло</p>
      <h2>${state.lastTurn.teamName}: угадано карт ${state.lastTurn.score}</h2>
      <p class="lede">Осталось карт: ${state.lastTurn.remaining}</p>
      <p class="lede">Следующая команда: ${state.lastTurn.nextTeamName}</p>
      <button class="primary" data-action="next-turn">Начать ход команды ${state.lastTurn.nextTeamName}</button>
    </section>
  `;

  on("next-turn", () => {
    // Move back to the handoff screen for the next team.
    state.screen = "turn-start";
    saveState();
    render();
  });
}

function completeRound() {
  clearInterval(timerId);

  // The deck is empty, so no turn summary is needed. Show round results or final results.
  state.activeTurn = null;
  state.skippedPile = [];
  state.feedback = null;

  // Switch the next starting team so turns keep alternating across round boundaries.
  state.currentTeam = state.currentTeam === 0 ? 1 : 0;
  state.screen = state.round >= MAX_ROUNDS ? "game-over" : "round-complete";
  saveState();
  render();
}

function renderRoundComplete() {
  // Round Complete displays only the round just finished, then starts the next round.
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">Раунд завершён</p>
      <h2>Раунд ${state.round} завершён</h2>
      ${roundPlacementRows(state.round - 1)}
      <button class="primary next-round-button" data-action="next-round">Начать раунд ${state.round + 1}</button>
    </section>
  `;

  on("next-round", () => {
    state.round += 1;

    // Rounds 2 and 3 reuse the exact original cards, reshuffled into a fresh deck.
    state.remainingDeck = shuffle([...state.originalDeck]);
    state.guessedPile = [];
    state.skippedPile = [];
    state.lastTurn = null;
    state.screen = "turn-start";
    saveState();
    render();
  });
}

function roundPlacementRows(roundIndex) {
  const scores = state.roundScores[roundIndex];

  if (scores[0] === scores[1]) {
    return `
      <div class="score-row placement-row"><span>🤝 <strong>${state.teams[0].name}</strong></span><strong>${scores[0]}</strong></div>
      <div class="score-row placement-row"><span>🤝 <strong>${state.teams[1].name}</strong></span><strong>${scores[1]}</strong></div>
    `;
  }

  const firstIndex = scores[0] > scores[1] ? 0 : 1;
  const secondIndex = firstIndex === 0 ? 1 : 0;

  return `
    <div class="score-row placement-row"><span>🥇 <strong>${state.teams[firstIndex].name}</strong></span><strong>${scores[firstIndex]}</strong></div>
    <div class="score-row placement-row"><span>🥈 <strong>${state.teams[secondIndex].name}</strong></span><strong>${scores[secondIndex]}</strong></div>
  `;
}

function renderGameOver() {
  // Winner is calculated from total scores after round 3 completes.
  const winner =
    state.totalScores[0] === state.totalScores[1]
      ? "Ничья"
      : `Победила команда ${state.teams[state.totalScores[0] > state.totalScores[1] ? 0 : 1].name}`;

  app.innerHTML = `
    <section class="screen card-panel">
      <p class="eyebrow">Игра окончена</p>
      <h2>${winner}</h2>
      <div class="score-board">
        ${Array.from({ length: MAX_ROUNDS }, (_, index) => `
          <div class="score-block">
            <h3>Раунд ${index + 1}</h3>
            ${scoreRows(index)}
          </div>
        `).join("")}
        <div class="score-block total">
          <h3>Итого</h3>
          ${totalRows()}
        </div>
      </div>
      <button class="primary" data-action="play-again">Играть снова</button>
    </section>
  `;

  on("play-again", () => {
    // Finished games are cleared so the next setup starts fresh.
    clearState();
    state = { screen: "setup" };
    render();
  });
}

function scoreRows(roundIndex) {
  // Shared markup for showing one round's Team A / Team B scores.
  return `
    <div class="score-row"><span><strong>${state.teams[0].name}</strong></span><strong>${state.roundScores[roundIndex][0]}</strong></div>
    <div class="score-row"><span><strong>${state.teams[1].name}</strong></span><strong>${state.roundScores[roundIndex][1]}</strong></div>
  `;
}

function totalRows() {
  // Shared markup for the final total scoreboard.
  return `
    <div class="score-row"><span><strong>${state.teams[0].name}</strong></span><strong>${state.totalScores[0]}</strong></div>
    <div class="score-row"><span><strong>${state.teams[1].name}</strong></span><strong>${state.totalScores[1]}</strong></div>
  `;
}

function currentTeam() {
  // Convenience helper so render functions do not repeat state.teams[state.currentTeam].
  return state.teams[state.currentTeam];
}

function otherTeam() {
  // Used by turn summaries to show who receives the phone next.
  return state.teams[state.currentTeam === 0 ? 1 : 0];
}

function getSecondsLeft(turn) {
  // Timer math is based on actual elapsed wall-clock time.
  const elapsed = Math.floor((Date.now() - turn.startedAt) / 1000);
  return Math.max(0, turn.duration - elapsed);
}

function on(action, handler) {
  // Buttons declare data-action="..." in their HTML. This helper binds by that name.
  const element = document.querySelector(`[data-action="${action}"]`);
  if (element) element.addEventListener("click", handler);
}

function shuffle(items) {
  // Fisher-Yates shuffle. Used for initial deck selection and skipped-card recycling.
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function clean(value) {
  // Normalize form values before storing team names.
  return String(value || "").trim();
}

function clamp(value, min, max) {
  // Keeps numeric setup fields inside safe bounds.
  return Math.min(Math.max(value, min), max);
}
