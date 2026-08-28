import { io } from 'socket.io-client';

// Points at the lobby/game server (see /server at the repo root). Override
// with VITE_SERVER_URL for anything other than local dev (e.g. once the
// server is deployed to Railway/Fly.io for real classroom use).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket = null;

// Connects lazily — pages that never touch multiplayer (Home, Game1's
// solo/local mode) never open a socket.
export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: true });
  }
  return socket;
}

export default getSocket;
