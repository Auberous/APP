// In-memory room store. Fine for a single dev/staging server process;
// once this needs to survive restarts or run across multiple server
// instances (for real classroom-scale load), swap this for Redis or a
// small DB — the interface below is deliberately kept narrow so that
// swap doesn't ripple through index.js.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — easy to misread
const CODE_LENGTH = 5;

const rooms = new Map(); // code -> { code, teacherId, players: Map<socketId, {id, name}> }

function generateCode() {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(teacherId) {
  const code = generateCode();
  const room = { code, teacherId, players: new Map(), match: null };
  rooms.set(code, room);
  return room;
}

export function getAllRooms() {
  return rooms.values();
}

export function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

export function joinRoom(code, socketId, name) {
  const room = getRoom(code);
  if (!room) return { ok: false, error: 'Room not found' };
  room.players.set(socketId, { id: socketId, name });
  return { ok: true, room };
}

export function removePlayer(socketId) {
  for (const room of rooms.values()) {
    if (room.players.delete(socketId)) return room;
  }
  return null;
}

export function removeRoomByTeacher(teacherId) {
  for (const [code, room] of rooms.entries()) {
    if (room.teacherId === teacherId) {
      rooms.delete(code);
      return room;
    }
  }
  return null;
}

export function roomPlayerList(room) {
  return Array.from(room.players.values());
}
