const {
  MAX_TOOL_RESULT_CHARS,
} = require("./assistant.constants");

const TRUNCATION_NOTICE =
  "El resultado de la herramienta fue truncado para respetar el límite de tamaño.";

function serializeResult(result) {
  const serialized = JSON.stringify(result);

  if (typeof serialized !== "string") {
    throw new TypeError(
      "Assistant tool results must be JSON serializable"
    );
  }

  return serialized;
}

function createTruncatedResult(preview) {
  return JSON.stringify({
    truncated: true,
    notice: TRUNCATION_NOTICE,
    preview,
  });
}

function serializeAssistantToolResult(result) {
  const serialized = serializeResult(result);

  if (serialized.length <= MAX_TOOL_RESULT_CHARS) {
    return serialized;
  }

  const characters = Array.from(serialized);
  let lowerBound = 0;
  let upperBound = characters.length;
  let bestResult = createTruncatedResult("");

  while (lowerBound <= upperBound) {
    const previewLength = Math.floor(
      (lowerBound + upperBound) / 2
    );
    const preview = characters
      .slice(0, previewLength)
      .join("");
    const candidate = createTruncatedResult(preview);

    if (candidate.length <= MAX_TOOL_RESULT_CHARS) {
      bestResult = candidate;
      lowerBound = previewLength + 1;
    } else {
      upperBound = previewLength - 1;
    }
  }

  if (bestResult.length > MAX_TOOL_RESULT_CHARS) {
    throw new Error(
      "Assistant tool result truncation exceeded its configured limit"
    );
  }

  return bestResult;
}

module.exports = {
  serializeAssistantToolResult,
  TRUNCATION_NOTICE,
};
