# Monikers Web App

A mobile-friendly pass-and-play Monikers app for one shared phone. The app is a static single page application, so it can run on GitHub Pages without a backend, build server, user accounts, or API.

## Features

- New game setup for two teams, player counts, and deck size.
- Built-in card database loaded from `public/cards.json`.
- Three-round Monikers flow with alternating team turns.
- 60-second turns with Correct and Skip actions.
- Skipped cards return to the remaining deck at the end of each turn.
- Scores are tracked per round and in total.
- Browser `localStorage` saves the full game state after every action.
- Refreshing or reopening restores the current game.

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
