const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors()); // Allow requests from our frontend

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // For development, allow all. In production, change to your Vercel URL.
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- Mock Data for now, will be replaced by a database ---
const MOCK_CONTACTS = [
  { id: 1, name: 'Alice', avatarUrl: 'https://picsum.photos/seed/alice/200', status: 'ONLINE' },
  { id: 2, name: 'Bob', avatarUrl: 'https://picsum.photos/seed/bob/200', status: 'AWAY' },
  { id: 3, name: 'Charlie', avatarUrl: 'https://picsum.photos/seed/charlie/200', status: 'OFFLINE' },
  { id: 4, name: 'Diana', avatarUrl: 'https://picsum.photos/seed/diana/200', status: 'ONLINE' },
  { id: 5, name: 'Eve', avatarUrl: 'https://picsum.photos/seed/eve/200', status: 'OFFLINE' },
];

const MOCK_GROUPS = [
  { id: 101, name: 'Family', avatarUrl: 'https://picsum.photos/seed/family/200', members: [1, 3] },
  { id: 102, name: 'Work Team', avatarUrl: 'https://picsum.photos/seed/work/200', members: [2, 4, 5] },
];
// ---------------------------------------------------------

app.get('/api/initial-data', (req, res) => {
  res.json({
    contacts: MOCK_CONTACTS,
    groups: MOCK_GROUPS,
  });
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
