// The whole game lives in this one file because this is a static GitHub Pages app.
// There is no backend: every screen, score, deck update, and resume action is local.

// localStorage key used to persist and resume an unfinished game.
const STORAGE_KEY = "party-card-game-state-v1";
const LANGUAGE_KEY = "party-card-language";

// The page sets this in index.html. Bump it when deploying changes that should
// force existing browsers to load fresh files and reset older saved state.
const APP_VERSION = window.APP_VERSION || "dev";
const VERSION_KEY = "party-card-app-version";

// The spec asks for timed turns; changing this value adjusts all turns at once.
const TURN_SECONDS = 60;

// The game has three rounds using the same deck with different clue rules.
const MAX_ROUNDS = 3;

const LANGUAGES = {
  ru: {
    code: "ru",
    languageLabel: "Русский",
    title: "Monikers у нас дома",
    cardsPath: "./public/cards_ru_categories.json",
    rulesImage: "./gorilla_image.jpg",
    defaultTeams: ["Писи", "Сиси"],
    newGame: "Новая игра",
    continueGame: "Продолжить игру",
    rules: "Правила",
    back: "Назад",
    team1Label: "Название команды 1",
    team2Label: "Название команды 2",
    deckSizeLabel: "Карт в колоде",
    startGame: "Начать игру",
    round: "Раунд",
    teamTurn: (teamName) => `Ход команды ${teamName}`,
    cardsLeft: (count) => `Осталось карт: ${count}`,
    startTurn: "Начать ход",
    noCard: "Нет карты",
    correct: "Правильно",
    skip: "Пропустить",
    timeUp: "Время вышло",
    guessedCards: (teamName, score) => `${teamName}: угадано карт ${score}`,
    nextTeam: (teamName) => `Следующая команда: ${teamName}`,
    startTeamTurn: (teamName) => `Начать ход команды ${teamName}`,
    roundComplete: "Раунд завершён",
    roundCompleteTitle: (round) => `Раунд ${round} завершён`,
    startNextRound: (round) => `Начать раунд ${round}`,
    gameOver: "Игра окончена",
    draw: "Ничья",
    winner: (teamName) => `Победила команда ${teamName}`,
    total: "Итого",
    playAgain: "Играть снова",
    rulesAlt: "Правила игры",
  },
  en: {
    code: "en",
    languageLabel: "English",
    title: "Monikers at Home",
    cardsPath: "./public/cards_eng_categories.json",
    rulesImage: "./habibi_image.png",
    defaultTeams: ["Habibis", "Jews"],
    newGame: "New Game",
    continueGame: "Continue Game",
    rules: "Rules",
    back: "Back",
    team1Label: "Team 1 Name",
    team2Label: "Team 2 Name",
    deckSizeLabel: "Cards In Deck",
    startGame: "Start Game",
    round: "Round",
    teamTurn: (teamName) => `${teamName}'s Turn`,
    cardsLeft: (count) => `Cards left: ${count}`,
    startTurn: "Start Turn",
    noCard: "No card",
    correct: "Correct",
    skip: "Skip",
    timeUp: "Time's Up",
    guessedCards: (teamName, score) => `${teamName}: ${score} cards guessed`,
    nextTeam: (teamName) => `Next team: ${teamName}`,
    startTeamTurn: (teamName) => `Start ${teamName}'s turn`,
    roundComplete: "Round Complete",
    roundCompleteTitle: (round) => `Round ${round} Complete`,
    startNextRound: (round) => `Start Round ${round}`,
    gameOver: "Game Over",
    draw: "Draw",
    winner: (teamName) => `${teamName} wins`,
    total: "Total",
    playAgain: "Play Again",
    rulesAlt: "Game rules",
  },
};

// #app is the only DOM mount point. render() replaces its contents per screen.
const app = document.querySelector("#app");

// Loaded once per selected language at startup and whenever the home switch changes.
let allCards = [];
let selectedLanguage = loadLanguage();

// state is the single source of truth for the app.
// The app starts on the home screen; saved games load only from Continue.
let state = null;

// Holds the interval id while an active turn is counting down.
let timerId = null;

init();

async function init() {
  // Cards must be available before the setup screen can validate deck size.
  allCards = await loadCards();
  render();
}

async function loadCards(language = selectedLanguage) {
  try {
    // GitHub Pages serves the chosen language's JSON as a plain static asset.
    // Each card can include extra metadata, such as category; gameplay uses the name.
    const response = await fetch(LANGUAGES[language].cardsPath, { cache: "no-store" });
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

function loadLanguage() {
  const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
  return LANGUAGES[savedLanguage] ? savedLanguage : "ru";
}

function currentLanguage() {
  return state?.language || selectedLanguage;
}

function text() {
  return LANGUAGES[currentLanguage()];
}

async function setLanguage(language) {
  if (!LANGUAGES[language] || language === selectedLanguage) return;

  selectedLanguage = language;
  localStorage.setItem(LANGUAGE_KEY, language);
  allCards = await loadCards(language);
  render();
}

function getSavedState() {
  return loadState();
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
  const copy = text();
  const savedGame = getSavedState();
  const hasSavedGame = Boolean(savedGame && savedGame.language === selectedLanguage);
  app.innerHTML = `
    <section class="screen hero">
      <div class="language-switch" aria-label="Language">
        ${Object.values(LANGUAGES)
          .map((language) => `
            <button
              class="language-option ${language.code === selectedLanguage ? "active" : ""}"
              data-language="${language.code}"
              type="button"
            >${language.languageLabel}</button>
          `).join("")}
      </div>
      <h1>${copy.title}</h1>
      <div class="button-stack">
        <button class="primary" data-action="new-game">${copy.newGame}</button>
        <button class="secondary" data-action="resume-game" ${hasSavedGame ? "" : "disabled"}>${copy.continueGame}</button>
        <button class="rules-button" data-action="rules">${copy.rules}</button>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });

  on("new-game", () => {
    // New Game intentionally deletes saved progress before opening setup.
    clearState();
    state = { screen: "setup", language: selectedLanguage };
    render();
  });

  on("resume-game", () => {
    if (!hasSavedGame) return;

    // Resume restores the exact previous state, including round/team/deck.
    state = savedGame;
    resumePausedTurn();
    render();
  });

  on("rules", () => {
    // Rules is not saved as a game state; it is just a temporary info screen.
    state = { screen: "rules", language: selectedLanguage };
    render();
  });
}

function renderRules() {
  const copy = text();
  app.innerHTML = `
    <section class="screen rules-screen">
      <button class="back-button" data-action="back-home" aria-label="${copy.back}">←</button>
      <img class="rules-image" src="${copy.rulesImage}" alt="${copy.rulesAlt}" />
    </section>
  `;

  on("back-home", () => {
    state = null;
    render();
  });
}

function renderSetup() {
  // Setup collects the team names and deck size needed to start a game.
  const copy = text();
  const defaults = getSetupDefaults();
  app.innerHTML = `
    <section class="screen card-panel setup-screen">
      <button class="back-button setup-back-button" data-action="back-home" aria-label="${copy.back}">←</button>
      <form id="setup-form" class="setup-form">
        ${field("teamA", copy.team1Label, defaults.teamA, "text")}
        ${field("teamB", copy.team2Label, defaults.teamB, "text")}
        ${field("deckSize", copy.deckSizeLabel, defaults.deckSize, "number", 5, allCards.length)}
        <button class="primary" type="submit">${copy.startGame}</button>
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

    // Clamp deck size so the user cannot ask for more cards than the JSON contains.
    const deckSize = clamp(Number(form.get("deckSize")) || 40, 5, allCards.length);

    // A new game uses a random subset of the built-in card database.
    const selectedCards = shuffle([...allCards]).slice(0, deckSize);

    // This object is the full game save file. Keeping it serializable makes
    // localStorage resume simple and reliable.
    state = {
      screen: "turn-start",
      language: currentLanguage(),
      round: 1,
      teams: [
        { name: clean(form.get("teamA")) || copy.defaultTeams[0] },
        { name: clean(form.get("teamB")) || copy.defaultTeams[1] },
      ],
      currentTeam: 0,

      // originalDeck never changes; rounds 2 and 3 rebuild from this same card set.
      originalDeck: selectedCards.map((card) => card.id),

      // Store cards by id so the mutable decks only need to carry small ids.
      cardsById: Object.fromEntries(selectedCards.map((card) => [card.id, card])),

      // remainingDeck is the live draw pile for the current round.
      remainingDeck: shuffle(selectedCards.map((card) => card.id)),

      // guessedPile stores solved cards; skippedPile is kept for save compatibility.
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
  const copy = text();
  return {
    teamA: state?.teams?.[0]?.name || copy.defaultTeams[0],
    teamB: state?.teams?.[1]?.name || copy.defaultTeams[1],
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
  const copy = text();
  app.innerHTML = `
    <section class="screen card-panel center setup-screen">
      <button class="back-button setup-back-button" data-action="save-home" aria-label="${copy.back}">←</button>
      <p class="round-label">${copy.round} ${state.round}</p>
      <h2>${copy.teamTurn(currentTeam().name)}</h2>
      <p class="lede">${copy.cardsLeft(state.remainingDeck.length)}</p>
      <button class="primary" data-action="start-turn">${copy.startTurn}</button>
    </section>
  `;

  on("start-turn", startTurn);
  on("save-home", () => {
    // Save the current handoff state, then return to home so Continue can restore it.
    saveState();
    state = null;
    render();
  });
}

function startTurn() {
  // Skipped cards now rotate inside remainingDeck, so each new turn starts clean.
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
  const copy = text();
  const turn = state.activeTurn;

  // The timer is derived from Date.now(), so it stays accurate even if rendering pauses.
  const secondsLeft = getSecondsLeft(turn);

  if (secondsLeft <= 0) {
    endTurn();
    return;
  }

  const card = state.cardsById[turn.currentCardId];
  const cardName = card?.name || copy.noCard;
  const cardLengthClass = getCardLengthClass(cardName);
  app.innerHTML = `
    <section class="screen play-screen ${state.feedback ? `flash-${state.feedback}` : ""}">
      <button class="back-button play-back-button" data-action="pause-turn" aria-label="${copy.back}">←</button>
      <div class="top-row">
        <span>${copy.round} ${state.round}</span>
        <span>${currentTeam().name}</span>
      </div>
      <div class="timer" data-timer>${secondsLeft}</div>
      <article class="current-card ${cardLengthClass}">${cardName}</article>
      <div class="action-grid">
        <button class="correct" data-action="correct">${copy.correct}</button>
        <button class="skip" data-action="skip">${copy.skip}</button>
      </div>
    </section>
  `;

  on("pause-turn", pauseActiveTurn);
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

  // Correct answers permanently remove cards. When none remain, the round is done.
  if (state.remainingDeck.length === 0) {
    completeRound();
    return;
  }

  // Otherwise the next card is simply the new first card in the remaining deck.
  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function markSkipped() {
  const cardId = state.activeTurn.currentCardId;

  // Skipped cards stay available in this same turn: move this card to the back.
  // If it is the only card left, it stays visible and can be tried again.
  state.remainingDeck = [...state.remainingDeck.filter((id) => id !== cardId), cardId];
  state.activeTurn.skippedIds.push(cardId);
  state.activeTurn.skipped += 1;
  state.feedback = "skip";

  state.activeTurn.currentCardId = state.remainingDeck[0];
  saveState();
  render();
}

function pauseActiveTurn() {
  clearInterval(timerId);

  // Save the exact active-turn state, including already scored/skipped cards.
  state.activeTurn.remainingSeconds = getSecondsLeft(state.activeTurn);
  state.activeTurn.paused = true;
  state.feedback = null;
  saveState();

  state = null;
  render();
}

function resumePausedTurn() {
  if (state?.screen !== "active-turn" || !state.activeTurn?.paused) return;

  // Restart the countdown from the stored remaining seconds instead of real elapsed time.
  state.activeTurn.duration = state.activeTurn.remainingSeconds;
  state.activeTurn.startedAt = Date.now();
  state.activeTurn.paused = false;
  delete state.activeTurn.remainingSeconds;
  saveState();
}

function endTurn() {
  clearInterval(timerId);

  // The next team gets all unsolved cards in a fresh random order.
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
  const copy = text();
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">${copy.timeUp}</p>
      <h2>${copy.guessedCards(state.lastTurn.teamName, state.lastTurn.score)}</h2>
      <p class="lede">${copy.cardsLeft(state.lastTurn.remaining)}</p>
      <p class="lede">${copy.nextTeam(state.lastTurn.nextTeamName)}</p>
      <button class="primary" data-action="next-turn">${copy.startTeamTurn(state.lastTurn.nextTeamName)}</button>
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
  const copy = text();
  app.innerHTML = `
    <section class="screen card-panel center">
      <p class="eyebrow">${copy.roundComplete}</p>
      <h2>${copy.roundCompleteTitle(state.round)}</h2>
      ${roundPlacementRows(state.round - 1)}
      <button class="primary next-round-button" data-action="next-round">${copy.startNextRound(state.round + 1)}</button>
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
  const copy = text();
  const winner =
    state.totalScores[0] === state.totalScores[1]
      ? copy.draw
      : copy.winner(state.teams[state.totalScores[0] > state.totalScores[1] ? 0 : 1].name);

  app.innerHTML = `
    <section class="screen card-panel">
      <p class="eyebrow">${copy.gameOver}</p>
      <h2>${winner}</h2>
      <div class="score-board">
        ${Array.from({ length: MAX_ROUNDS }, (_, index) => `
          <div class="score-block">
            <h3>${copy.round} ${index + 1}</h3>
            ${roundPlacementRows(index)}
          </div>
        `).join("")}
        <div class="score-block total">
          <h3>${copy.total}</h3>
          ${totalPlacementRows()}
        </div>
      </div>
      <button class="primary" data-action="play-again">${copy.playAgain}</button>
    </section>
  `;

  on("play-again", () => {
    // Finished games are cleared so the next setup starts fresh.
    const language = currentLanguage();
    clearState();
    state = { screen: "setup", language };
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

function totalPlacementRows() {
  const scores = state.totalScores;

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

function currentTeam() {
  // Convenience helper so render functions do not repeat state.teams[state.currentTeam].
  return state.teams[state.currentTeam];
}

function otherTeam() {
  // Used by turn summaries to show who receives the phone next.
  return state.teams[state.currentTeam === 0 ? 1 : 0];
}

function getSecondsLeft(turn) {
  if (turn.paused) return turn.remainingSeconds;

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

function getCardLengthClass(name) {
  // Long Russian names need smaller type, while short cards should stay punchy.
  const length = [...String(name)].length;
  if (length > 28) return "long-card";
  if (length > 18) return "medium-card";
  return "";
}

function clamp(value, min, max) {
  // Keeps numeric setup fields inside safe bounds.
  return Math.min(Math.max(value, min), max);
}
