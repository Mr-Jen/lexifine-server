const { v4: uuidv4 } = require('uuid');

const lobbies = []

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
    const lobby = findLobbyById(lobbyId)
    lobby.players.push({
        id: socketId,
        covername: covername
    })

    return lobby;
}

const findLobbyById = (lobbyId) => {
    return lobbies.find(({id}) => id === lobbyId)
}

module.exports =  {
    createLobby,
    joinLobby
}