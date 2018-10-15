'use strict';

const world = require('./world.js');

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
  getSelected() {
    return null;
  }

  isActive() {
    return false;
  }

  onkeydown() {}
  onclick() {}
}

class ViewerEventHandler extends BlockedEventHandler {
  constructor(canvasViewer) {
    super();
    this.canvasViewer = canvasViewer;
  }

  isActive() {
    return true;
  }

  getRelativeTile(evt) {
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

    return [tileX, tileY];
  }

  getWorldTile(evt) {
    const player = world.player;
    if (!player) {
      return null;
    }
    const [x, y] = this.getRelativeTile(evt);
    return [x + player.x, y + player.y];
  }
}

/* Event handler which processes user commands. */
class ActiveEventHandler extends ViewerEventHandler {
  getSelected() {
    const player = world.player;
    if (player) {
      return [player.x, player.y];
    } else {
      return null;
    }
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
    } else if (evt.key === 't') {
      canvasViewer.handlePromise(() => canvasViewer.playerTorpedo());
    }
  }

  onclick(evt) {
    const [tileX, tileY] = this.getRelativeTile(evt);
    if (
      Math.abs(tileX) <= 1 &&
      Math.abs(tileY) <= 1 &&
      (tileX !== 0 || tileY !== 0)
    ) {
      this.canvasViewer.playerMove(tileX, tileY);
    }
  }
}

class SelectionEventHandler extends ViewerEventHandler {
  constructor(canvasViewer, x, y, message) {
    super(canvasViewer);
    this.x = x;
    this.y = y;
    this.ui = canvasViewer.ui;
    this.resolve = null;
    this.resultPromise = new Promise(resolve => {
      this.resolve = resolve;
    });
    this.ui.clearMessageArea();
    this.ui.questionAreaMessage(message);
    this.ui.questionAreaMessage('Use direction keys to move.', 'yellow');
    this.ui.questionAreaMessage(
      'Press Enter or Space to select, Escape to abort.',
      'yellow'
    );
  }

  getSelected() {
    return [this.x, this.y];
  }

  onkeydown(evt) {
    const direction = keyToDirection[evt.key];
    if (direction) {
      const [dx, dy] = direction;
      this.x += dx;
      this.y += dy;
      this.canvasViewer.redraw();
    } else if (evt.key === 'Enter' || evt.key === ' ') {
      this.resolve([this.x, this.y]);
    } else if (evt.key === 'Escape') {
      this.resolve(null);
    }
  }

  onclick(evt) {
    this.resolve(this.getWorldTile(evt));
  }
}

exports.blockedEventHandler = new BlockedEventHandler();
exports.ActiveEventHandler = ActiveEventHandler;
exports.SelectionEventHandler = SelectionEventHandler;
