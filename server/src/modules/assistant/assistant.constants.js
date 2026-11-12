const ASSISTANT_PROVIDERS = Object.freeze({
  GEMINI: "gemini",
  NVIDIA: "nvidia",
});

const ASSISTANT_PROVIDER_VALUES = Object.freeze([
  ASSISTANT_PROVIDERS.GEMINI,
  ASSISTANT_PROVIDERS.NVIDIA,
]);

// gemini-2.5-flash ya no esta disponible para cuentas nuevas: la API
// responde 404 NOT_FOUND. gemini-3.5-flash es el Flash vigente que
// responde con esta clave. Se puede cambiar con AI_MODEL.
const DEFAULT_ASSISTANT_MODEL = "gemini-3.5-flash";
const NVIDIA_MODEL_PATTERN =
  /^[A-Za-z0-9._/-]{1,120}$/;
const DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS = 60_000;
// Enfriar todo con el mismo numero castiga dos casos muy distintos: un 429 de
// cuota no se recupera antes de un minuto, pero un timeout o una caida si. El
// cooldown por codigo evita dejar el respaldo apagado 60 s por un corte de 2 s.
const PROVIDER_COOLDOWN_BY_CODE = Object.freeze({
  RATE_LIMITED: 60_000,
  TIMEOUT: 15_000,
  UNAVAILABLE: 15_000,
});
// Con todos los proveedores enfriando, una peticion puede sondear al que vence
// antes como maximo una vez por ventana. Sin sondeo, un fallo doble devuelve
// error instantaneo durante todo el cooldown aunque el proveedor ya se recupero.
const PROVIDER_PROBE_WINDOW_MS = 5_000;
const DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS = 1024;
const MIN_ASSISTANT_MAX_OUTPUT_TOKENS = 128;
const MAX_ASSISTANT_MAX_OUTPUT_TOKENS = 4096;
// El modelo de respaldo razona y esos tokens salen del mismo presupuesto de
// salida que el texto: con 1024 un prompt complejo puede devolver content
// vacio. NVIDIA tiene su propio tope para no subirle el limite a Gemini.
const DEFAULT_NVIDIA_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_ASSISTANT_TIMEOUT_MS = 30_000;
const MIN_ASSISTANT_TIMEOUT_MS = 5_000;
const MAX_ASSISTANT_TIMEOUT_MS = 60_000;
const MAX_TOOL_CALLS_PER_RESPONSE = 2;
const MAX_TOOL_ARGUMENT_CHARS = 2_000;
const MAX_TOOL_DECLARATIONS = 56;
const MAX_TOOL_EXECUTIONS_PER_MESSAGE = 2;
// Una ronda es una respuesta del modelo dentro del turno; un intento es una
// llamada real a un proveedor, y un failover consume dos. Antes ambos compartian
// el mismo techo, asi que un turno con herramienta que cruzaba el limite de
// Gemini a mitad se quedaba sin rondas y terminaba en error. Se separan: el
// failover no debe comerse una ronda de razonamiento.
const MAX_REASONING_ROUNDS = 3;
const MAX_PROVIDER_ATTEMPTS_PER_MESSAGE = 4;
// Una sola ronda de corrección: si el modelo vuelve a pedir algo inválido
// después de que se le explicó el error, la respuesta se corta.
const MAX_TOOL_MISUSE_CORRECTIONS = 1;
// Corta el día antes del 429 del proveedor. 0 desactiva el tope: es el
// interruptor para cuando se pase a un plan pago.
const DEFAULT_AI_DAILY_PROVIDER_CALLS = 120;
const MAX_AI_DAILY_PROVIDER_CALLS = 1_000_000;
const DEFAULT_AI_PRICE_PER_M = 0;
const MAX_AI_PRICE_PER_M = 10_000;
const MAX_TOOL_HANDLER_TIMEOUT_MS = 10_000;
const MAX_ASSISTANT_ANNOUNCEMENT_RESULTS = 20;
const MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS = 10;
// El mensaje de un aviso puede llegar a 10 000 caracteres. Se recorta antes
// del truncador generico para que el modelo vea el inicio completo y sepa
// que falta texto, en vez de recibir un JSON partido.
const MAX_ASSISTANT_ANNOUNCEMENT_CONTENT_CHARS = 2_000;
const MAX_ASSISTANT_VIDEO_RESULTS = 20;
const MAX_ASSISTANT_VIDEO_SEARCH_RESULTS = 10;
const MAX_ASSISTANT_CATEGORY_RESULTS = 20;
const MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS = 10;
const MAX_ASSISTANT_PRODUCT_RESULTS = 10;
const MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS = 20;
const MAX_ASSISTANT_PHOTO_RESULTS = 20;
const MAX_ASSISTANT_USER_RESULTS = 20;
const MAX_ASSISTANT_MEDIA_SEARCH_RESULTS = 10;
const MAX_ASSISTANT_MEDIA_LIST_RESULTS = 20;
const ASSISTANT_TEMPERATURE = 0.2;
// Los modelos Gemini 3 razonan antes de responder y esos tokens salen
// del presupuesto de salida: con 1024 el texto se cortaba en MAX_TOKENS.
// Este asistente responde sobre un catalogo fijo, no necesita pensar.
const ASSISTANT_THINKING_BUDGET = 0;

const MAX_CONVERSATIONS_PER_USER = 20;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const HISTORY_MESSAGE_LIMIT = 10;
const HISTORY_CHAR_LIMIT = 8_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_PROMPT_CHARS = 12_000;
const MAX_TOOL_RESULT_CHARS = 6_000;
const MAX_CONVERSATION_TITLE_LENGTH = 120;
const DEFAULT_CONVERSATION_LIST_LIMIT = 20;
const MAX_CONVERSATION_LIST_LIMIT = 20;
const DEFAULT_MESSAGE_LIST_LIMIT = 50;
const MAX_MESSAGE_LIST_LIMIT = 100;
const DEFAULT_USAGE_DAYS = 30;
const MAX_USAGE_DAYS = 365;

module.exports = {
  ASSISTANT_PROVIDERS,
  ASSISTANT_PROVIDER_VALUES,
  DEFAULT_ASSISTANT_MODEL,
  NVIDIA_MODEL_PATTERN,
  DEFAULT_ASSISTANT_PROVIDER_COOLDOWN_MS,
  PROVIDER_COOLDOWN_BY_CODE,
  PROVIDER_PROBE_WINDOW_MS,
  DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
  MIN_ASSISTANT_MAX_OUTPUT_TOKENS,
  MAX_ASSISTANT_MAX_OUTPUT_TOKENS,
  DEFAULT_NVIDIA_MAX_OUTPUT_TOKENS,
  DEFAULT_ASSISTANT_TIMEOUT_MS,
  MIN_ASSISTANT_TIMEOUT_MS,
  MAX_ASSISTANT_TIMEOUT_MS,
  MAX_TOOL_CALLS_PER_RESPONSE,
  MAX_TOOL_ARGUMENT_CHARS,
  MAX_TOOL_DECLARATIONS,
  MAX_TOOL_EXECUTIONS_PER_MESSAGE,
  MAX_REASONING_ROUNDS,
  MAX_PROVIDER_ATTEMPTS_PER_MESSAGE,
  MAX_TOOL_MISUSE_CORRECTIONS,
  DEFAULT_AI_DAILY_PROVIDER_CALLS,
  MAX_AI_DAILY_PROVIDER_CALLS,
  DEFAULT_AI_PRICE_PER_M,
  MAX_AI_PRICE_PER_M,
  MAX_TOOL_HANDLER_TIMEOUT_MS,
  MAX_ASSISTANT_ANNOUNCEMENT_RESULTS,
  MAX_ASSISTANT_ANNOUNCEMENT_SEARCH_RESULTS,
  MAX_ASSISTANT_ANNOUNCEMENT_CONTENT_CHARS,
  MAX_ASSISTANT_VIDEO_RESULTS,
  MAX_ASSISTANT_VIDEO_SEARCH_RESULTS,
  MAX_ASSISTANT_CATEGORY_SEARCH_RESULTS,
  MAX_ASSISTANT_CATEGORY_RESULTS,
  MAX_ASSISTANT_PRODUCT_RESULTS,
  MAX_ASSISTANT_CATEGORY_PRODUCT_RESULTS,
  MAX_ASSISTANT_PHOTO_RESULTS,
  MAX_ASSISTANT_USER_RESULTS,
  MAX_ASSISTANT_MEDIA_SEARCH_RESULTS,
  MAX_ASSISTANT_MEDIA_LIST_RESULTS,
  ASSISTANT_TEMPERATURE,
  ASSISTANT_THINKING_BUDGET,
  MAX_CONVERSATIONS_PER_USER,
  MAX_MESSAGES_PER_CONVERSATION,
  HISTORY_MESSAGE_LIMIT,
  HISTORY_CHAR_LIMIT,
  MAX_MESSAGE_LENGTH,
  MAX_PROMPT_CHARS,
  MAX_TOOL_RESULT_CHARS,
  MAX_CONVERSATION_TITLE_LENGTH,
  DEFAULT_CONVERSATION_LIST_LIMIT,
  MAX_CONVERSATION_LIST_LIMIT,
  DEFAULT_MESSAGE_LIST_LIMIT,
  MAX_MESSAGE_LIST_LIMIT,
  DEFAULT_USAGE_DAYS,
  MAX_USAGE_DAYS,
};
