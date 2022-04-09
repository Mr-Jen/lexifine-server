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
  startPresentPhase,
  presentNextPlayer,
  setVotePhaseEndTimer,
  getNumOfUnreadyPlayers,
  startScoreboardPhase,
  getGhostwriters,
  initGameSettings
} = require('./utils/game')

const PORT = process.env.PORT || 3001;

// Helper functions
const broadcastToPlayers = (players, eventName, payload) => {
  players.forEach(({id}) => {
    io.to(id).emit(eventName, payload)
    console.log(`[${id}]: (${eventName})`, payload)
  })
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
    console.log("Sent 'start-vote-phase' event")
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
      console.log("Received 'create-lobby' event")
      const lobbyId = createLobby(covername, socket.id)
      socket.emit("create-lobby", lobbyId)
      console.log("Sent 'create-lobby' event")
    })

    socket.on("join-lobby", ({lobbyId, covername}) => {
      console.log("Received 'join-lobby' event")
      const joinedlobby = joinLobby(covername, lobbyId, socket.id)
      const lobby = findLobbyByPlayerId(socket.id)
      const gameAlreadyStarted = lobby.game && Object.keys(lobby.game).length !== 0

      // Emit to joining user
      socket.emit("join-lobby", {
        hostId: joinedlobby.hostId,
        players: joinedlobby.players,
        gameAlreadyStarted
      })

      // Emit to users already inside lobby
      const playersWithoutJoinedPlayer = lobby.players.filter(({id}) => id !== socket.id)

      broadcastToPlayers(playersWithoutJoinedPlayer, "join-lobby", {
        player: {
          id: socket.id,
          covername
        }
      })
      console.log("Sent 'join-lobby' event")
    })

    socket.on("init-game", () => {
      console.log("Received 'init-game' event")
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
      console.log("Received 'define-submit' event")
      const lobby = findLobbyByPlayerId(socket.id)
      if (lobby.game.phase !== 'define') return
      submitDefinition(socket.id, definition, lobby.game)
      const allGhostwritersAreReady = getNumOfUnreadyPlayers(lobby.game) === 0
      if (allGhostwritersAreReady){
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }
      if (!allGhostwritersAreReady) {
        broadcastToPlayers(lobby.game.players, "ready", {playerId: socket.id})
        console.log("Sent 'ready' event")
      }
    })

    socket.on("vote-submit", definitionId => {
      console.log("Received 'vote-submit' event")
      const lobby = findLobbyByPlayerId(socket.id)
      if (lobby.game.phase !== 'vote') return
      submitVote(definitionId, socket.id, lobby.game)
      const numOfReadyPlayers = getNumOfUnreadyPlayers(lobby.game)
      const allButOneGhostwriterReady = numOfReadyPlayers === 1
      const allGhostwritersReady = numOfReadyPlayers === 0
      if(allButOneGhostwriterReady){
        const timerStart = setVotePhaseEndTimer(lobby.game)
        setTimeout(() => {
          if(lobby.game.phase === "vote"){
            startPresentPhase(lobby.game)
            broadcastToPlayers(lobby.game.players, 'start-present-phase')
            console.log("Sent 'start-present-phase' event")
          }
        }, initGameSettings.roundSettings.votePhaseEndDuration)
        broadcastToPlayers(lobby.game.players, "ready", {
          playerId: socket.id,
          timerStart
        })
        console.log("Sent 'ready' event")
      } else if (allGhostwritersReady) {
        startPresentPhase(lobby.game)
        broadcastToPlayers(lobby.game.players, 'start-present-phase')
        console.log("Sent 'start-present-phase' event")
      } 
      else {
        broadcastToPlayers(lobby.game.players, "ready", {playerId: socket.id})
        console.log("Sent 'ready' event")
      }
    })

    socket.on("present-next-player", () => {
      console.log("Received 'present-next-player' event")
      const lobby = findLobbyByPlayerId(socket.id)
      const gameChanges = presentNextPlayer(lobby.game)
      broadcastToPlayers(lobby.game.players, "present-next-player", gameChanges)
      console.log("Sent 'present-next-player' event")
    })

    socket.on("start-scoreboard-phase", () => {
      console.log("Received 'start-scoreboard-phase' event")
      const lobby = findLobbyByPlayerId(socket.id)
      const timerStart = startScoreboardPhase(lobby.game)
      broadcastToPlayers(lobby.game.players, "start-scoreboard-phase", timerStart)
      setTimeout(() => {
        if (lobby.game.currentRound === initGameSettings.roundSettings.max){
          broadcastToPlayers(lobby.players, 'end-game') 
          delete lobby.game          
          return
        }
        const payload = startDefinePhase(lobby.game)
        broadcastToPlayers(lobby.game.players, 'start-define-phase', payload)
        console.log("Sent 'start-define-phase' event")
        setTimeout(() => {
          if (lobby.game.phase !== 'define') return
          startVotePhase(lobby.game)
          broadcastStartVotePhase(lobby)
        }, initGameSettings.roundSettings.definitionPhaseDuration + 1000)
      }, initGameSettings.roundSettings.scoreboardPhaseDuration)
    })

    socket.on("unready", () => {
      console.log("Received 'unready' event")
      const lobby = findLobbyByPlayerId(socket.id)
      unready(socket.id, lobby.game)
      broadcastToPlayers(lobby.game.players, "unready", socket.id)
      console.log("Sent 'unready' event")
    })

    socket.on("disconnect", () => {
      console.log("Received 'disconnect' event")
      const lobby = leaveLobby(socket.id) 
      //lobby && lobby.players.forEach(({id}) => io.to(id).emit('leave-lobby', socket.id))
      lobby && broadcastToPlayers(lobby.players, "leave-lobby", socket.id)
    })
})