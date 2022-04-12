const pickLexiconEntry = definitions => {
    const definition = definitions[Math.round(Math.random() * (definitions.length - 1))]
    return definition
}

module.exports = {
    pickLexiconEntry,
}