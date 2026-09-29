/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js", "**/__tests__/**/*.test.js"],
  // No transform needed — tests are plain CommonJS / JSDOM
};
