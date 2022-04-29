const {v4: uuidv4} = require('uuid')
const {shuffle} = require('../helpers/shuffle.js')

const {parse} = require('csv-parse/sync')
const fs = require('fs')
const path = require('path')

const {pickLexiconEntry} = require('../helpers/pickLexiconEntry')

const articles = fs.readFileSync(
  path.join(__dirname, '..', 'data', 'lexicon-25_04_22.csv'),
  {encoding: 'utf-8'}
)

const DEFINITIONS = parse(articles, {
  columns: true,
  skip_empty_lines: true,
})

const initGameSettings = {
  roundSettings: {
    max: 1, //2
    definitionPhaseDuration: 120 * 1000,
    votePhaseEndDuration: 10 * 1000,
    scoreboardPhaseDuration: 10 * 1000,
    finalScoreboardPhaseDuration: 50 * 1000,
  },
}
const defaultDefinition =
  'Ich war Gassi gehen und habe keine Definition abgegeben'
const initGame = (lobby) => {
  lobby.game = {
    ...initGameSettings,
    currentRound: 0,
    players: lobby.players.map(({id}) => ({
      id,
      points: 0,
    })),
  }
  return lobby.game
}
const getNumOfUnreadyPlayers = (game) => {
  return game.players.filter(
    ({isReady, id}) => game.talkmasterId !== id && !isReady
  ).length
}
const startDefinePhase = (game, {skipTerm} = {skipTerm: false}) => {
  game.phase = 'define'
  game.timerStart = new Date().getTime()
  if (!skipTerm) {
    if (game.talkmasterId === game.players[game.players.length - 1].id) {
      game.currentRound += 1
      game.talkmasterId = undefined
    }
    if (game.currentRound === 0) {
      game.currentRound = 1
    }
    if (game.talkmasterId) {
      const talkmasterIndex = game.players.findIndex(
        ({id}) => id === game.talkmasterId
      )
      game.talkmasterId = game.players[talkmasterIndex + 1].id
    } else {
      game.talkmasterId = game.players[0].id
    }
  }
  const lexiconEntry = pickLexiconEntry(DEFINITIONS)
  game.termToDefine = lexiconEntry.termToDefine
  game.definitions = [
    {
      id: uuidv4(),
      definition: lexiconEntry.definition,
      createdBy: 'game',
    },
  ]
  game.players
    .filter(({id}) => id !== game.talkmasterId)
    .forEach((player) => (player.isReady = false))

  return {
    timerStart: game.timerStart,
    talkmasterId: game.talkmasterId,
    termToDefine: game.termToDefine,
  }
}
const submitDefinition = (playerId, definition, game, ready) => {
  const currentDefinition = game.definitions.find(
    ({createdBy}) => createdBy === playerId
  )
  if (currentDefinition) {
    currentDefinition.definition = definition
  } else {
    game.definitions.push({
      id: uuidv4(),
      definition,
      createdBy: playerId,
    })
  }
  if (ready) {
    game.players.find(({id}) => id === playerId).isReady = true
    const allGhostwritersAreReady =
      game.players.filter(
        ({id, isReady}) => id !== game.talkmasterId && isReady
      ).length ===
      game.players.length - 1
    return allGhostwritersAreReady
  }
}
const submitVote = (definitionId, playerId, game, ready) => {
  const player = game.players.find(({id}) => id === playerId)
  player.voteId = definitionId
  if (ready) {
    player.isReady = true
  }
}
const startPresentPhase = (game) => {
  game.phase = 'present'
  game.currentPresentedGhostwriterIndex = -1
}
const getGhostwriters = (game) => {
  return game.players.filter(({id}) => id !== game.talkmasterId)
}
const getGameDefinition = (game) => {
  return game.definitions.find(({createdBy}) => createdBy === 'game')
}
const distributePointsForGameDefinition = (game) => {
  const gameDefinition = getGameDefinition(game)
  const playersWhoVotedForGameDefinition = game.players.filter(
    ({voteId}) => voteId === gameDefinition.id
  )
  playersWhoVotedForGameDefinition.forEach((player) => {
    player.points += 5
  })
  const playersWhoVotedForGameDefinitionUpdates =
    playersWhoVotedForGameDefinition.map(({id, points, voteId}) => ({
      id,
      points,
      voteId,
    }))
  return {
    definition: gameDefinition,
    players: playersWhoVotedForGameDefinitionUpdates,
  }
}
const distributePointsForGhostwriterDefinition = (game) => {
  const ghostwriters = getGhostwriters(game)
  const currentPresentedGhostwriter =
    ghostwriters[game.currentPresentedGhostwriterIndex]
  const presentedGhostwriterDefinition = game.definitions.find(
    ({createdBy}) => createdBy === currentPresentedGhostwriter.id
  )
  const playersWhoVotedForCurrentDefinition = game.players.filter(
    ({voteId}) => voteId === presentedGhostwriterDefinition.id
  )
  playersWhoVotedForCurrentDefinition.forEach(() => {
    currentPresentedGhostwriter.points += 10
  })
  const playersWhoVotedForCurrentDefinitionUpdates =
    playersWhoVotedForCurrentDefinition.map(({id, voteId}) => ({
      id,
      voteId,
    }))
  return {
    definition: presentedGhostwriterDefinition,
    players: [...playersWhoVotedForCurrentDefinitionUpdates],
  }
}
const presentNextPlayer = (game) => {
  game.currentPresentedGhostwriterIndex += 1
  const ghostwriters = getGhostwriters(game)
  const isGameDefinition =
    game.currentPresentedGhostwriterIndex === ghostwriters.length
  if (isGameDefinition) {
    return distributePointsForGameDefinition(game)
  } else {
    return distributePointsForGhostwriterDefinition(game)
  }
}
const setVotePhaseEndTimer = (game) => {
  game.timerStart = new Date().getTime()
  return game.timerStart
}
const unready = (playerId, game) => {
  const readyPlayer = game.players.find(({id}) => id === playerId)
  readyPlayer.isReady = false
}
const startVotePhase = (game) => {
  game.players
    .filter(({id}) => id !== game.talkmasterId)
    .forEach((player) => {
      const definition = game.definitions.find(
        ({createdBy}) => createdBy === player.id
      )
      !definition &&
        game.definitions.push({
          id: uuidv4(),
          definition: defaultDefinition,
          createdBy: player.id,
        })
    })
  game.definitions = shuffle(game.definitions)
  game.phase = 'vote'
  game.players
    .filter(({id}) => id !== game.talkmasterId)
    .forEach((player) => (player.isReady = false))
}
const startScoreboardPhase = (game) => {
  game.phase = 'scoreboard'
}

module.exports = {
  initGame,
  startDefinePhase,
  submitDefinition,
  unready,
  startVotePhase,
  startPresentPhase,
  presentNextPlayer,
  getGhostwriters,
  submitVote,
  setVotePhaseEndTimer,
  getNumOfUnreadyPlayers,
  startScoreboardPhase,
  initGameSettings,
}
