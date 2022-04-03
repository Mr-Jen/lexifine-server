const { v4: uuidv4 } = require("uuid");
const { shuffle } = require("../helpers/shuffle.js");

const initGameSettings = {
    roundSettings: {
        max: 3,
        definitionPhaseDuration: 13.5 * 1000,
        votePhaseEndDuration: 15 * 1000,
        scoreboardPhaseDuration: 15 * 1000
    },
};

const defaultDefinition =
    "Ich war Gassi gehen und habe keine Definition abgegeben";

const initGame = (lobby) => {
    lobby.game = {
        ...initGameSettings,
        currentRound: 0,
        players: lobby.players.map(({ id }) => ({
            id,
            points: 0,
        })),
    };
    return initGameSettings;
};

const startDefinePhase = (game) => {
    game.phase = "define";
    game.timerStart = new Date().getTime();
    game.currentRound += 1;
    game.termToDefine = "Holzofen";
    game.definitions = [
        {
            id: uuidv4(),
            definition: "Dies ist die richtige Definition",
            createdBy: "game",
        },
    ];
    if (game.talkmasterId) {
        const talkmasterIndex = game.players.findIndex(
            ({ id }) => id === talkmasterId
        );
        game.talkmasterId = game.players[talkmasterIndex + 1].id;
    } else {
        game.talkmasterId = game.players[0].id;
    }
    game.players
        .filter(({ id }) => id !== game.talkmasterId)
        .forEach((player) => (player.isReady = false));

    return {
        timerStart: game.timerStart,
        talkmasterId: game.talkmasterId,
        termToDefine: game.termToDefine,
    };
};

const submitDefinition = (playerId, definition, game) => {
    const currentDefinition = game.definitions.find(
        ({ createdBy }) => createdBy === playerId
    );
    if (currentDefinition) {
        currentDefinition.definition = definition;
    } else {
        game.definitions.push({
            id: uuidv4(),
            definition,
            createdBy: playerId,
        });
    }
    game.players.find(({ id }) => id === playerId).isReady = true;
    console.log("Game after submiting defintion: ", game);
    const allGhostwritersAreReady =
        game.players.filter(
            ({ id, isReady }) => id !== game.talkmasterId && isReady
        ).length ===
        game.players.length - 1;
    return allGhostwritersAreReady;
};

const submitVote = (definitionId, playerId, game) => {
    const player = game.players.find(({ id }) => id === playerId);
    player.voteId = definitionId;
    player.isReady = true;
    const allButOneGhostwriterReady =
        game.players.filter(
            ({ id, isReady }) => id !== game.stalkmasterId && isReady
        ).length === game.players.length - 2;
    return allButOneGhostwriterReady
};

const setVotePhaseEndTimer = (game) => {
    game.timerStart = new Date().getTime()
    return game.timerStart
}

const unready = (playerId, game) => {
    console.log("Inside unready serverside");
    const readyPlayer = game.players.find(({ id }) => id === playerId);
    readyPlayer.isReady = false;
};

const startVotePhase = (game) => {
    game.players
        .filter(({ id }) => id !== game.talkmasterId)
        .forEach((player) => {
            const definition = game.definitions.find(
                ({ createdBy }) => createdBy === player.id
            );
            !definition &&
                game.definitions.push({
                    id: uuidv4(),
                    definition: defaultDefinition,
                    createdBy: player.id,
                });
        });
    game.definitions = shuffle(game.definitions);
    game.phase = "vote";
    game.players
        .filter(({ id }) => id !== game.talkmasterId)
        .forEach((player) => (player.isReady = false));
    console.log("Game in StartVotePhase: ", game);
};

module.exports = {
    initGame,
    startDefinePhase,
    submitDefinition,
    unready,
    startVotePhase,
    submitVote,
    setVotePhaseEndTimer,
    initGameSettings,
};
