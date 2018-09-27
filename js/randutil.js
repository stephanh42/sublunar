'use strict';

function randomInt(n) {
  return (Math.random() * n) | 0;
}

function randomStep(x = 0, y = 0) {
  switch (randomInt(4)) {
    case 0:
      x++;
      break;
    case 1:
      y++;
      break;
    case 2:
      x--;
      break;
    case 3:
      y--;
      break;
  }
  return [x, y];
}

function randomRange(lo, hi) {
  const n = hi - lo;
  const nhalf = n >> 1;
  return lo + randomInt(nhalf + 1) + randomInt(n - nhalf + 1);
}

exports.randomInt = randomInt;
exports.randomStep = randomStep;
exports.randomRange = randomRange;
