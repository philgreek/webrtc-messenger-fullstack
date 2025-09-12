const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-secure'; // In production, use environment variables

// --- In-Memory Database ---
const users = {}; // Store users by ID
let nextUserId = 0;

const createInitialUser = (name, password) => {
    const id = nextUserId++;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    users[id] = {
        id,
        name,
        password: hashedPassword,
        avatarUrl: `https://picsum.photos/seed/${name.toLowerCase()}/200`,
        status: 'OFFLINE',
        contacts: [],
        groups: []
    };
    return users[id];
};

// Create some default users to have someone to call
const alice = createInitialUser('Alice', 'password123');
const bob = createInitialUser('Bob', 'password123');
alice.contacts.push({ id: bob.id, name: bob.name, avatarUrl: bob.avatarUrl, status: 'OFFLINE' });
bob.contacts.push({ id: alice.id, name: alice.name, avatarUrl: alice.avatarUrl, status: 'OFFLINE' });


// In-memory store for user socket IDs
const userSockets = {}; // { userId: socketId }

// --- API Routes ---

// Register a new user
app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    if (!name || !password) {
        return res.status(400).json({ message: 'Name and password are required' });
    }
    if (Object.values(users).find(u => u.name === name)) {
        return res.status(400).json({ message: 'User already exists' });
    }
    createInitialUser(name, password);
    res.status(201).json({ message: 'User created successfully' });
});

// Login user
app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = Object.values(users).find(u => u.name === name);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
    
    // Deep copy user data to avoid circular references and send only necessary data
    const userProfile = { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
    const contacts = user.contacts.map(cId => {
        const contactUser = users[cId.id];
        return { id: contactUser.id, name: contactUser.name, avatarUrl: contactUser.avatarUrl, status: userSockets[contactUser.id] ? 'ONLINE' : 'OFFLINE' };
    });

    res.json({
        token,
        user: userProfile,
        contacts,
        groups: user.groups
    });
});

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Get data for an authenticated user
app.get('/api/data', authenticateToken, (req, res) => {
    const user = users[req.user.id];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userProfile = { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
    const contacts = user.contacts.map(c => {
       const contactUser = users[c.id];
       return { id: contactUser.id, name: contactUser.name, avatarUrl: contactUser.avatarUrl, status: userSockets[contactUser.id] ? 'ONLINE' : 'OFFLINE' };
    });
    
    res.json({
      user: userProfile,
      contacts: contacts,
      groups: user.groups
    });
});


// --- Socket.IO Signaling ---

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', (userId) => {
    // Add a defensive check here
    if (users[userId]) {
        userSockets[userId] = socket.id;
        socket.userId = userId;
        users[userId].status = 'ONLINE';
        // Notify contacts that this user is online
        users[userId].contacts.forEach(contact => {
            const contactSocketId = userSockets[contact.id];
            if (contactSocketId) {
                io.to(contactSocketId).emit('status-update', { userId: userId, status: 'ONLINE' });
            }
        });
        console.log(`User ${userId} (${users[userId].name}) registered with socket ID ${socket.id}`);
    } else {
        console.log(`Attempted to register non-existent user ID: ${userId}`);
    }
  });

  socket.on('outgoing-call', (data) => {
    const { from, to, offer, callType } = data;
    const toSocketId = userSockets[to.id];
    console.log(`Call attempt from ${from.name} (${from.id}) to ${to.name} (${to.id}) at socket ${toSocketId}`);
    if (toSocketId) {
      io.to(toSocketId).emit('incoming-call', { from, offer, callType });
    }
  });

  socket.on('call-accepted', (data) => {
    const { from, to, answer } = data;
    const toSocketId = userSockets[to.id];
     if (toSocketId) {
        console.log(`Call accepted by ${from.name}. Sending answer to ${to.name}`);
        io.to(toSocketId).emit('call-answered', { from, answer });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    const toSocketId = userSockets[to.id];
    if (toSocketId) {
      io.to(toSocketId).emit('ice-candidate', { candidate });
    }
  });

  socket.on('end-call', (data) => {
    const { to } = data;
    const toSocketId = userSockets[to.id];
    if (toSocketId) {
      io.to(toSocketId).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId !== undefined && users[socket.userId]) {
      users[socket.userId].status = 'OFFLINE';
      // Notify contacts that this user is offline
      users[socket.userId].contacts.forEach(contact => {
          const contactSocketId = userSockets[contact.id];
          if (contactSocketId) {
              io.to(contactSocketId).emit('status-update', { userId: socket.userId, status: 'OFFLINE' });
          }
      });
      delete userSockets[socket.userId];
      console.log(`User ${socket.userId} unregistered.`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});