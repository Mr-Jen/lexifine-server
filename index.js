const {
  createLobby,
  joinLobby,
  leaveLobby,
  leaveGame,
  isIngame,
  addToPendingLeaves,
  findLobbyByLobbyId,
  addTimeoutToLobby,
  clearAllLobbyTimeouts,
} = require('./utils/lobbies')
const {
  initGame,
  startDefinePhase,
  submitDefinition,
  unready,
  startVotePhase,
  submitVote,
  startPresentPhase,
  presentNextPlayer,
  getNumOfUnreadyPlayers,
  startScoreboardPhase,
  initGameSettings,
} = require('./utils/game')
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
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
})
app.use(cors())
app.get('/lobby/:lobbyId', function (req, res) {
  const lobbyIdValid = findLobbyByLobbyId(req.params.lobbyId)
  if (lobbyIdValid) {
    res.sendStatus(200)
  } else {
    res.sendStatus(404)
  }
})
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
}
const startVotePhaseTimers = (lobby) => {
  const startVotePhaseCountdown = setCountdown(
    initGameSettings.roundSettings.definitionPhaseDuration + 1000,
    (differenceInSeconds) => {
      broadcastToPlayers(lobby.game.players, 'time-left', differenceInSeconds)
    },
    () => {
      broadcastToPlayers(lobby.game.players, 'timer-end')
      if (lobby.game.phase !== 'define') return
      startVotePhase(lobby.game)
      broadcastStartVotePhase(lobby)
    }
  )
  addTimeoutToLobby(lobby, startVotePhaseCountdown)
}
const setCountdown = (durationInMillis, countCallback, endCallback) => {
  const startTime = new Date().getTime()
  const countdownInterval = setInterval(() => {
    const endTime = startTime + durationInMillis
    const now = new Date().getTime()
    const differenceInSeconds = Math.round((endTime - now) / 1000)
    if (differenceInSeconds < 0) {
      endCallback()
      return clearInterval(countdownInterval)
    }
    countCallback(differenceInSeconds)
  }, 1000)
  return countdownInterval
}
io.on('connection', (socket) => {
  let lobby
  socket.on('create-lobby', (covername) => {
    lobby = createLobby(covername, socket.id)
    socket.emit('create-lobby', lobby.id)
  })
  socket.on('join-lobby', ({lobbyId, covername}) => {
    const lobbyToBeJoined = findLobbyByLobbyId(lobbyId)
    if (!lobbyToBeJoined) return
    lobby = joinLobby(covername, lobbyToBeJoined, socket.id)
    const gameAlreadyStarted = !!lobby.game
    socket.emit('join-lobby', {
      hostId: lobby.hostId,
      players: lobby.players,
      gameAlreadyStarted,
    })
    const playersWithoutJoinedPlayer = lobby.players.filter(
      ({id}) => id !== socket.id
    )
    broadcastToPlayers(playersWithoutJoinedPlayer, 'join-lobby', {
      player: {
        id: socket.id,
        covername,
      },
    })
  })
  socket.on('init-game', () => {
    if (!lobby) return
    if (lobby.game) return
    const {hostId} = lobby
    if (hostId !== socket.id) return
    const game = initGame(lobby)
    const {roundSettings, players} = game
    broadcastToPlayers(players, 'init-game', {roundSettings})
    const payload = startDefinePhase(lobby.game)
    clearAllLobbyTimeouts(lobby)
    const startDefinePhaseCountdown = setCountdown(
      3500,
      () => {},
      () => {
        broadcastToPlayers(players, 'start-define-phase', payload)
      }
    )
    addTimeoutToLobby(lobby, startDefinePhaseCountdown)
    startVotePhaseTimers(lobby)
  })
  socket.on('skip-term', () => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {players, phase, talkmasterId} = game
    if (phase !== 'define') return
    if (talkmasterId !== socket.id) return
    clearAllLobbyTimeouts(lobby)
    const payload = startDefinePhase(game, {skipTerm: true})
    broadcastToPlayers(players, 'start-define-phase', {
      ...payload,
      skip: true,
    })
    startVotePhaseTimers(lobby)
  })
  socket.on('define-submit', ({definition, ready = false}) => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {players, talkmasterId, phase} = game
    if (phase !== 'define') return
    if (talkmasterId === socket.id) return
    submitDefinition(socket.id, definition, game, ready)
    if (ready) {
      const allGhostwritersAreReady = getNumOfUnreadyPlayers(game) === 0
      if (allGhostwritersAreReady) {
        clearAllLobbyTimeouts(lobby)
        broadcastToPlayers(players, 'timer-end')
        startVotePhase(game)
        broadcastStartVotePhase(lobby)
      }
      if (!allGhostwritersAreReady) {
        broadcastToPlayers(players, 'ready', {playerId: socket.id})
      }
    }
  })
  socket.on('definition-title-submit', ({definitionId, title}) => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {phase, players, talkmasterId} = game
    if (phase !== 'vote') return
    if (talkmasterId !== socket.id) return
    const definition = game.definitions.find(({id}) => definitionId === id)
    definition.title = title
    broadcastToPlayers(players, 'definition-title-submit', {
      definitionId,
      title: definition.title,
    })
  })
  socket.on('vote-submit', ({definitionId, ready = false}) => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {phase, talkmasterId, players} = game
    if (phase !== 'vote') return
    if (talkmasterId === socket.id) return
    submitVote(definitionId, socket.id, game, ready)
    if (ready) {
      const numOfReadyPlayers = getNumOfUnreadyPlayers(game)
      const allButOneGhostwriterReady = numOfReadyPlayers === 1
      const allGhostwritersReady = numOfReadyPlayers === 0
      if (allButOneGhostwriterReady) {
        clearAllLobbyTimeouts(lobby)
        const votePhaseCountdown = setCountdown(
          initGameSettings.roundSettings.votePhaseEndDuration,
          (differenceInSeconds) => {
            broadcastToPlayers(players, 'time-left', differenceInSeconds)
          },
          () => {
            if (phase === 'vote') {
              startPresentPhase(game)
              broadcastToPlayers(players, 'timer-end')
              broadcastToPlayers(players, 'start-present-phase')
            }
          }
        )
        addTimeoutToLobby(lobby, votePhaseCountdown)
        broadcastToPlayers(players, 'ready', {
          playerId: socket.id,
        })
      } else if (allGhostwritersReady) {
        startPresentPhase(game)
        clearAllLobbyTimeouts(lobby)
        broadcastToPlayers(players, 'timer-end')
        broadcastToPlayers(players, 'start-present-phase')
      } else {
        broadcastToPlayers(players, 'ready', {playerId: socket.id})
      }
    }
  })
  socket.on('present-next-player', () => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {phase, talkmasterId, players} = game
    if (phase !== 'present') return
    if (talkmasterId !== socket.id) return
    const gameChanges = presentNextPlayer(game)
    broadcastToPlayers(players, 'present-next-player', gameChanges)
  })
  socket.on('start-scoreboard-phase', () => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {phase, talkmasterId, players} = game
    if (phase !== 'present') return
    if (talkmasterId !== socket.id) return
    startScoreboardPhase(game)
    broadcastToPlayers(players, 'start-scoreboard-phase')
    const lastRotation =
      lobby.game.talkmasterId === players[players.length - 1].id
    const isLastRoundAndRotation =
      lobby.game.currentRound === initGameSettings.roundSettings.max &&
      lastRotation
    const duration = isLastRoundAndRotation
      ? initGameSettings.roundSettings.finalScoreboardPhaseDuration
      : initGameSettings.roundSettings.scoreboardPhaseDuration
    clearAllLobbyTimeouts(lobby)
    const nextRotationCountdown = setCountdown(
      duration,
      (differenceInSeconds) => {
        broadcastToPlayers(players, 'time-left', differenceInSeconds)
      },
      () => {
        broadcastToPlayers(players, 'timer-end')
        if (isLastRoundAndRotation) {
          broadcastToPlayers(lobby.players, 'end-game')
          delete lobby.game
          return
        }
        lobby.pendingLeaves.forEach((playerId) => {
          const remainingLobby = leaveGame(lobby, playerId)
          remainingLobby && broadcastToPlayers(players, 'leave-lobby', playerId)
        })
        const payload = startDefinePhase(lobby.game)
        broadcastToPlayers(players, 'start-define-phase', payload)
        startVotePhaseTimers(lobby)
      }
    )
    addTimeoutToLobby(lobby, nextRotationCountdown)
  })
  socket.on('unready', () => {
    if (!lobby) return
    if (!lobby.game) return
    const {game} = lobby
    const {players, phase, talkmasterId} = game
    if (phase !== 'present' && phase !== 'vote') return
    if (talkmasterId === socket.id) return
    unready(socket.id, game)
    broadcastToPlayers(players, 'unready', socket.id)
  })
  socket.on('disconnect', () => {
    if (!lobby) return
    if (isIngame(lobby, socket.id)) {
      const {game} = lobby
      const {talkmasterId} = game
      if (socket.id === talkmasterId) {
        const remainingLobby = leaveGame(lobby, socket.id)
        if (remainingLobby) {
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
      remainingLobby &&
        broadcastToPlayers(lobby.players, 'leave-lobby', socket.id)
    }
    lobby = undefined
  })
})
