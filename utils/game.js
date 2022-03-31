initGameSettings = {
    roundSettings: {
      max: 3,
      definitionPhaseDuration: 90,
    }
}

const initGame = (lobby) => {
  lobby.game = {
    ...initGameSettings,
    currentRound: 0,
    players: lobby.players.map(({id}) => ({
      id,
      points: 0
    }))
  }
  return initGameSettings
}

module.exports = {
  initGame
}