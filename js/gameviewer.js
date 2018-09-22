'use strict';

const CanvasViewer = require('./canvasviewer.js');
const terrain = require('./terrain.js');
const Monster = require('./monster.js');

const database = require('./database.js');
const world = require('./world.js');
const newgame = require('./newgame.js');

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
    const span = document.createElement('span');
    span.className = 'message-span';
    span.style.color = this.color;
    span.appendChild(document.createTextNode(this.message));
    if (this.repeat > 1) {
      const span2 = document.createElement('span');
      span2.style.color = 'white';
      span2.appendChild(document.createTextNode(` [${this.repeat}x]`));
      span.appendChild(span2);
    }
    if (this.hp !== 0) {
      const span2 = document.createElement('span');
      span2.style.color = 'yellow';
      span2.appendChild(document.createTextNode(` (${this.hp} HP)`));
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

class UserInterface {
  constructor(gameViewer, messageArea) {
    this.gameViewer = gameViewer;
    this.messageArea = messageArea;
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
     let last;
     while ((last = this.messageArea.lastChild)) {
       this.messageArea.removeChild(last);
     }
     this.lastMessage = null;
  }
}

class GameViewer extends CanvasViewer {
  constructor(canvas, messageArea) {
    super(canvas);
    this.blocked = false;
    this.animation = null;
    const dpi = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.dpi = dpi;
    this.tileSize = 8*Math.round(dpi*5);
    this.ui = world.ui = new UserInterface(this, messageArea);
    document.addEventListener('keydown', (evt) => this.onkeydown(evt), false);
    canvas.addEventListener('click', (evt) => this.onclick(evt), false);
  }

  async handlePromise(promise) {
    this.blocked = true;
    try {
      await promise;
      await world.runSchedule();
      await world.saveGame();
    } catch (err) {
      console.error(err);
    } finally {
      this.blocked = false;
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
    if (!this.blocked) {
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

    if (animationObject === player) {
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
    ctx.restore();
  }
}

module.exports = GameViewer;
