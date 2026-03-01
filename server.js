const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 100;
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const roomHistory = new Map();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '{}', 'utf8');
  }
}

function loadHistory() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([roomId, messages]) => {
      if (Array.isArray(messages)) {
        roomHistory.set(roomId, messages.slice(-HISTORY_LIMIT));
      }
    });
  } catch {
    roomHistory.clear();
  }
}

function saveHistory() {
  ensureDataFile();
  const payload = Object.fromEntries(roomHistory.entries());
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function getRoomHistory(roomId) {
  if (!roomHistory.has(roomId)) {
    roomHistory.set(roomId, []);
  }
  return roomHistory.get(roomId);
}

function appendHistory(roomId, message) {
  const history = getRoomHistory(roomId);
  history.push(message);
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT);
  }
  saveHistory();
}

function broadcastToRoom(roomId, payload, exceptClientId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [clientId, client] of room.entries()) {
    if (clientId === exceptClientId) continue;
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(payload));
    }
  }
}

function roomUserList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room.values()].map((u) => ({ id: u.id, name: u.name }));
}

function safeText(input, max = 500) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, max);
}

loadHistory();

wss.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const roomId = safeText(msg.roomId, 40).toLowerCase();
      const username = safeText(msg.username, 30);
      const userId = safeText(msg.userId, 60);

      if (!roomId || !username || !userId) return;

      currentRoom = roomId;
      currentUser = { id: userId, name: username, socket };

      const room = getRoom(roomId);
      room.set(userId, currentUser);

      socket.send(
        JSON.stringify({
          type: 'system',
          text: `Вы вошли в комнату #${roomId}`,
          ts: Date.now(),
        })
      );

      socket.send(
        JSON.stringify({
          type: 'history',
          messages: getRoomHistory(roomId),
        })
      );

      broadcastToRoom(
        roomId,
        {
          type: 'system',
          text: `${username} присоединился(ась) к чату`,
          ts: Date.now(),
        },
        userId
      );

      broadcastToRoom(roomId, {
        type: 'users',
        users: roomUserList(roomId),
      });

      return;
    }

    if (msg.type === 'chat' && currentRoom && currentUser) {
      const text = safeText(msg.text, 800);
      if (!text) return;

      const payload = {
        type: 'chat',
        id: currentUser.id,
        username: currentUser.name,
        text,
        ts: Date.now(),
      };

      appendHistory(currentRoom, payload);
      broadcastToRoom(currentRoom, payload);
      return;
    }
  });

  socket.on('close', () => {
    if (!currentRoom || !currentUser) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    room.delete(currentUser.id);

    broadcastToRoom(currentRoom, {
      type: 'system',
      text: `${currentUser.name} вышел(ла) из чата`,
      ts: Date.now(),
    });

    broadcastToRoom(currentRoom, {
      type: 'users',
      users: roomUserList(currentRoom),
    });

    if (room.size === 0) {
      rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`AnonChat is running on http://localhost:${PORT}`);
});
