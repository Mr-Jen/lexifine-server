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

module.exports =  {
    createLobby
}