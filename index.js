require('dotenv').config()
const http = require('http')
const cors = require('cors')
const express = require('express')
const socketio = require('socket.io')
const app = express()
const server = http.createServer(app)
const io = socketio(server, {
  cors: {
    origin: '*',
  },
})

const {
  createLobby,
  joinLobby,
  leaveLobby,
  leaveGame,
  isIngame,
  addToPendingLeaves,
  findLobbyByLobbyId,
  findLobbyByPlayerId,
  addTimeoutToLobby,
  clearAllLobbyTimeouts,
} = require('./utils/lobbies')

const {
  initGameGuard,
  initGame,
  startDefinePhase,
  skipTermGuard,
  defineSubmitGuard,
  submitDefinition,
  definitionTitleSubmitGuard,
  unready,
  startVotePhase,
  voteSubmitGuard,
  submitVote,
  startPresentPhase,
  presentNextPlayer,
  setVotePhaseEndTimer,
  getNumOfUnreadyPlayers,
  startScoreboardPhase,
  initGameSettings,
} = require('./utils/game')

const PORT = process.env.PORT || 3001

// Helper functions
const broadcastToPlayers = (players, eventName, payload) => {
  players.forEach(({id}) => {
    io.to(id).emit(eventName, payload)
    console.log(`[${id}]: (${eventName})`, payload)
  })
}

const broadcastStartVotePhase = (lobby) => {
  lobby.game.players
    .filter(({id}) => id !== lobby.game.talkmasterId)
    .forEach(({id}) => {
      const myDefinitionId = lobby.game.definitions.find(
        ({createdBy}) => createdBy === id
      ).id
      io.to(id).emit('start-vote-phase', {
        myDefinitionId,
        definitions: lobby.game.definitions.map(({id}) => ({id})),
      })
    })
  io.to(lobby.game.talkmasterId).emit('start-vote-phase', {
    definitions: lobby.game.definitions,
  })
  console.log("Sent 'start-vote-phase' event")
}

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
})

app.use(cors())

app.get('/lobby/:lobbyId', function (req, res) {
  const lobbyIdValid = findLobbyByLobbyId(req.params.lobbyId)
  console.log('-------------- ', lobbyIdValid, ' --------------')
  if (lobbyIdValid) {
    res.sendStatus(200)
  } else {
    res.sendStatus(404)
  }
})

// Run when client connects
io.on('connection', (socket) => {
  console.log('User connected with socketId: ', socket.id)

  socket.on('create-lobby', (covername) => {
    console.log("Received 'create-lobby' event")
    const lobbyId = createLobby(covername, socket.id)
    socket.emit('create-lobby', lobbyId)
    console.log("Sent 'create-lobby' event")
  })

  socket.on('join-lobby', ({lobbyId, covername}) => {
    console.log("Received 'join-lobby' event")
    const joinedlobby = joinLobby(covername, lobbyId, socket.id)
    const lobby = findLobbyByPlayerId(socket.id)
    const gameAlreadyStarted =
      lobby.game && Object.keys(lobby.game).length !== 0

    // Emit to joining user
    socket.emit('join-lobby', {
      hostId: joinedlobby.hostId,
      players: joinedlobby.players,
      gameAlreadyStarted,
    })

    // Emit to users already inside lobby
    const playersWithoutJoinedPlayer = lobby.players.filter(
      ({id}) => id !== socket.id
    )

    broadcastToPlayers(playersWithoutJoinedPlayer, 'join-lobby', {
      player: {
        id: socket.id,
        covername,
      },
    })
    console.log("Sent 'join-lobby' event")
  })

  socket.on('init-game', () => {
    console.log("Received 'init-game' event")
    const lobby = findLobbyByPlayerId(socket.id)

    // Check if init-game event allowed to be executed
    const initGameAllowed = initGameGuard(lobby, socket.id)
    if(initGameAllowed){      
      const gameSettings = initGame(lobby)
      broadcastToPlayers(lobby.players, 'init-game', gameSettings)
      const payload = startDefinePhase(lobby.game)
      const startDefinePhaseTimeout = setTimeout(() => {
        broadcastToPlayers(lobby.game.players, 'start-define-phase', payload)
      }, 3500)
      addTimeoutToLobby(lobby, startDefinePhaseTimeout)
      const startVotePhaseTimeout = setTimeout(() => {
        if (lobby.game.phase !== 'define') return
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }, initGameSettings.roundSettings.definitionPhaseDuration + 1000)
      addTimeoutToLobby(lobby, startVotePhaseTimeout)
    } else {
      console.log("Error: Game could not be initialized")
      broadcastToPlayers(
        lobby.players,
        'error',
        'Hoppla... Das Spiel konnte nicht gestartet werden'
      )
    }
  })

  socket.on('skip-term', () => {
    console.log("Received 'skip-term' event")
    const lobby = findLobbyByPlayerId(socket.id)

    // Check if skip-term event is allowed to be executed
    const skipTermAllowed = skipTermGuard(lobby, socket.id)
    if(skipTermAllowed){
      clearAllLobbyTimeouts(lobby)
      const payload = startDefinePhase(lobby.game, {skipTerm: true})
      broadcastToPlayers(lobby.game.players, 'start-define-phase', payload)
      const startVotePhaseTimeout = setTimeout(() => {
        if (lobby.game.phase !== 'define') return
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }, initGameSettings.roundSettings.definitionPhaseDuration + 1000)
      addTimeoutToLobby(lobby, startVotePhaseTimeout)
    } else {
      console.log("Error: Term could not be skipped")
      broadcastToPlayers(
        lobby.players,
        'error',
        'Hoppla... Der Begriff konnte nicht übersprungen werden'
      )
    }
  })

  socket.on('define-submit', (definition) => {
    console.log("Received 'define-submit' event")
    const lobby = findLobbyByPlayerId(socket.id)

    // Check if define-submit is allowed to be executed
    const defineSubmitAllowed = defineSubmitGuard(lobby, socket.id)
    if(defineSubmitAllowed){
      if (lobby.game.phase !== 'define') return
      submitDefinition(socket.id, definition, lobby.game)
      const allGhostwritersAreReady = getNumOfUnreadyPlayers(lobby.game) === 0
      if (allGhostwritersAreReady) {
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }
      if (!allGhostwritersAreReady) {
        broadcastToPlayers(lobby.game.players, 'ready', {playerId: socket.id})
        console.log("Sent 'ready' event")
      }
    } else {
      console.log("Error: Definition could not be submitted")
      broadcastToPlayers(
        lobby.players,
        'error',
        'Hoppla... Deine Definition konnte nicht abgegeben werden'
      )
    }
  })

  socket.on('definition-title-submit', ({definitionId, title}) => {
    console.log("Received 'definition-title-submit' event")
    const lobby = findLobbyByPlayerId(socket.id)

    // Check if definition-title-submit is allowed to be executed
    const definitionTitleSubmitAllowed = definitionTitleSubmitGuard(lobby, socket.id)
    if(definitionTitleSubmitAllowed){
      //console.log(definitionId, title, lobby.game.definitions)
      const definition = lobby.game.definitions.find(({id}) => definitionId === id)
      const cleanedTitle = title.toUpperCase().replace(/[^\w\s]|_/g, "")
      definition.title = cleanedTitle
      broadcastToPlayers(lobby.game.players, "definition-title-submit", {
        definitionId,
        title: cleanedTitle
      })
    } else {
      console.log("Error: Definition title could not be submitted")
      broadcastToPlayers(
        lobby.players,
        'error',
        'Hoppla... Dein ausgewählter Begriff konnte nicht abgegeben werden'
      )
    }
  })

  socket.on('vote-submit', (definitionId) => {
    console.log("Received 'vote-submit' event")
    const lobby = findLobbyByPlayerId(socket.id)

    const voteSubmitAllowed = voteSubmitGuard(lobby, socket.id)
    if(voteSubmitAllowed){
      if (lobby.game.phase !== 'vote') return
      submitVote(definitionId, socket.id, lobby.game)
      const numOfReadyPlayers = getNumOfUnreadyPlayers(lobby.game)
      const allButOneGhostwriterReady = numOfReadyPlayers === 1
      const allGhostwritersReady = numOfReadyPlayers === 0
      if (allButOneGhostwriterReady) {
        const timerStart = setVotePhaseEndTimer(lobby.game)
        const startPresentPhaseTimeout = setTimeout(() => {
          if (lobby.game.phase === 'vote') {
            startPresentPhase(lobby.game)
            broadcastToPlayers(lobby.game.players, 'start-present-phase')
            console.log("Sent 'start-present-phase' event")
          }
        }, initGameSettings.roundSettings.votePhaseEndDuration)
        addTimeoutToLobby(lobby, startPresentPhaseTimeout)
        broadcastToPlayers(lobby.game.players, 'ready', {
          playerId: socket.id,
          timerStart,
        })
        console.log("Sent 'ready' event")
      } else if (allGhostwritersReady) {
        startPresentPhase(lobby.game)
        broadcastToPlayers(lobby.game.players, 'start-present-phase')
        console.log("Sent 'start-present-phase' event")
      } else {
        broadcastToPlayers(lobby.game.players, 'ready', {playerId: socket.id})
        console.log("Sent 'ready' event")
      }
    } else {
      console.log("Error: Vote could not be submitted")
      broadcastToPlayers(
        lobby.players,
        'error',
        'Hoppla... Deine Wahl konnte nicht bestätigt werden'
      )
    }
  })

  socket.on('present-next-player', () => {
    console.log("Received 'present-next-player' event")
    const lobby = findLobbyByPlayerId(socket.id)
    const gameChanges = presentNextPlayer(lobby.game)
    broadcastToPlayers(lobby.game.players, 'present-next-player', gameChanges)
    console.log("Sent 'present-next-player' event")
  })

  socket.on('start-scoreboard-phase', () => {
    console.log("Received 'start-scoreboard-phase' event")
    const lobby = findLobbyByPlayerId(socket.id)
    const gamePlayers = lobby.game.players
    const timerStart = startScoreboardPhase(lobby.game)
    broadcastToPlayers(lobby.game.players, 'start-scoreboard-phase', timerStart)
    const lastRotation =
      lobby.game.talkmasterId === gamePlayers[gamePlayers.length - 1].id
    const isLastRoundAndRotation = lobby.game.currentRound === initGameSettings.roundSettings.max && lastRotation
    const nextRotationTimeout = setTimeout(() => {
      console.log(
        'Round Count before next rotation',
        lobby.game.currentRound,
        lastRotation
      )
      if (isLastRoundAndRotation) {
        broadcastToPlayers(lobby.players, 'end-game')
        delete lobby.game
        return
      }
      lobby.pendingLeaves.forEach((playerId) => {
        const remainingLobby = leaveGame(lobby, playerId)
        remainingLobby &&
          broadcastToPlayers(lobby.game.players, 'leave-lobby', playerId)
      })
      const payload = startDefinePhase(lobby.game)
      broadcastToPlayers(lobby.game.players, 'start-define-phase', payload)
      console.log("Sent 'start-define-phase' event")
      const startVotePhaseTimeout = setTimeout(() => {
        if (lobby.game.phase !== 'define') return
        startVotePhase(lobby.game)
        broadcastStartVotePhase(lobby)
      }, initGameSettings.roundSettings.definitionPhaseDuration + 1000)
      addTimeoutToLobby(lobby, startVotePhaseTimeout)
    }, isLastRoundAndRotation ? initGameSettings.roundSettings.finalScoreboardPhaseDuration : initGameSettings.roundSettings.scoreboardPhaseDuration)
    addTimeoutToLobby(lobby, nextRotationTimeout)
  })

  socket.on('unready', () => {
    console.log("Received 'unready' event")
    const lobby = findLobbyByPlayerId(socket.id)
    unready(socket.id, lobby.game)
    broadcastToPlayers(lobby.game.players, 'unready', socket.id)
    console.log("Sent 'unready' event")
  })

  socket.on('disconnect', () => {
    console.log("Received 'disconnect' event")
    const lobby = findLobbyByPlayerId(socket.id)
    if (!lobby) return
    if (isIngame(lobby, socket.id)) {
      const isTalkmaster = socket.id === lobby.game.talkmasterId
      if (isTalkmaster) {
        const remainingLobby = leaveGame(lobby, socket.id)
        if (remainingLobby) {
          console.log('Leaving remaining lobby ingame')
          broadcastToPlayers(lobby.players, 'end-game')
          broadcastToPlayers(lobby.players, 'leave-lobby', socket.id)
          broadcastToPlayers(
            lobby.players,
            'error',
            'Boo... Der Talkmaster hat die laufende Runde verlassen. Das Spiel wurde abgebrochen.'
          )
          clearAllLobbyTimeouts(lobby)
          delete lobby.game
        }
      } else {
        addToPendingLeaves(lobby, socket.id)
      }
    } else {
      const remainingLobby = leaveLobby(lobby, socket.id)
      console.log('Leaving lobby outside game')
      remainingLobby &&
        broadcastToPlayers(lobby.players, 'leave-lobby', socket.id)
    }
  })
})
