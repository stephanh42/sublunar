'use strict';

const xyMask = (1<<16)-1;

exports.getIdFromXY = (x, y) => (x << 16) | (y & xyMask);
exports.getXFromId = xy => (xy >> 16);
exports.getYFromId = xy => ((xy << 16) >> 16);
