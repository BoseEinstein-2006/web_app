const STORAGE_KEY = "monikers-game-state-v1";
const TURN_SECONDS = 60;
const MAX_ROUNDS = 3;

const app = document.querySelector("#app");
let allCards = [];
let state = loadState();
let timerId = null;

init();

async function init() {
  allCards = await loadCards();
  render();
}

async function loadCards() {
  try {
    const response = await fetch("./public/cards.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load cards");
    return await response.json();
  } catch (error) {
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
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveState() {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
}

function render() {
  clearInterval(timerId);
  timerId = null;

  if (!state) {
    renderHome();
    return;
  }

  if (state.screen === "setup") renderSetup();
  if (state.screen === "turn-start") renderTurnStart();
  if (state.screen === "active-turn") renderActiveTurn();
  if (state.screen === "turn-summary") renderTurnSummary();
  if (state.screen === "round-complete") renderRoundComplete();
  if (state.screen === "game-over") renderGameOver();
}

function renderHome() {
  const hasSavedGame = Boolean(localStorage.getItem(STORAGE_KEY));
  app.innerHTML = `
    <section class="screen hero">
      <p class="eyebrow">Pass-and-play party chaos</p>
      <h1>MONIKERS</h1>
      <p class="lede">One phone. Two teams. Three rounds of increasingly questionable clues.</p>
      <div class="button-stack">
        <button class="primary" data-action="new-game">New Game</button>
        ${hasSavedGame ? '<button class="secondary" data-action="resume-game">Resume Game</button>' : ""}
      </div>
    </section>
  `;

  on("new-game", () => {
    state = { screen: "setup" };
    render();
  });

  on("resume-game", () => {
    state = loadState();
    render();
  });
}

function renderSetup() {
  app.innerHTML = `
    <section class="screen card-panel">
      <p class="eyebrow">New Game Setup</p>
      <h2>Choose your chaos settings</h2>
      <form id="setup-form" class="setup-form">
        ${field("teamA", "Team 1 Name", "Team A", "text")}
        ${field("teamASize", "Team 1 Players", "3", "number", 1)}
        ${field("teamB", "Team 2 Name", "Team B", "text")}
        ${field("teamBSize", "Team 2 Players", "3", "number", 1)}
        ${field("deckSize", "Cards In Deck", "40", "number", 5, allCards.length)}
        <button class="primary" type="submit">Start Game</button>
      </form>
    </section>
  `;

  document.querySelector("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const deckSize = clamp(Number(form.get("deckSize")) || 40, 5, allCards.length);
    const selectedCards = shuffle([...allCards]).slice(0, deckSize);

    state = {
      screen: "turn-start",
      round: 1,
      teams: [
        { name: clean(form.get("teamA")) || "Team A", players: Number(form.get("teamASize")) || 3 },
        { name: clean(form.get("teamB")) || "Team B", players: Number(form.get("teamBSize")) || 3 },
      ],
      currentTeam: 0,
      originalDeck: selectedCards.map((card) => card.id),
      cardsById: Object.fromEntries(selectedCards.map((card) => [card.id, card])),
      remainingDeck: shuffle(selectedCards.map((card) => card.id)),
      guessedPile: [],
      skippedPile: [],
      roundScores: Array.from({ length: MAX_ROUNDS }, () => [0, 0]),
      totalScores: [0, 0],
      lastTurn: null,
      activeTurn: null,
    };
    saveState();
    render();
  });
}

function field(name, label, value, type, min = null, max = null) {
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
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="round-label">ROUND ${state.round}</p>
      <h2>${currentTeam().name} Turn</h2>
      <p class="lede">${state.remainingDeck.length} cards remaining</p>
      <button class="primary" data-action="start-turn">Start Turn</button>
      <button class="ghost" data-action="home">Back to Home</button>
    </section>
  `;

  on("start-turn", startTurn);
  on("home", () => {
    state = null;
    renderHome();
  });
}

function startTurn() {
  state.skippedPile = [];
  state.activeTurn = {
    startedAt: Date.now(),
    duration: TURN_SECONDS,
    score: 0,
    skipped: 0,
    currentCardId: state.remainingDeck[0],
  };
  state.screen = "active-turn";
  saveState();
  render();
}

function renderActiveTurn() {
  const turn = state.activeTurn;
  const secondsLeft = getSecondsLeft(turn);

  if (secondsLeft <= 0) {
    endTurn();
    return;
  }

  const card = state.cardsById[turn.currentCardId];
  app.innerHTML = `
    <section class="screen play-screen">
      <div class="top-row">
        <span>ROUND ${state.round}</span>
        <span>${currentTeam().name}</span>
      </div>
      <div class="timer" data-timer>${secondsLeft}</div>
      <article class="current-card">${card?.name || "No card"}</article>
      <div class="action-grid">
        <button class="correct" data-action="correct">Correct</button>
        <button class="skip" data-action="skip">Skip</button>
      </div>
    </section>
  `;

  on("correct", markCorrect);
  on("skip", markSkipped);

  timerId = setInterval(() => {
    const nextSeconds = getSecondsLeft(turn);
    const timer = document.querySelector("[data-timer]");
    if (timer) timer.textContent = nextSeconds;
    if (nextSeconds <= 0) endTurn();
  }, 250);
}

function markCorrect() {
  const cardId = state.activeTurn.currentCardId;
  state.remainingDeck = state.remainingDeck.filter((id) => id !== cardId);
  state.guessedPile.push(cardId);
  state.activeTurn.score += 1;
  state.roundScores[state.round - 1][state.currentTeam] += 1;
  state.totalScores[state.currentTeam] += 1;

  if (state.remainingDeck.length === 0) {
    completeRound();
    return;
  }

  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function markSkipped() {
  const cardId = state.activeTurn.currentCardId;
  state.remainingDeck = state.remainingDeck.filter((id) => id !== cardId);
  state.skippedPile.push(cardId);
  state.activeTurn.skipped += 1;

  if (state.remainingDeck.length === 0) {
    endTurn();
    return;
  }

  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function endTurn() {
  clearInterval(timerId);
  state.remainingDeck = shuffle([...state.remainingDeck, ...state.skippedPile]);
  state.lastTurn = {
    teamName: currentTeam().name,
    score: state.activeTurn?.score || 0,
    nextTeamName: otherTeam().name,
    remaining: state.remainingDeck.length,
  };
  state.skippedPile = [];
  state.activeTurn = null;
  state.currentTeam = state.currentTeam === 0 ? 1 : 0;
  state.screen = "turn-summary";
  saveState();
  render();
}

function renderTurnSummary() {
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">Time's Up</p>
      <h2>${state.lastTurn.teamName} scored ${state.lastTurn.score} cards</h2>
      <p class="lede">Cards remaining: ${state.lastTurn.remaining}</p>
      <p class="lede">Next Team: ${state.lastTurn.nextTeamName}</p>
      <button class="primary" data-action="next-turn">Start Turn for ${state.lastTurn.nextTeamName}</button>
    </section>
  `;

  on("next-turn", () => {
    state.screen = "turn-start";
    saveState();
    render();
  });
}

function completeRound() {
  clearInterval(timerId);
  state.activeTurn = null;
  state.skippedPile = [];
  state.currentTeam = state.currentTeam === 0 ? 1 : 0;
  state.screen = state.round >= MAX_ROUNDS ? "game-over" : "round-complete";
  saveState();
  render();
}

function renderRoundComplete() {
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">Round Complete</p>
      <h2>Round ${state.round} Complete</h2>
      ${scoreRows(state.round - 1)}
      <button class="primary" data-action="next-round">Start Round ${state.round + 1}</button>
    </section>
  `;

  on("next-round", () => {
    state.round += 1;
    state.remainingDeck = shuffle([...state.originalDeck]);
    state.guessedPile = [];
    state.skippedPile = [];
    state.lastTurn = null;
    state.screen = "turn-start";
    saveState();
    render();
  });
}

function renderGameOver() {
  const winner =
    state.totalScores[0] === state.totalScores[1]
      ? "It is a tie"
      : `${state.teams[state.totalScores[0] > state.totalScores[1] ? 0 : 1].name} Wins`;

  app.innerHTML = `
    <section class="screen card-panel">
      <p class="eyebrow">GAME OVER</p>
      <h2>${winner}</h2>
      <div class="score-board">
        ${Array.from({ length: MAX_ROUNDS }, (_, index) => `
          <div class="score-block">
            <h3>Round ${index + 1}</h3>
            ${scoreRows(index)}
          </div>
        `).join("")}
        <div class="score-block total">
          <h3>Total</h3>
          ${totalRows()}
        </div>
      </div>
      <button class="primary" data-action="play-again">Play Again</button>
    </section>
  `;

  on("play-again", () => {
    clearState();
    state = { screen: "setup" };
    render();
  });
}

function scoreRows(roundIndex) {
  return `
    <div class="score-row"><span>${state.teams[0].name}</span><strong>${state.roundScores[roundIndex][0]}</strong></div>
    <div class="score-row"><span>${state.teams[1].name}</span><strong>${state.roundScores[roundIndex][1]}</strong></div>
  `;
}

function totalRows() {
  return `
    <div class="score-row"><span>${state.teams[0].name}</span><strong>${state.totalScores[0]}</strong></div>
    <div class="score-row"><span>${state.teams[1].name}</span><strong>${state.totalScores[1]}</strong></div>
  `;
}

function currentTeam() {
  return state.teams[state.currentTeam];
}

function otherTeam() {
  return state.teams[state.currentTeam === 0 ? 1 : 0];
}

function getSecondsLeft(turn) {
  const elapsed = Math.floor((Date.now() - turn.startedAt) / 1000);
  return Math.max(0, turn.duration - elapsed);
}

function on(action, handler) {
  const element = document.querySelector(`[data-action="${action}"]`);
  if (element) element.addEventListener("click", handler);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function clean(value) {
  return String(value || "").trim();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
