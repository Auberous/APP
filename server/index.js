import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import { createRoom, getRoom, joinRoom, removePlayer, removeRoomByTeacher, roomPlayerList } from './rooms.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

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
    io.to(code).emit('battle:started');
    callback?.({ ok: true });
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'teacher') {
      const room = removeRoomByTeacher(socket.id);
      if (room) io.to(room.code).emit('room:closed');
    } else if (socket.data.role === 'player') {
      const room = removePlayer(socket.id);
      if (room) io.to(room.code).emit('room:players-updated', { players: roomPlayerList(room) });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Elemental Arena server listening on :${PORT}`);
});
