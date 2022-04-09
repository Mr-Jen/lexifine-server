const { v4: uuidv4 } = require('uuid');

let lobbies = []

const addTimeoutToLobby = (lobby, timeout) => {
    lobby.timeouts.push(timeout)
}

const createLobby =  (covername, socketId) => {
    const lobbyId = uuidv4();
    
    const newLobby = { 
        id: lobbyId,
        hostId: socketId,
        timeouts: [],
        pendingLeaves: [],
        players: [
            {
                id: socketId,
                covername: covername
            }
        ]
    }

    lobbies.push(newLobby);

    return lobbyId;
}

const joinLobby = (covername, lobbyId, socketId) => {
    const lobby = findLobbyByLobbyId(lobbyId)
    lobby.players.push({
        id: socketId,
        covername: covername
    })

    return lobby;
}

const leaveLobby = (lobby, playerId) => {
    lobby.players = lobby.players.filter(({id}) => id !== playerId)
    if(lobby.players.length === 0){
        lobbies = lobbies.filter(({id}) => id !== lobby.id)
        return
    }
    if(lobby.hostId === playerId){
        lobby.hostId = lobby.players[0].id
    }
    return lobby   
}

const isIngame = (lobby, playerId) => {
    if (!lobby.game) return false
    return lobby.game.players.find(({id}) => id === playerId)
}

const leaveGame = (lobby, playerId) => {
    const remainingLobby = leaveLobby(lobby, playerId)
    lobby.game.players = lobby.game.players.filter(({id}) => id !== playerId)
    lobby.pendingLeaves.filter(({id}) => id !== playerId)
    return remainingLobby
}

const addToPendingLeaves = (lobby, playerId) => {
    lobby.pendingLeaves.push(playerId)
}


// Helper functions
const findLobbyByLobbyId = (lobbyId) => {
    return lobbies.find(({id}) => id === lobbyId)
}

const findLobbyByPlayerId = playerId => {
    return lobbies.find(
        ({players}) => 
            players.find(
                ({id}) => id === playerId))
}

const clearAllLobbyTimeouts = lobby => {
    lobby.timeouts.forEach(timeout => {
        clearTimeout(timeout)
    })
}

module.exports =  {
    createLobby,
    joinLobby,
    leaveLobby,
    leaveGame,
    addToPendingLeaves,
    findLobbyByLobbyId,
    findLobbyByPlayerId,
    isIngame,
    addTimeoutToLobby,
    clearAllLobbyTimeouts
}