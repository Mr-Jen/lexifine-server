require('dotenv').config()
const http = require('http');
const cors = require('cors')
const express = require('express');
const socketio = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketio(server,{
  cors: {
    origin: '*',
  }
});

const {
  createLobby,
  joinLobby,
  leaveLobby,
  findLobbyByLobbyId,
  findLobbyByPlayerId
} = require('./utils/lobbies');

const {
  initGame
} = require('./utils/game')

console.log(process.env.ALLOWED_CLIENT_ENDPOINT)

const PORT = process.env.PORT || 3001;
  
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
});

app.use(cors())

app.get('/lobby/:lobbyId', function(req, res) {
  const lobbyIdValid = findLobbyByLobbyId(req.params.lobbyId);
  if (lobbyIdValid) {
    res.sendStatus(200)
  } else {
    res.sendStatus(404)
  }
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

    socket.on("init-game", () => {
      const lobby = findLobbyByPlayerId(socket.id)
      const gameSettings = initGame(lobby)
      lobby.game.players.forEach(({id}) => {
        io.to(id).emit("init-game", gameSettings)
      })
    })

    socket.on("disconnect", () => {
      console.log("User disconnected")
      const lobby = leaveLobby(socket.id) 
      lobby && lobby.players.forEach(({id}) => io.to(id).emit('leave-lobby', socket.id))
    })
});