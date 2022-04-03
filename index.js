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
  initGame,
  startDefinePhase,
  submitDefinition,
  unready,
  startVotePhase,
  submitVote,
  setVotePhaseEndTimer,
  initGameSettings
} = require('./utils/game')

const {
  shuffle
} = require('./helpers/shuffle')

console.log(process.env.ALLOWED_CLIENT_ENDPOINT)

const PORT = process.env.PORT || 3001;

// Helper functions
const broadcastToPlayers = (players, eventName, payload) => {
  players.forEach(({id}) => io.to(id).emit(eventName, payload))
}

const broadcastStartVotePhase = lobby => {
  lobby.game.players.filter(({id}) => id !== lobby.game.talkmasterId)
      .forEach(({id}) => 
      {
        const myDefinitionId = lobby.game.definitions.find(({createdBy}) => createdBy === id).id
        io.to(id).emit('start-vote-phase', {
          myDefinitionId,
          definitions: lobby.game.definitions.map(({id}) => ({id}))
        })
      })
    io.to(lobby.game.talkmasterId).emit('start-vote-phase', {
      definitions: lobby.game.definitions
    })
}
  
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

      broadcastToPlayers(playersWithoutJoinedPlayer, "join-lobby", {
        player: {
          id: socket.id,
          covername
        }
      })
    })

    socket.on("init-game", () => {
      const lobby = findLobbyByPlayerId(socket.id)
      const gameSettings = initGame(lobby)
      broadcastToPlayers(lobby.players, "init-game", gameSettings)
      const payload = startDefinePhase(lobby.game)
      setTimeout(() => {
        broadcastToPlayers(lobby.game.players, 'start-define-phase', payload)
      }, 3500)
      setTimeout(() => {
        if (lobby.game.phase !== 'define') return
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }, initGameSettings.roundSettings.definitionPhaseDuration + 1000)
    })

    socket.on("define-submit", definition => {
      const lobby = findLobbyByPlayerId(socket.id)
      if (lobby.game.phase !== 'define') return
      const allGhostwritersAreReady = submitDefinition(socket.id, definition, lobby.game)
      if (allGhostwritersAreReady){
        console.log("Everyone is ready")
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }
      !allGhostwritersAreReady && broadcastToPlayers(lobby.game.players, "ready", {playerId: socket.id})
    })

    socket.on("vote-submit", definitionId => {
      const lobby = findLobbyByPlayerId(socket.id)
      if (lobby.game.phase !== 'vote') return
      const allButOneGhostwriterReady = submitVote(definitionId, socket.id, lobby.game)
      if(allButOneGhostwriterReady){
        const timerStart = setVotePhaseEndTimer(lobby.game)
        setTimeout(() => {
          console.log("STARTING SCOREBOARD PHASE")
        }, initGameSettings.roundSettings.votePhaseEndDuration)
        broadcastToPlayers(lobby.game.players, "ready", {
          playerId: socket.id,
          timerStart
        })
      } else {
        broadcastToPlayers(lobby.game.players, "ready", {playerId: socket.id})
      }
      
    })

    socket.on("unready", () => {
      const lobby = findLobbyByPlayerId(socket.id)
      unready(socket.id, lobby.game)
      console.log("Game players after unready: ", lobby.game.players)
      broadcastToPlayers(lobby.game.players, "unready", socket.id)
    })

    socket.on("disconnect", () => {
      console.log("User disconnected")
      const lobby = leaveLobby(socket.id) 
      //lobby && lobby.players.forEach(({id}) => io.to(id).emit('leave-lobby', socket.id))
      lobby && broadcastToPlayers(lobby.players, "leave-lobby", socket.id)
    })
})