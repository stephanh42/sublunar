'use strict';

const keyToDirection = {
  h: [-1, 0],
  j: [0, 1],
  k: [0, -1],
  l: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  // non-standard Edge names
  Left: [-1, 0],
  Right: [1, 0],
  Up: [0, -1],
  Down: [0, 1],
  b: [-1, 1],
  n: [1, 1],
  y: [-1, -1],
  u: [1, -1],

  '1': [-1, -1],
  '2': [0, -1],
  '3': [1, -1],
  '4': [-1, 0],
  '6': [1, 0],
  '7': [-1, 1],
  '8': [0, 1],
  '9': [1, 1]
};

class BlockedEventHandler {
  isActive() {
    return false;
  }

  onkeydown() {}
  onclick() {}
}

class ActiveEventHandler {
  constructor(canvasViewer) {
    this.canvasViewer = canvasViewer;
  }

  isActive() {
    return true;
  }

  onkeydown(evt) {
    const direction = keyToDirection[evt.key];
    const canvasViewer = this.canvasViewer;
    if (direction) {
      const [dx, dy] = direction;
      canvasViewer.playerMove(dx, dy);
    } else if (evt.key === '+') {
      canvasViewer.tileSize = Math.min(96, canvasViewer.tileSize + 8);
      canvasViewer.redraw();
    } else if (evt.key === '-') {
      canvasViewer.tileSize = Math.max(32, canvasViewer.tileSize - 8);
      canvasViewer.redraw();
    }
  }

  onclick(evt) {
    const canvasViewer = this.canvasViewer;
    const [x, y] = canvasViewer.getMousePos(evt);

    const tileSize = canvasViewer.tileSize;
    const borderSize = 2;
    const fullTileSize = tileSize + borderSize;
    const canvas = canvasViewer.canvas;

    const cx = (canvas.width - fullTileSize) >> 1;
    const cy = (canvas.height - fullTileSize) >> 1;

    const tileX = Math.floor((x - cx) / fullTileSize);
    const tileY = Math.floor((y - cy) / fullTileSize);
    if (
      Math.abs(tileX) <= 1 &&
      Math.abs(tileY) <= 1 &&
      (tileX !== 0 || tileY !== 0)
    ) {
      canvasViewer.playerMove(tileX, tileY);
    }
  }
}

exports.blockedEventHandler = new BlockedEventHandler();
exports.ActiveEventHandler = ActiveEventHandler;
