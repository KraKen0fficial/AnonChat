const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
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

      broadcastToRoom(roomId, {
        type: 'system',
        text: `${username} присоединился(ась) к чату`,
        ts: Date.now(),
      }, userId);

      broadcastToRoom(roomId, {
        type: 'users',
        users: roomUserList(roomId),
      });

      return;
    }

    if (msg.type === 'chat' && currentRoom && currentUser) {
      const text = safeText(msg.text, 800);
      if (!text) return;

      broadcastToRoom(currentRoom, {
        type: 'chat',
        id: currentUser.id,
        username: currentUser.name,
        text,
        ts: Date.now(),
      });
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
