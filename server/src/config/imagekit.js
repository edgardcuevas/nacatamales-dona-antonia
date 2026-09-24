const { ImageKit } = require("@imagekit/nodejs");

const env = require("./env");

const client = new ImageKit({
  privateKey: env.imagekit.privateKey,
  timeout: 15_000,
  maxRetries: 2,
  logLevel: "off",
});

const imagekitAdapter = {
  getAuthenticationParameters(token, expire) {
    return client.helper.getAuthenticationParameters(
      token,
      expire
    );
  },

  getFile(fileId) {
    return client.files.get(fileId);
  },

  deleteFile(fileId) {
    return client.files.delete(fileId);
  },
};

module.exports = imagekitAdapter;
