'use strict';

class AssertionError extends Error {
}

function assert(check, message='Invalid assertion') {
  if (!check) {
    throw new AssertionError(message);
  }
}

module.exports = assert;
