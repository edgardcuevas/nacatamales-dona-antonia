const {
  MAX_MESSAGES_PER_CONVERSATION,
} = require("./assistant.constants");

// Se guardan 100 mensajes por conversacion. El intento numero 101 se
// rechaza antes de llamar al proveedor, asi que no cuesta tokens ni
// deja un turno del usuario sin respuesta.
function isConversationFull(messageCount) {
  return (
    Number(messageCount) >=
    MAX_MESSAGES_PER_CONVERSATION
  );
}

module.exports = {
  isConversationFull,
};
