'use strict';

const CanvasViewer = require('./canvasviewer.js');
const terrain = require('./terrain.js');
const Monster = require('./monster.js');

const database = require('./database.js');
const world = require('./world.js');
const newgame = require('./newgame.js');
const {makeElement, makeSpan, removeAllChildren} = require('./htmlutil.js');
const {ActiveEventHandler, blockedEventHandler} = require('./event-handler.js');
const {colorFromFraction} = require('./imgutil.js');
const assert = require('./assert.js');

class Message {
  constructor(message, color, hp) {
    this.message = message;
    this.color = color;
    this.repeat = 1;
    this.hp = hp;
  }

  makeElement() {
    const div = makeElement('div', 'message-span', this.message, this.color);
    if (this.repeat > 1) {
      const span2 = makeSpan(null, ` [${this.repeat}x]`, 'white');
      div.appendChild(span2);
    }
    if (this.hp !== 0) {
      const span2 = makeSpan(null, ` (${this.hp} HP)`, 'yellow');
      div.appendChild(span2);
    }
    return div;
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
      return {
        hp: player.getHp(),
        maxHp: player.monsterType.maxHp,
        dead: player.dead,
        depth: player.y,
        maxDepth: player.monsterType.maxDepth,
        airPercentage: world.airPercentage()
      };
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

  addSpan(...args) {
    this.statusArea.appendChild(makeSpan(...args));
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
    const hpColor = colorFromFraction(state.hp/state.maxHp);
    this.addSpan('status-span', `HP: ${state.hp}/${state.maxHp}`, hpColor);
    const depthColor = (state.depth <= state.maxDepth) ? '#00ff00' : '#ff0000';
    this.addSpan('status-span', `Depth: ${state.depth}/${state.maxDepth}`, depthColor);
    this.addSpan('status-span', `Air: ${state.airPercentage}%`, colorFromFraction(state.airPercentage/100));
    if (state.dead) {
      this.addSpan('status-span', 'Dead', '#ff0000');
    }
  }
}

class UserInterface {
  constructor(gameViewer, messageArea, statusArea) {
    this.gameViewer = gameViewer;
    this.messageArea = messageArea;
    this.statusArea = new StatusArea(statusArea);
    this.lastMessage = null;
    messageArea.addEventListener('click', ()=>this.clearMessageArea());
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
    this.eventHandlers = [new ActiveEventHandler(this)];
    this.animation = null;
    const dpi = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.dpi = dpi;
    this.tileSize = 8*Math.round(dpi*5);
    this.ui = world.ui = new UserInterface(this, messageArea, statusArea);
    document.addEventListener('keydown', (evt) => this.eventHandler().onkeydown(evt), false);
    canvas.addEventListener('click', (evt) => this.eventHandler().onclick(evt), false);
  }

  eventHandler() { return this.eventHandlers[this.eventHandlers.length-1]; }

  isBlocked() {
    return !this.eventHandler().isActive() || !world.player || world.player.dead;
  }

  async handlePromise(promise) {
    this.eventHandlers.push(blockedEventHandler);
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
      assert(this.eventHandlers.pop() === blockedEventHandler);
      this.redraw();
    }
  }

  playerMove(dx, dy) {
    if (world.player && !world.player.dead) {
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
