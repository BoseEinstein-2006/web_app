# Web App

A mobile-friendly pass-and-play party card app for one shared phone. The app is a static single page application, so it can run on GitHub Pages without a backend, build server, user accounts, or API.

Click on the link to play:
https://boseeinstein-2006.github.io/web_app/

## General Overview

The app is intentionally simple: `index.html` contains one empty `<main id="app">`, and `src/app.js` fills that element with the current screen. There is no router library. Instead, the app stores the current screen name in `state.screen`, then the central `render()` function calls the matching screen renderer.

The complete game is stored in one serializable `state` object. That state includes the current round, team names, current team, remaining deck, guessed pile, skipped pile, round scores, total scores, current turn information, and last turn summary. After every meaningful action, `saveState()` writes this object to browser `localStorage`, which is why refreshing or closing the browser can restore the game.

The card database lives in `public/cards_ru_categories.json`. Each card has a name and category. When a new game starts, `loadCards()` loads the JSON file, the setup form chooses a random subset of cards, and the app stores the selected card ids in `originalDeck`. The `originalDeck` is never modified, so rounds 2 and 3 can reuse the exact same cards with a fresh shuffle.

## Features

- New game setup for two team names and deck size.
- Built-in Russian card database loaded from `public/cards_ru_categories.json`.
- Three-round party-card flow with alternating team turns.
- 60-second turns with Correct and Skip actions.
- Skipped cards return to the remaining deck at the end of each turn.
- Scores are tracked per round and in total.
- Browser `localStorage` saves the full game state after every action.
- Refreshing or reopening restores the current game.

## File Map

- `index.html` is the static GitHub Pages entry point and loads the CSS and JavaScript.
- `src/app.js` contains the full game state, screen rendering, timer logic, deck movement, scoring, and localStorage persistence.
- `src/styles.css` contains the mobile-first layout and visual design.
- `public/cards_ru_categories.json` contains the built-in Russian party-card database with categories.
- `package.json` only provides project metadata and a simple local preview command.

## Screen And Function Flow

### 1. App Startup

When the page loads, the browser runs `src/app.js`.

The first function called is `init()`. It calls `loadCards()` to fetch `public/cards_ru_categories.json`, then calls `render()`.

Before `init()` runs, the app also calls `loadState()`. If there is a saved localStorage game, `state` starts with that saved game. If there is no saved game, `state` is `null`.

### 2. Home Screen

If `state` is `null`, `render()` calls `renderHome()`.

`renderHome()` displays the title `PARTY CARDS`, the `New Game` button, and, if localStorage contains a saved game, the `Resume Game` button.

If the user clicks `New Game`, the click handler sets:

```js
state = { screen: "setup" };
```

Then it calls `render()`, which sends the user to the setup screen.

If the user clicks `Resume Game`, the click handler calls `loadState()`, puts the saved game back into `state`, then calls `render()`. Because `state.screen` was saved too, the app returns to the exact previous screen.

### 3. New Game Setup Screen

When `state.screen` is `"setup"`, `render()` calls `renderSetup()`.

`renderSetup()` displays these fields:

- `Team 1 Name`, default `Писи`.
- `Team 2 Name`, default `Сиси`.
- `Cards In Deck`, default `40`.

When the setup form is submitted, the submit handler reads the form with `FormData`, clamps the deck size to a valid number, shuffles all cards, and selects the requested number of cards.

Then it creates the full initial game state. Important fields include:

- `screen: "turn-start"` so the next render opens the turn handoff screen.
- `round: 1` because every game starts at round 1.
- `currentTeam: 0` because the first team starts.
- `originalDeck` containing the selected card ids for all three rounds.
- `remainingDeck` containing a shuffled copy of the selected cards for the current round.
- `guessedPile` and `skippedPile`, both starting empty.
- `roundScores` and `totalScores`, both starting at zero.

After creating that state, the handler calls `saveState()` and `render()`.

### 4. Turn Start Screen

When `state.screen` is `"turn-start"`, `render()` calls `renderTurnStart()`.

This screen shows the current round, the active team, the number of cards remaining, and the `Start Turn` button. It is meant to be the safe pass-the-phone screen before the timer starts.

If the user clicks `Start Turn`, the click handler calls `startTurn()`.

`startTurn()` clears the skipped pile for the new turn, creates `state.activeTurn`, stores the current time in `startedAt`, sets `duration` to 60 seconds, chooses the first card in `remainingDeck`, changes `state.screen` to `"active-turn"`, saves, then renders.

### 5. Active Turn Screen

When `state.screen` is `"active-turn"`, `render()` calls `renderActiveTurn()`.

`renderActiveTurn()` calculates the remaining time with `getSecondsLeft()`, shows the current round, active team, timer, current card, and the `Correct` and `Skip` buttons.

It also starts a `setInterval()` timer. Every 250 milliseconds, the interval recalculates the seconds left and updates the visible timer. If time reaches zero, it calls `endTurn()`.

If the user clicks `Correct`, the click handler calls `markCorrect()`.

`markCorrect()` removes the current card from `remainingDeck`, adds it to `guessedPile`, increments the current turn score, increments the current team's round score, and increments the current team's total score. If the deck is now empty, it calls `completeRound()`. Otherwise, it sets the next card and rerenders.

If the user clicks `Skip`, the click handler calls `markSkipped()`.

`markSkipped()` removes the current card from `remainingDeck` and adds it to `skippedPile`. Skipped cards do not score points. If no cards remain after skipping, it calls `endTurn()`. Otherwise, it sets the next card and rerenders.

### 6. Turn End And Turn Summary

`endTurn()` runs when the timer reaches zero or when all currently available cards were skipped.

First, it stops the timer interval. Then it returns all skipped cards to `remainingDeck` and shuffles the deck. This is the rule that guarantees skipped cards appear again later.

Then it creates `state.lastTurn`, which stores the team that just played, how many cards they scored, who plays next, and how many cards remain.

After that, it clears `activeTurn`, switches `currentTeam` to the other team, sets `state.screen` to `"turn-summary"`, saves, and renders.

When `state.screen` is `"turn-summary"`, `render()` calls `renderTurnSummary()`.

This screen shows `Time's Up`, the score for the previous turn, cards remaining, the next team, and a button to start the next team's turn. Clicking that button sets `state.screen` back to `"turn-start"`, saves, and renders.

### 7. Round Complete Screen

A round ends when `remainingDeck` becomes empty because all cards were guessed correctly.

When that happens, `markCorrect()` calls `completeRound()`.

`completeRound()` stops the timer, clears turn-specific data, switches the next starting team, and decides whether to show round results or final results. If the current round is less than 3, it sets `state.screen` to `"round-complete"`. If round 3 has ended, it sets `state.screen` to `"game-over"`.

When `state.screen` is `"round-complete"`, `render()` calls `renderRoundComplete()`.

This screen displays the round that just ended and both team scores for that round. If the user clicks `Start Round 2` or `Start Round 3`, the click handler increments `state.round`, rebuilds `remainingDeck` from `originalDeck`, shuffles it, clears the round piles, sets `state.screen` to `"turn-start"`, saves, and renders.

### 8. Game Over Screen

After round 3 completes, `completeRound()` sets `state.screen` to `"game-over"`.

When `state.screen` is `"game-over"`, `render()` calls `renderGameOver()`.

`renderGameOver()` compares `totalScores`, calculates the winner or a tie, displays each round score, displays total scores, and shows the `Play Again` button.

If the user clicks `Play Again`, the click handler calls `clearState()` to remove the saved game from localStorage, sets `state` to `{ screen: "setup" }`, and renders a fresh setup screen.

## Deck Logic

At the start of a game:

- `originalDeck` stores the selected card ids and never changes.
- `remainingDeck` starts as a shuffled copy of the selected cards.
- `guessedPile` starts empty.
- `skippedPile` starts empty.

During a turn:

- Correct cards move from `remainingDeck` to `guessedPile`.
- Skipped cards move from `remainingDeck` to `skippedPile`.

At the end of a turn:

- `skippedPile` is merged back into `remainingDeck`.
- `remainingDeck` is shuffled.
- `skippedPile` is cleared.

At the start of rounds 2 and 3:

- `remainingDeck` is rebuilt from `originalDeck`.
- The rebuilt deck is shuffled.
- Scores continue accumulating instead of resetting.

## Persistence Logic

The app calls `saveState()` after every action that changes the game. This writes the whole `state` object to localStorage using the key `party-card-game-state-v1`.

Important saved fields include:

- Current screen.
- Current round.
- Team names.
- Current team.
- Remaining deck.
- Guessed pile.
- Skipped pile.
- Current turn data.
- Last turn summary.
- Round scores.
- Total scores.

When the app starts, `loadState()` checks localStorage. If a saved game exists, the app resumes from the saved state. If there is no saved game, the app shows the home screen.

## Cache Busting And Updates

Browsers sometimes cache static GitHub Pages files aggressively. To make updates easier to see, `index.html` defines:

```js
window.APP_VERSION = "2026-06-06-16";
```

The same version is added to the CSS and JavaScript URLs:

```html
./src/styles.css?v=2026-06-06-16
./src/app.js?v=2026-06-06-16
```

When this version changes, the browser treats the files as new URLs and requests fresh copies from GitHub Pages.

The JavaScript also stores the current version in localStorage under `party-card-app-version`. If the saved version does not match the deployed version, `loadState()` clears the old saved game and starts from the home screen. This prevents an old saved screen from hiding a newly changed home screen.

When you make a visible change and want everyone to get it, update the version string in `index.html`.

## Local Preview

Use any static file server from this folder. For example:

```powershell
python -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## GitHub Pages

This project is designed to deploy from the repository root:

1. Push the repository to GitHub.
2. Open repository settings.
3. Go to Pages.
4. Set Source to `Deploy from a branch`.
5. Choose branch `main` and folder `/ (root)`.
6. Save.
