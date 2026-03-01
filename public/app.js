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

const randomAnimal = ['Fox', 'Wolf', 'Cat', 'Panda', 'Raven', 'Koala', 'Otter'];
const randomAdj = ['Silent', 'Neon', 'Night', 'Pixel', 'Ghost', 'Crystal', 'Shadow'];

let socket;
let currentRoom = '';
let username = '';
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

function addMessage({ type, username: sender, text, ts, id }) {
  const el = document.createElement('div');
  el.className = 'msg';

  if (type === 'system') {
    el.classList.add('system');
    el.textContent = text;
  } else {
    if (id === userId) el.classList.add('self');

    const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<div class="meta">${sender} • ${time}</div><div>${text}</div>`;
  }

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderUsers(users) {
  usersList.innerHTML = '';
  users.forEach((u) => {
    const li = document.createElement('li');
    li.textContent = u.id === userId ? `${u.name} (вы)` : u.name;
    usersList.appendChild(li);
  });
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener('open', () => {
    setStatus('Онлайн');
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
    setStatus('Оффлайн, переподключение...');
    setTimeout(connect, 1500);
  });

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'chat' || msg.type === 'system') {
      addMessage(msg);
    }

    if (msg.type === 'users') {
      renderUsers(msg.users);
    }
  });
}

joinBtn.addEventListener('click', () => {
  username = nameInput.value.trim() || randomName();
  currentRoom = roomInput.value.trim().toLowerCase() || randomRoomCode();

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

copyLinkBtn.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', currentRoom);

  try {
    await navigator.clipboard.writeText(url.toString());
    copyLinkBtn.textContent = 'Скопировано!';
    setTimeout(() => (copyLinkBtn.textContent = 'Копировать ссылку'), 1200);
  } catch {
    copyLinkBtn.textContent = 'Ошибка';
  }
});

(function bootstrap() {
  nameInput.value = randomName();
  const roomFromQuery = new URL(location.href).searchParams.get('room');
  if (roomFromQuery) {
    roomInput.value = roomFromQuery;
  }
})();
