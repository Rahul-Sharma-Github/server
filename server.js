const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
var cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

// Store groups, members, and messages
let groups = {};
let groupMessages = {}; // Store messages for each group

// Handle client connection
io.on('connection', (socket) => {
  console.log('User connected: ', socket.id);

  // Join a group (room) and add members
socket.on('joinGroup', ({ groupName, userName }) => {
  if (!groupName || !userName) {
      console.error('Invalid join request: Missing groupName or userName');
      return;
  }

  // Initialize group and group messages if not already done
  if (!groups[groupName]) {
      groups[groupName] = [];
      groupMessages[groupName] = []; // Ensure the group has a message array
  }

  // Add user to the group if not already present
  if (!groups[groupName].some(member => member.userId === socket.id)) {
      groups[groupName].push({ userId: socket.id, userName });
  }

  socket.join(groupName);

  // Send previous messages for the group to the new member
  socket.emit('previousMessages', groupMessages[groupName]);

  // Notify group of new member
  io.to(groupName).emit('groupMembers', groups[groupName]);
});

  // Handle message sending to a specific group
  socket.on('sendMessage', ({ groupName, message, userName }) => {
    if (!groupName || !message || !userName) {
      console.error('Invalid message data:', { groupName, message, userName });
      return;
    }

    const msg = {
      id: Date.now().toString(), // Unique message ID
      userName,
      message,
      reactions: {} // Initialize empty reactions object
    };

    // Add message to the group's message history
    groupMessages[groupName].push(msg);

    // Broadcast message to group members only
    io.to(groupName).emit('message', { groupName, ...msg });
  });

  // Handle reaction to a message
  socket.on('reactToMessage', ({ groupName, messageId, userName, reaction }) => {
    const group = groupMessages[groupName];
    if (!group) return;

    // Find the message by ID and update the reaction
    const message = group.find(msg => msg.id === messageId);
    if (!message) return;

    // Update the reactions
    message.reactions[userName] = reaction;

    // Broadcast the updated message with reactions
    io.to(groupName).emit('updateMessage', message);
  });

  // Handle disconnect event
  socket.on('disconnect', () => {
    for (const groupName in groups) {
      // Remove user from all groups they were part of
      groups[groupName] = groups[groupName].filter(member => member.userId !== socket.id);

      // Notify remaining group members of updated member list
      io.to(groupName).emit('groupMembers', groups[groupName]);
    }
    console.log('User disconnected:', socket.id);
  });

  // Handle leave group event
  socket.on('leaveGroup', ({ groupName, userName }) => {
    if (!groupName || !userName) {
      console.error('Invalid leave request: Missing groupName or userName');
      return;
    }

    socket.leave(groupName);
    groups[groupName] = groups[groupName].filter(member => member.userName !== userName);

    // Notify group members of the updated list
    io.to(groupName).emit('groupMembers', groups[groupName]);
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server running on port 3000');
});
