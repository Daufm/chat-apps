const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// In-memory storage (replace with a database in production)
const users = new Map();
const messages = [];
const activeUsers = new Set();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const secret = 'helloWorld';
// Authentication endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (users.has(username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.set(username, hashedPassword);
        
        const token = jwt.sign({ username }, secret);
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = users.get(username);

        if (!hashedPassword || !(await bcrypt.compare(password, hashedPassword))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ username }, 'your_jwt_secret');
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    let currentUser = null;

    socket.on('user_connected', (username) => {
        currentUser = username;
        activeUsers.add(username);
        socket.join('chat_room');
        
        // Send existing messages to new user
        socket.emit('load_messages', messages);
        
        // Broadcast active users list
        io.to('chat_room').emit('active_users', Array.from(activeUsers));
        
        // Broadcast user joined message
        io.to('chat_room').emit('user_joined', username);
    });

    socket.on('send_message', (data) => {
        const message = {
            id: Date.now(),
            user: currentUser,
            text: data.text,
            timestamp: new Date().toISOString()
        };
        messages.push(message);
        io.to('chat_room').emit('new_message', message);
    });

    socket.on('typing', () => {
        socket.broadcast.to('chat_room').emit('user_typing', currentUser);
    });

    socket.on('stop_typing', () => {
        socket.broadcast.to('chat_room').emit('user_stop_typing', currentUser);
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            activeUsers.delete(currentUser);
            io.to('chat_room').emit('active_users', Array.from(activeUsers));
            io.to('chat_room').emit('user_left', currentUser);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
