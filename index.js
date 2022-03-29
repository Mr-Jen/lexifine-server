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

const {
  createLobby,
  joinLobby
} = require('./utils/lobbies');

console.log(process.env.ALLOWED_CLIENT_ENDPOINT)

const PORT = process.env.PORT || 3001;
  
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
});

// Run when client connects
io.on('connection', socket => {
    console.log("User connected with socketId: ", socket.id);

    socket.on("create-lobby", covername => {
      const lobbyId = createLobby(covername, socket.id)
      socket.emit("create-lobby", lobbyId)
    })

    socket.on("join-lobby", ({lobbyId, covername}) => {
      console.log("User joining lobby: ", covername, lobbyId)
      const lobby = joinLobby(covername, lobbyId, socket.id)

      // Emit to joining user
      socket.emit("join-lobby", {
        hostId: lobby.hostId,
        players: lobby.players,
      })

      // Emit to users already inside lobby
      const playersWithoutJoinedPlayer = lobby.players.filter(({id}) => id !== socket.id)

      playersWithoutJoinedPlayer.forEach(({id}) => {
        io.to(id).emit("join-lobby", {
          player: {
            id: socket.id,
            covername
          }
        })
      });
    })

    // Runs when client disconnects
    socket.on('disconnect', (reason) => {
        console.log("User disconnected with socketId: ", socket.id);
    });
});