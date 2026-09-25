const crypto = require("node:crypto");

const env = require("../../config/env");

function getEncryptionKey() {
  const configuredKey = env.youtube.tokenEncryptionKey;
  const key = /^[A-Fa-f0-9]{64}$/.test(configuredKey)
    ? Buffer.from(configuredKey, "hex")
    : Buffer.from(configuredKey, "base64");

  if (key.length !== 32) {
    throw new Error("Invalid YouTube token encryption key");
  }

  return key;
}

function encryptRefreshToken(refreshToken) {
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length === 0
  ) {
    throw new Error("Invalid YouTube refresh token");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptRefreshToken(encryptedToken) {
  if (
    typeof encryptedToken !== "string"
  ) {
    throw new Error("Invalid encrypted YouTube token");
  }

  const [version, ivValue, authTagValue, ciphertextValue] =
    encryptedToken.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !authTagValue ||
    !ciphertextValue
  ) {
    throw new Error("Invalid encrypted YouTube token");
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(
      Buffer.from(authTagValue, "base64url")
    );

    return Buffer.concat([
      decipher.update(
        Buffer.from(ciphertextValue, "base64url")
      ),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt YouTube token");
  }
}

module.exports = {
  encryptRefreshToken,
  decryptRefreshToken,
};
