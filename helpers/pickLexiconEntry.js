const pickLexiconEntry = definitions => {
    return definitions[Math.floor(Math.random() * definitions.length - 1)]
}

module.exports = {
    pickLexiconEntry,
}