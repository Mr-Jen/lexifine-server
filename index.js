const { v4: uuidv4 } = require('uuid');
require('dotenv').config()
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: '*',
  }
});

console.log(process.env.ALLOWED_CLIENT_ENDPOINT)

const PORT = process.env.PORT || 3001;
  
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
});

app.get('/generate-id', (req,res) => {
  console.log("Requesting id")
  res.json({id: uuidv4()});
})

// Run when client connects
io.on('connection', socket => {
    console.log("User connected with socketId: ", socket.id);
    // Runs when client disconnects
    socket.on('disconnect', (reason) => {
        console.log("User disconnected with socketId: ", socket.id);
    });
});