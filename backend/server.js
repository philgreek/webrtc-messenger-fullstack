const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // In production, you'd lock this down to your Vercel URL
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- Mock Data ---
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

// In-memory store for user socket IDs
const userSockets = {};

app.get('/api/initial-data', (req, res) => {
  res.json({
    contacts: MOCK_CONTACTS,
    groups: MOCK_GROUPS,
  });
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Register user with their ID
  socket.on('register', (userId) => {
    userSockets[userId] = socket.id;
    socket.userId = userId; // Associate userId with the socket
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });

  // Handle outgoing call
  socket.on('outgoing-call', (data) => {
    const { from, to, offer, callType } = data;
    const toSocketId = userSockets[to.id];
    
    console.log(`Call attempt from ${from.name} (${from.id}) to ${to.name} (${to.id}) at socket ${toSocketId}`);

    if (toSocketId) {
      io.to(toSocketId).emit('incoming-call', { from, offer, callType });
    } else {
      // Handle user not found/offline
      console.log(`User ${to.id} is not connected.`);
      socket.emit('call-error', { message: `User ${to.name} is offline.` });
    }
  });

  // Handle call accepted
  socket.on('call-accepted', (data) => {
    const { from, to, answer } = data;
    const toSocketId = userSockets[to.id];
     if (toSocketId) {
        console.log(`Call accepted by ${from.name}. Sending answer to ${to.name}`);
        io.to(toSocketId).emit('call-answered', { from, answer });
    }
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    const toSocketId = userSockets[to.id];
    if (toSocketId) {
      io.to(toSocketId).emit('ice-candidate', { candidate });
    }
  });

  // Handle end call
  socket.on('end-call', (data) => {
    const { to } = data;
    const toSocketId = userSockets[to.id];
    if (toSocketId) {
      io.to(toSocketId).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      delete userSockets[socket.userId];
      console.log(`User ${socket.userId} unregistered.`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
