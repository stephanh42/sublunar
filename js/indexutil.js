'use strict';

const xyMask = (1 << 16) - 1;

const angleToXY = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
];

const getIdFromXY = (x, y) => (x << 16) | (y & xyMask);

const idToAngle = new Map();
for (let i = 0; i < angleToXY.length; i++) {
  const [x, y] = angleToXY[i];
  idToAngle.set(getIdFromXY(x, y), i);
}

exports.getIdFromXY = getIdFromXY;
exports.getXFromId = xy => xy >> 16;
exports.getYFromId = xy => (xy << 16) >> 16;
exports.angleToXY = angleToXY;
exports.getAngleFromXY = (x, y) => idToAngle.get(getIdFromXY(x, y));
