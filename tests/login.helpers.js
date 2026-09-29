/**
 * Pure logic extracted verbatim from invaders.html for unit testing.
 * The functions here must stay in sync with the equivalents in invaders.html.
 */

"use strict";

const PLAYER_NAME_KEY = "galactic-defender-player";
const MAX_NAME_LEN = 12;

/**
 * Strip anything that isn't a letter, number, space, dash or underscore,
 * collapse whitespace, trim, slice to MAX_NAME_LEN, and upper-case.
 * Matches sanitizeName() in invaders.html exactly.
 */
function sanitizeName(raw) {
  return (raw || "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN)
    .toUpperCase();
}

/**
 * True while the event target is a text-entry element.
 * Matches isTypingTarget() in invaders.html exactly.
 */
function isTypingTarget(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

module.exports = {
  PLAYER_NAME_KEY,
  MAX_NAME_LEN,
  sanitizeName,
  isTypingTarget,
};
