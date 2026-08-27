# Elemental Arena

Front-end foundation for a browser-based multiplayer educational game, built
with React + Vite.

## Getting started

```
npm install
npm run dev
```

## Structure

- `src/pages/` — routed pages (Home, JoinGame, TeacherDashboard, Game1)
- `src/components/` — reusable UI components (AbilityButton, QuestionModal, HUD)
- `src/game/` — game data and logic (abilities, elements, question loader)
- `src/hooks/` — React hooks (game state, questions)
- `src/utils/` — pure helper functions (damage calculation, ability application)

This is a front-end-only prototype. No backend, no Socket.IO, no Phaser yet —
those come in later iterations.
