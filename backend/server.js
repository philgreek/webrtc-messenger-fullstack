const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- CRITICAL FIX: CORS Configuration ---
// This explicitly allows requests from your Vercel frontend and localhost for development.
// This solves the "Failed to fetch" error.
const allowedOrigins = [
    'https://connectsphere-messenger.vercel.app', 
    'http://localhost:5173', // Add your local dev port if it's different
    'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' })); // Increase limit for base64 avatars

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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
    
    const userProfile = { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
    const contacts = user.contacts.map(c => {
        const contactUser = users[c.id];
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
       if (!contactUser) return null;
       return { id: contactUser.id, name: contactUser.name, avatarUrl: contactUser.avatarUrl, status: userSockets[contactUser.id] ? 'ONLINE' : 'OFFLINE' };
    }).filter(Boolean); // Filter out nulls if a contact was deleted but still in list
    
    res.json({
      user: userProfile,
      contacts: contacts,
      groups: user.groups
    });
});

// Update user profile
app.post('/api/profile/update', authenticateToken, (req, res) => {
    const { name, avatarUrl } = req.body;
    const user = users[req.user.id];
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    if (name) user.name = name;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    res.json({ message: 'Profile updated successfully', user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl } });
});

// Add a new contact by name
app.post('/api/contacts/add', authenticateToken, (req, res) => {
    const { name } = req.body;
    const currentUser = users[req.user.id];
    if (!name) {
        return res.status(400).json({ message: "Contact name is required" });
    }

    const contactToAdd = Object.values(users).find(u => u.name.toLowerCase() === name.toLowerCase());

    if (!contactToAdd) {
        return res.status(404).json({ message: `User "${name}" not found` });
    }
    if (contactToAdd.id === currentUser.id) {
        return res.status(400).json({ message: "You cannot add yourself as a contact" });
    }
    if (currentUser.contacts.some(c => c.id === contactToAdd.id)) {
        return res.status(400).json({ message: "This user is already in your contacts" });
    }

    const newContactForCurrentUser = { id: contactToAdd.id, name: contactToAdd.name, avatarUrl: contactToAdd.avatarUrl, status: userSockets[contactToAdd.id] ? 'ONLINE' : 'OFFLINE' };
    currentUser.contacts.push(newContactForCurrentUser);

    const newContactForOtherUser = { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl, status: 'ONLINE' }; // Current user is online
    contactToAdd.contacts.push(newContactForOtherUser);

    res.status(201).json(newContactForCurrentUser);
});


// --- Socket.IO Signaling ---

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', (userId) => {
    if (users[userId] !== undefined) {
        userSockets[userId] = socket.id;
        socket.userId = userId;
        users[userId].status = 'ONLINE';
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
    const { fromId, toId, offer, callType } = data;
    const toSocketId = userSockets[toId];
    const fromUser = users[fromId];

    console.log(`Call attempt from ${fromUser?.name} (ID: ${fromId}) to user ID ${toId} at socket ${toSocketId}`);

    if (toSocketId && fromUser) {
      const fromUserProfile = { id: fromUser.id, name: fromUser.name, avatarUrl: fromUser.avatarUrl, status: 'ONLINE' };
      io.to(toSocketId).emit('incoming-call', { from: fromUserProfile, offer, callType });
    } else {
      console.log(`Call failed: Could not find user or socket. toSocketId: ${toSocketId}, fromUser: ${!!fromUser}`);
    }
  });

  socket.on('call-accepted', (data) => {
    const { fromId, toId, answer } = data;
    const toSocketId = userSockets[toId]; // This is the original caller
     if (toSocketId) {
        const fromUser = users[fromId];
        console.log(`Call accepted by ${fromUser?.name}. Sending answer to original caller (ID: ${toId})`);
        io.to(toSocketId).emit('call-answered', { answer });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data; // 'to' is now an ID
    const toSocketId = userSockets[to];
    if (toSocketId) {
      // Send candidate to the other peer, but identify who it's from.
      // The client doesn't need to know who it's from, it just adds it.
      io.to(toSocketId).emit('ice-candidate', { candidate });
    }
  });

  socket.on('end-call', (data) => {
    const { to } = data; // 'to' is an ID
    const toSocketId = userSockets[to];
    if (toSocketId) {
      io.to(toSocketId).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId !== undefined && users[socket.userId]) {
      users[socket.userId].status = 'OFFLINE';
      users[socket.userId].contacts.forEach(contact => {
          const contactSocketId = userSockets[contact.id];
          if (contactSocketId) {
              io.to(contactSocketId).emit('status-update', { userId: socket.userId, status: 'OFFLINE' });
          }
      });
      delete userSockets[socket.userId];
      console.log(`User ${socket.userId} (${users[socket.userId].name}) unregistered.`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});