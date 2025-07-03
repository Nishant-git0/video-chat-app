const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || "https://your-app-name.onrender.com"]
    : ["http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
};

app.use(cors(corsOptions));

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Store room and user information
const rooms = new Map();
const users = new Map();

const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Your existing socket.io code here...
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, userName } = data;
    
    users.set(socket.id, { userName, roomId, socketId: socket.id });
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    rooms.get(roomId).set(socket.id, { userName, socketId: socket.id });
    socket.join(roomId);
    
    const roomUsers = Array.from(rooms.get(roomId).entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, user]) => ({
        userId: id,
        userName: user.userName
      }));
    
    socket.emit('existing-users', roomUsers);
    
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: userName
    });
    
    socket.emit('room-info', {
      roomId,
      totalUsers: rooms.get(roomId).size,
      users: Array.from(rooms.get(roomId).values())
    });
    
    socket.to(roomId).emit('room-info', {
      roomId,
      totalUsers: rooms.get(roomId).size,
      users: Array.from(rooms.get(roomId).values())
    });
    
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Total users: ${rooms.get(roomId).size}`);
  });

  socket.on('offer', (data) => {
    const { targetUserId, offer, roomId } = data;
    const senderInfo = users.get(socket.id);
    
    socket.to(targetUserId).emit('offer', {
      offer,
      senderId: socket.id,
      senderName: senderInfo?.userName || 'Unknown',
      roomId
    });
  });

  socket.on('answer', (data) => {
    const { targetUserId, answer, roomId } = data;
    const senderInfo = users.get(socket.id);
    
    socket.to(targetUserId).emit('answer', {
      answer,
      senderId: socket.id,
      senderName: senderInfo?.userName || 'Unknown',
      roomId
    });
  });

  socket.on('ice-candidate', (data) => {
    const { targetUserId, candidate, roomId } = data;
    
    socket.to(targetUserId).emit('ice-candidate', {
      candidate,
      senderId: socket.id,
      roomId
    });
  });

  socket.on('media-state-change', (data) => {
    const { roomId, isVideoEnabled, isAudioEnabled } = data;
    const userInfo = users.get(socket.id);
    
    socket.to(roomId).emit('user-media-state-changed', {
      userId: socket.id,
      userName: userInfo?.userName || 'Unknown',
      isVideoEnabled,
      isAudioEnabled
    });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId, userName } = user;
      
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('user-left', {
            userId: socket.id,
            userName: userName
          });
          
          socket.to(roomId).emit('room-info', {
            roomId,
            totalUsers: rooms.get(roomId).size,
            users: Array.from(rooms.get(roomId).values())
          });
        }
      }
      
      users.delete(socket.id);
      console.log(`User ${userName} (${socket.id}) disconnected`);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${corsOptions.origin}`);
});