const { v4: uuidv4 } = require('uuid');

let lobbies = []

const createLobby =  (covername, socketId) => {
    const lobbyId = uuidv4();
    
    const newLobby = { 
        id: lobbyId,
        hostId: socketId,
        players: [
            {
                id: socketId,
                covername: covername
            }
        ]
    }

    lobbies.push(newLobby);
    console.log("CURRENT LOBBIES: ", lobbies)
    console.log(newLobby.players)

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

const leaveLobby = (playerId) => {
    const lobby = findLobbyByPlayerId(playerId)
    if (!lobby) return
    lobby.players = lobby.players.filter(({id}) => id !== playerId)
    if(lobby.players.length === 0){
        lobbies = lobbies.filter(({id}) => id !== lobby.id)
        console.log(lobbies)
        return
    }
    if(lobby.hostId === playerId){
        lobby.hostId = lobby.players[0].id
    }
    return lobby   
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

module.exports =  {
    createLobby,
    joinLobby,
    leaveLobby,
    findLobbyByLobbyId
}