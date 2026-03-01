const loginCard = document.getElementById('loginCard');
const chatCard = document.getElementById('chatCard');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const randomRoomBtn = document.getElementById('randomRoomBtn');
const roomTitle = document.getElementById('roomTitle');
const statusLine = document.getElementById('statusLine');
const usersList = document.getElementById('usersList');
const messages = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const emojiBar = document.getElementById('emojiBar');

const randomAnimal = ['Fox', 'Wolf', 'Cat', 'Panda', 'Raven', 'Koala', 'Otter'];
const randomAdj = ['Silent', 'Neon', 'Night', 'Pixel', 'Ghost', 'Crystal', 'Shadow'];
const userEmojis = ['🦊', '🐺', '🐱', '🐼', '🐦', '🐨', '🦦', '🐯', '🦄'];

let socket;
let currentRoom = '';
let username = '';
let reconnectTimer = null;
let shouldReconnect = true;
const userId = crypto.randomUUID();

function randomName() {
  return `${randomAdj[Math.floor(Math.random() * randomAdj.length)]}${randomAnimal[Math.floor(Math.random() * randomAnimal.length)]}`;
}

function randomRoomCode() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function setStatus(text) {
  statusLine.textContent = text;
}

function safeText(value) {
  return String(value ?? '');
}

function getUserEmoji(seed) {
  const idx = [...safeText(seed)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % userEmojis.length;
  return userEmojis[idx];
}

function addMessage({ type, username: sender, text, ts, id }) {
  const el = document.createElement('div');
  el.className = 'msg';

  if (type === 'system') {
    el.classList.add('system');
    el.textContent = safeText(text);
  } else {
    if (id === userId) el.classList.add('self');

    const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${getUserEmoji(id)} ${safeText(sender)} • ${time}`;

    const body = document.createElement('div');
    body.textContent = safeText(text);

    el.appendChild(meta);
    el.appendChild(body);
  }

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderUsers(users) {
  usersList.innerHTML = '';
  users.forEach((u) => {
    const li = document.createElement('li');
    const suffix = u.id === userId ? ' (вы)' : '';
    li.textContent = `${getUserEmoji(u.id)} ${u.name}${suffix}`;
    usersList.appendChild(li);
  });
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener('open', () => {
    setStatus('🟢 Онлайн');
    joinBtn.disabled = false;
    socket.send(
      JSON.stringify({
        type: 'join',
        roomId: currentRoom,
        username,
        userId,
      })
    );
  });

  socket.addEventListener('close', () => {
    if (!shouldReconnect) return;
    setStatus('🟠 Оффлайн, переподключение...');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'chat' || msg.type === 'system') {
      addMessage(msg);
    }

    if (msg.type === 'history') {
      messages.innerHTML = '';
      msg.messages.forEach(addMessage);
    }

    if (msg.type === 'users') {
      renderUsers(msg.users);
    }
  });
}

joinBtn.addEventListener('click', () => {
  username = nameInput.value.trim() || randomName();
  currentRoom = roomInput.value.trim().toLowerCase() || randomRoomCode();
  joinBtn.disabled = true;

  roomTitle.textContent = `Комната #${currentRoom}`;

  const url = new URL(location.href);
  url.searchParams.set('room', currentRoom);
  history.replaceState(null, '', url.toString());

  loginCard.classList.add('hidden');
  chatCard.classList.remove('hidden');

  connect();
});

randomRoomBtn.addEventListener('click', () => {
  roomInput.value = randomRoomCode();
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({ type: 'chat', text }));
  messageInput.value = '';
});

emojiBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.emoji-btn');
  if (!btn) return;
  const emoji = btn.dataset.emoji || '';
  messageInput.value = `${messageInput.value}${emoji}`;
  messageInput.focus();
});

copyLinkBtn.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', currentRoom);

  try {
    await navigator.clipboard.writeText(url.toString());
    copyLinkBtn.textContent = '✅ Скопировано!';
    setTimeout(() => (copyLinkBtn.textContent = '🔗 Копировать ссылку'), 1200);
  } catch {
    copyLinkBtn.textContent = '❌ Ошибка';
  }
});

window.addEventListener('beforeunload', () => {
  shouldReconnect = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
});

(function bootstrap() {
  nameInput.value = randomName();
  const roomFromQuery = new URL(location.href).searchParams.get('room');
  if (roomFromQuery) {
    roomInput.value = roomFromQuery;
  }
})();
