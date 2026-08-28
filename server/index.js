import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  removeRoomByTeacher,
  roomPlayerList,
  getAllRooms,
} from './rooms.js';
import { Match } from './game/match.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const TICK_MS = 50; // 20Hz

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on('connection', (socket) => {
  socket.on('teacher:create-room', (_payload, callback) => {
    const room = createRoom(socket.id);
    socket.join(room.code);
    socket.data.role = 'teacher';
    socket.data.roomCode = room.code;
    callback?.({ ok: true, code: room.code });
  });

  socket.on('player:join-room', ({ code, name } = {}, callback) => {
    const trimmedName = (name || '').trim().slice(0, 24);
    if (!trimmedName) {
      callback?.({ ok: false, error: 'Enter a name.' });
      return;
    }

    const result = joinRoom(code, socket.id, trimmedName);
    if (!result.ok) {
      callback?.({ ok: false, error: result.error });
      return;
    }

    socket.join(result.room.code);
    socket.data.role = 'player';
    socket.data.roomCode = result.room.code;
    socket.data.name = trimmedName;

    const players = roomPlayerList(result.room);
    callback?.({ ok: true, code: result.room.code, players });
    io.to(result.room.code).emit('room:players-updated', { players });
  });

  socket.on('teacher:start-battle', (_payload, callback) => {
    const code = socket.data.roomCode;
    const room = code ? getRoom(code) : null;
    if (!room || room.teacherId !== socket.id) {
      callback?.({ ok: false, error: 'Not your room.' });
      return;
    }
    room.match?.startBattleNow();
    io.to(code).emit('battle:started');
    callback?.({ ok: true });
  });

  // --- arena (in-match) events --------------------------------------

  socket.on('arena:enter', (_payload, callback) => {
    if (socket.data.role !== 'player') {
      callback?.({ ok: false, error: 'Only players can enter the arena.' });
      return;
    }
    const room = getRoom(socket.data.roomCode);
    if (!room) {
      callback?.({ ok: false, error: 'Room no longer exists.' });
      return;
    }
    if (!room.match) room.match = new Match();
    room.match.addPlayer(socket.id, socket.data.name);
    callback?.({ ok: true, youId: socket.id, snapshot: room.match.snapshot() });
  });

  socket.on('arena:input', (input = {}) => {
    const room = getRoom(socket.data.roomCode);
    room?.match?.setInput(socket.id, input);
  });

  socket.on('arena:cast-ability', ({ abilityName } = {}, callback) => {
    const room = getRoom(socket.data.roomCode);
    if (!room?.match) {
      callback?.({ ok: false, error: 'No active match.' });
      return;
    }
    const result = room.match.castAbility(socket.id, abilityName);
    callback?.(result);
    if (result.ok && result.effect) {
      io.to(room.code).emit('arena:effect', { effect: result.effect });
    }
  });

  socket.on('arena:shop-buy', ({ abilityName } = {}, callback) => {
    const room = getRoom(socket.data.roomCode);
    if (!room?.match) {
      callback?.({ ok: false, error: 'No active match.' });
      return;
    }
    callback?.(room.match.startShopPurchase(socket.id, abilityName));
  });

  socket.on('arena:answer', ({ answerIndex } = {}, callback) => {
    const room = getRoom(socket.data.roomCode);
    if (!room?.match) {
      callback?.({ ok: false, error: 'No active match.' });
      return;
    }
    callback?.(room.match.answerQuestion(socket.id, answerIndex));
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'teacher') {
      const room = removeRoomByTeacher(socket.id);
      if (room) io.to(room.code).emit('room:closed');
    } else if (socket.data.role === 'player') {
      const room = removePlayer(socket.id);
      room?.match?.removePlayer(socket.id);
      if (room) io.to(room.code).emit('room:players-updated', { players: roomPlayerList(room) });
    }
  });
});

// Single global tick loop drives every room's match. Fine at this scale;
// if this ever needs to shard across processes, each shard just needs to
// own a disjoint set of rooms.
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  for (const room of getAllRooms()) {
    if (!room.match || room.match.phase === 'over') continue;
    room.match.tick(dt);
    io.to(room.code).emit('arena:state', room.match.snapshot());
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Elemental Arena server listening on :${PORT}`);
});
