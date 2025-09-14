const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

const allowedOrigins = [
    'https://connectsphere-messenger.vercel.app', 
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-secure';

// --- In-Memory Database ---
const users = {};
let nextUserId = 0;

const createInitialUser = (name, password) => {
    const id = nextUserId++;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    users[id] = {
        id, name, password: hashedPassword,
        avatarUrl: `https://picsum.photos/seed/${name.toLowerCase()}/200`,
        status: 'OFFLINE', contacts: [], groups: []
    };
    return users[id];
};

const alice = createInitialUser('Alice', 'password123');
const bob = createInitialUser('Bob', 'password123');
const you = createInitialUser('You', 'password123'); // For initial testing
alice.contacts.push({ id: bob.id });
bob.contacts.push({ id: alice.id });
you.contacts.push({ id: alice.id }, {id: bob.id});
alice.contacts.push({id: you.id});
bob.contacts.push({id: you.id});


const userSockets = new Map(); // { userId => Set(socketId1, socketId2, ...) }
const activeCalls = new Map(); // { socketId1 => socketId2, socketId2 => socketId1 }


// --- API Routes ---

app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ message: 'Name and password are required' });
    if (Object.values(users).find(u => u.name === name)) return res.status(400).json({ message: 'User already exists' });
    createInitialUser(name, password);
    res.status(201).json({ message: 'User created successfully' });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = Object.values(users).find(u => u.name === name);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
    
    const userProfile = { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
    const contacts = user.contacts.map(c => {
        const contactUser = users[c.id];
        const isOnline = userSockets.has(contactUser.id) && userSockets.get(contactUser.id).size > 0;
        return { id: contactUser.id, name: contactUser.name, avatarUrl: contactUser.avatarUrl, status: isOnline ? 'ONLINE' : 'OFFLINE' };
    });

    res.json({ token, user: userProfile, contacts, groups: user.groups });
});

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

app.get('/api/data', authenticateToken, (req, res) => {
    const user = users[req.user.id];
    if (!user) return res.status(404).json({ message: "User not found" });

    const userProfile = { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
    const contacts = user.contacts.map(c => {
       const contactUser = users[c.id];
       if (!contactUser) return null;
       const isOnline = userSockets.has(contactUser.id) && userSockets.get(contactUser.id).size > 0;
       return { id: contactUser.id, name: contactUser.name, avatarUrl: contactUser.avatarUrl, status: isOnline ? 'ONLINE' : 'OFFLINE' };
    }).filter(Boolean);
    
    res.json({ user: userProfile, contacts, groups: user.groups });
});

app.post('/api/profile/update', authenticateToken, (req, res) => {
    const { name, avatarUrl } = req.body;
    const user = users[req.user.id];
    if (!user) return res.status(404).json({ message: "User not found" });
    if (name) user.name = name;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    res.json({ message: 'Profile updated successfully', user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl } });
});

app.post('/api/contacts/add', authenticateToken, (req, res) => {
    const { name } = req.body;
    const currentUser = users[req.user.id];
    if (!name) return res.status(400).json({ message: "Contact name is required" });

    const contactToAdd = Object.values(users).find(u => u.name.toLowerCase() === name.toLowerCase());

    if (!contactToAdd) return res.status(404).json({ message: `User "${name}" not found` });
    if (contactToAdd.id === currentUser.id) return res.status(400).json({ message: "You cannot add yourself as a contact" });
    if (currentUser.contacts.some(c => c.id === contactToAdd.id)) return res.status(400).json({ message: "This user is already in your contacts" });

    currentUser.contacts.push({ id: contactToAdd.id });
    contactToAdd.contacts.push({ id: currentUser.id });
    
    const isOnline = userSockets.has(contactToAdd.id) && userSockets.get(contactToAdd.id).size > 0;
    const newContactForCurrentUser = { id: contactToAdd.id, name: contactToAdd.name, avatarUrl: contactToAdd.avatarUrl, status: isOnline ? 'ONLINE' : 'OFFLINE' };
    res.status(201).json(newContactForCurrentUser);
});

// --- Socket.IO Signaling with Multi-Device Support & Active Call Tracking ---

const cleanupCallState = (socketId) => {
    const peerSocketId = activeCalls.get(socketId);
    if (peerSocketId) {
        io.to(peerSocketId).emit('call-ended');
        activeCalls.delete(peerSocketId);
    }
    activeCalls.delete(socketId);
    console.log(`Cleaned up call state for socket ${socketId}`);
};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', (userId) => {
    if (users[userId] === undefined) {
      console.log(`Attempted to register non-existent user ID: ${userId}`);
      return;
    }
    
    socket.userId = userId;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    
    users[userId].contacts.forEach(contact => {
        const contactSocketIds = userSockets.get(contact.id);
        if (contactSocketIds) {
            contactSocketIds.forEach(contactSocketId => {
                io.to(contactSocketId).emit('status-update', { userId: userId, status: 'ONLINE' });
            });
        }
    });

    // CRITICAL FIX: Send the current statuses of all contacts to the newly connected user
    const initialStatuses = users[userId].contacts.map(contact => {
        const isOnline = userSockets.has(contact.id) && userSockets.get(contact.id).size > 0;
        return { userId: contact.id, status: isOnline ? 'ONLINE' : 'OFFLINE' };
    });
    socket.emit('initial-statuses', initialStatuses);

    console.log(`User ${userId} (${users[userId].name}) registered. Sockets: ${[...userSockets.get(userId)]}`);
  });

  socket.on('outgoing-call', (data) => {
    const { fromId, toId, offer, callType } = data;
    const toSocketIds = userSockets.get(toId);
    const fromUser = users[fromId];

    if (toSocketIds && fromUser) {
      console.log(`Call attempt from ${fromUser.name} to ${users[toId].name}. Sending to sockets: ${[...toSocketIds]}`);
      const fromUserProfile = { id: fromUser.id, name: fromUser.name, avatarUrl: fromUser.avatarUrl, status: 'ONLINE' };
      toSocketIds.forEach(socketId => {
        io.to(socketId).emit('incoming-call', { 
            from: fromUserProfile, 
            offer, 
            callType,
            fromSocketId: socket.id
        });
      });
    } else {
      console.log(`Call failed: Could not find user or sockets. toId: ${toId}, fromId: ${fromId}`);
    }
  });

  socket.on('call-accepted', (data) => {
    const { fromId, toSocketId, answer } = data;
     if (toSocketId) {
        const fromUser = users[fromId];
        console.log(`Call accepted by ${fromUser?.name}. Sending answer to original caller at socket ${toSocketId}`);
        
        activeCalls.set(socket.id, toSocketId);
        activeCalls.set(toSocketId, socket.id);

        io.to(toSocketId).emit('call-answered', { 
            answer, 
            fromSocketId: socket.id
        });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { toSocketId, candidate } = data;
    if (toSocketId) {
      io.to(toSocketId).emit('ice-candidate', { candidate, fromSocketId: socket.id });
    }
  });

  socket.on('end-call', (data) => {
    const { toSocketId } = data;
    cleanupCallState(toSocketId);
    cleanupCallState(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    cleanupCallState(socket.id); // GUARANTEED CALL ENDING

    const userId = socket.userId;
    if (userId !== undefined && userSockets.has(userId)) {
        const userSocketSet = userSockets.get(userId);
        userSocketSet.delete(socket.id);

        if (userSocketSet.size === 0) {
            userSockets.delete(userId);
            if(users[userId]) {
                users[userId].contacts.forEach(contact => {
                    const contactSocketIds = userSockets.get(contact.id);
                    if (contactSocketIds) {
                        contactSocketIds.forEach(contactSocketId => {
                            io.to(contactSocketId).emit('status-update', { userId: userId, status: 'OFFLINE' });
                        });
                    }
                });
            }
            console.log(`User ${userId} is now fully offline.`);
        }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});