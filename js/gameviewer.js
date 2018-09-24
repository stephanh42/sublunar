'use strict';

const CanvasViewer = require('./canvasviewer.js');
const terrain = require('./terrain.js');
const Monster = require('./monster.js');

const database = require('./database.js');
const world = require('./world.js');
const newgame = require('./newgame.js');
const {makeSpan, removeAllChildren} = require('./htmlutil.js');

const keyToDirection = {
  "h": [-1, 0],
  "j": [0, 1],
  "k": [0, -1],
  "l": [1, 0],
  "ArrowLeft": [-1, 0],
  "ArrowRight": [1, 0],
  "ArrowUp": [0, -1],
  "ArrowDown": [0, 1],
  // non-standard Edge names
  "Left": [-1, 0],
  "Right": [1, 0],
  "Up": [0, -1],
  "Down": [0, 1],
  "b": [-1, 1],
  "n": [1, 1],
  "y": [-1, -1],
  "u": [1, -1],

  "1": [-1, -1],
  "2": [0, -1],
  "3": [1, -1],
  "4": [-1, 0],
  "6": [1, 0],
  "7": [-1, 1],
  "8": [0, 1],
  "9": [1, 1]
};

class Message {
  constructor(message, color, hp) {
    this.message = message;
    this.color = color;
    this.repeat = 1;
    this.hp = hp;
  }

  makeElement() {
    const span = makeSpan('message-span', this.message, this.color);
    if (this.repeat > 1) {
      const span2 = makeSpan(null, ` [${this.repeat}x]`, 'white');
      span.appendChild(span2);
    }
    if (this.hp !== 0) {
      const span2 = makeSpan(null, ` (${this.hp} HP)`, 'yellow');
      span.appendChild(span2);
    }
    return span;
  }
 
  tryCombine(otherMessage) {
    if (!otherMessage) {
      return false;
    }
    if ((this.message === otherMessage.message) &&
      (this.color === otherMessage.color)) {
      this.repeat += otherMessage.repeat;
      this.hp += otherMessage.hp;
      return true;
    } else {
      return false;
    }
  }
}

class StatusArea {
  constructor(statusArea) {
    this.statusArea = statusArea;
    this.state = null;
  }

  static getState() {
    const player = world.player;
    if (player) {
      return {hp: player.getHp(), maxHp: player.monsterType.maxHp};
    } else {
      return null;
    }
  }

  static isStateEqual(state1, state2) {
    if (state1 === state2) {
      return true;
    }
    if ((state1 === null) || (state2 === null)) {
      return false;
    }
    for (const [k, v] of Object.entries(state2)) {
      if (state1[k] !== v) {
        return false;
      }
    }
    return true;
  }

  update() {
    const state = StatusArea.getState();
    if (StatusArea.isStateEqual(this.state, state)) {
      return;
    }
    this.state = state;
    const statusArea = this.statusArea;
    removeAllChildren(statusArea);
    if (state === null) {
      return;
    }
    statusArea.appendChild(makeSpan(null, `HP: ${state.hp}/${state.maxHp}`, 'white'));
  }
}

class UserInterface {
  constructor(gameViewer, messageArea, statusArea) {
    this.gameViewer = gameViewer;
    this.messageArea = messageArea;
    this.statusArea = new StatusArea(statusArea);
    this.lastMessage = null;
  }

  redraw() {
    return this.gameViewer.redraw();
  }

  async animate(animation) { 
    const gameViewer = this.gameViewer;
    gameViewer.animation = animation;
    const t = await gameViewer.animateUntil(animation.endTime());
    gameViewer.animation = null;
    return t;
  }

  now() {
    return performance.now();
  }

  message(message, color='white', hp=0) {
    const msg = new Message(message, color, hp);
    if (msg.tryCombine(this.lastMessage)) {
      this.messageArea.removeChild(this.messageArea.lastChild);
    }
    this.messageArea.appendChild(msg.makeElement());
    this.lastMessage = msg;
  }

  clearMessageArea() {
    removeAllChildren(this.messageArea);
    this.lastMessage = null;
  }

  updateStatusArea() {
    this.statusArea.update();
  }
}

class GameViewer extends CanvasViewer {
  constructor(canvas, messageArea, statusArea) {
    super(canvas);
    this.blocked = false;
    this.animation = null;
    const dpi = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.dpi = dpi;
    this.tileSize = 8*Math.round(dpi*5);
    this.ui = world.ui = new UserInterface(this, messageArea, statusArea);
    document.addEventListener('keydown', (evt) => this.onkeydown(evt), false);
    canvas.addEventListener('click', (evt) => this.onclick(evt), false);
  }

  isBlocked() {
    return this.blocked || !world.player || world.player.dead; 
  }

  async handlePromise(promise) {
    this.blocked = true;
    try {
      await promise;
      await world.runSchedule();
      performance.mark('saveGame-start');
      await world.saveGame();
      performance.mark('saveGame-end');
      performance.measure('saveGame', 'saveGame-start', 'saveGame-end');
    } catch (err) {
      console.error(err);
    } finally {
      this.blocked = false;
      this.redraw();
    }
  }

  onkeydown(evt) {
    const direction = keyToDirection[evt.key];
    if (direction) {
      const [dx, dy] = direction;
      this.playerMove(dx, dy);
    } else if (evt.key === '+') {
      this.tileSize = Math.min(96, this.tileSize + 8);
      this.redraw();
    } else if (evt.key === '-') {
      this.tileSize = Math.max(32, this.tileSize - 8);
      this.redraw();
    }
  }

  onclick(evt) {
    const [x, y] = this.getMousePos(evt);

    const tileSize = this.tileSize;
    const borderSize = 2;
    const fullTileSize = tileSize + borderSize;
    const canvas = this.canvas;

    const cx = (canvas.width - fullTileSize) >> 1;
    const cy = (canvas.height - fullTileSize) >> 1;

    const tileX = Math.floor((x - cx)/fullTileSize);
    const tileY = Math.floor((y - cy)/fullTileSize);
    if ((Math.abs(tileX) <= 1) && (Math.abs(tileY) <= 1) && ((tileX !== 0) || (tileY !== 0))) {
      this.playerMove(tileX, tileY);
    }
  }

  playerMove(dx, dy) {
    if (!this.isBlocked()) {
      this.ui.clearMessageArea();
      return this.handlePromise(world.tryPlayerMove(dx, dy));
    }
  }

  async load() {
    const dbPromise = database.openDatabase();
    const p1 = terrain.loadImages();
    const p2 = Monster.loadImages();
    world.database = await dbPromise;
    let msg;
    if (await world.tryLoadGame()) {
      msg = 'Game restored.';
    } else {
      msg = 'Starting a new game.';
      newgame();
      await world.saveGame({clearAll: true});
    }
    await p1; await p2;
    this.ui.updateStatusArea();
    this.ui.clearMessageArea();
    this.ui.message(msg, 'yellow');
  }

  draw(time) {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const player = world.player;
    if (!player || !player.isPlaced) {
      return;
    }

    const animation = this.animation;

    const px = player.x;
    const py = player.y;

    const tileSize = this.tileSize;
    const borderSize = 2;
    const fullTileSize = tileSize + borderSize;

    let cx = (width - fullTileSize) >> 1;
    let cy = (height - fullTileSize) >> 1;
    const animationObject = animation && animation.gameObject;

    if ((animationObject === player) && animation.animatePlayer) {
      const state = animation.getState(time);
      cx -= Math.round((state.x - px) * fullTileSize);
      cy -= Math.round((state.y - py) * fullTileSize);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

    for (let iy = Math.floor(-cy/fullTileSize); iy < Math.ceil((height-cy)/fullTileSize); iy++) {
      for (let ix = Math.floor(-cx/fullTileSize); ix < Math.ceil((width-cx)/fullTileSize); ix++) {
        const wx = ix + px;
        const wy = iy + py;
        const isVisible = world.isVisible(wx, wy);
        let anythingShown = false;
	const terrain = world.getRememberedTerrain(wx, wy);
	const imgs = terrain.images;
        if (imgs) {
          ctx.drawImage(imgs.get(tileSize), ix*fullTileSize, iy*fullTileSize);
          anythingShown = true;
	}
        if (isVisible) {
          for (const gameObject  of world.getGameObjects(wx, wy)) {
            if (gameObject !== animationObject) {
              gameObject.draw(ctx, ix*fullTileSize, iy*fullTileSize, tileSize);
            }
          }
        }
        if (!isVisible && anythingShown) {
          ctx.fillRect(ix*fullTileSize, iy*fullTileSize, tileSize, tileSize);
        }
      }
    }
    if (animationObject) {
      const state = animation.getState(time);
      const mx = Math.round((state.x - px) * fullTileSize);
      const my = Math.round((state.y - py) * fullTileSize);
      const opacity = state.opacity;
      if (opacity === 1) {
        animationObject.draw(ctx, mx, my, tileSize);
      } else if (opacity > 0) {
        ctx.globalAlpha = opacity;
        animationObject.draw(ctx, mx, my, tileSize);
        ctx.globalAlpha = 1;
      }
    }
    if (!this.isBlocked()) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.rect(-0.5, -0.5, tileSize+1, tileSize+1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

module.exports = GameViewer;
