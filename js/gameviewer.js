'use strict';

const CanvasViewer = require('./canvasviewer.js');
const UserInterface = require('./user-interface.js');
const terrain = require('./terrain.js');
const Monster = require('./monster.js');
const {GameObject} = require('./game-object.js');

const database = require('./database.js');
const world = require('./world.js');
const newgame = require('./newgame.js');
const {badColor} = require('./htmlutil.js');
const {ActiveEventHandler, blockedEventHandler} = require('./event-handler.js');
const assert = require('./assert.js');

class GameViewer extends CanvasViewer {
  constructor() {
    const canvas = document.getElementById('theCanvas');
    super(canvas);
    this.eventHandlers = [new ActiveEventHandler(this)];
    this.animation = null;
    const dpi = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.dpi = dpi;
    this.tileSize = 8 * Math.round(dpi * 5);
    this.ui = world.ui = new UserInterface(this);

    document.addEventListener(
      'keydown',
      evt => this.eventHandler().onkeydown(evt),
      false
    );
    canvas.addEventListener(
      'click',
      evt => this.eventHandler().onclick(evt),
      false
    );
  }

  eventHandler() {
    return this.eventHandlers[this.eventHandlers.length - 1];
  }

  isBlocked() {
    return (
      !this.eventHandler().isActive() || !world.player || world.player.dead
    );
  }

  handleError(err) {
    this.ui.message('There is an error in the code.', badColor);
    this.ui.message(err.message, 'yellow');
    console.error(err);
  }

  eatError(promise) {
    return promise.error(err => this.handleError(err));
  }

  /* This function handles a user action.
   * - Checks the player is still alive.
   * - Blocks input events.
   * - Reports errors when the promise is rejected.
   * - Saves the game.
   * - Redraws the screen.
   */
  async handlePromise(promiseFunc) {
    if (!world.player || world.player.dead) {
      return;
    }
    this.ui.clearMessageArea();
    this.eventHandlers.push(blockedEventHandler);
    try {
      await promiseFunc();
      await world.runSchedule();
      performance.mark('saveGame-start');
      await world.saveGame();
      performance.mark('saveGame-end');
      performance.measure('saveGame', 'saveGame-start', 'saveGame-end');
    } catch (err) {
      this.handleError(err);
    } finally {
      assert(this.eventHandlers.pop() === blockedEventHandler);
      this.redraw();
    }
  }

  playerMove(dx, dy) {
    return this.handlePromise(() => world.tryPlayerMove(dx, dy));
  }

  async playerTorpedo() {
    const pos = await this.ui.selectTile('Choose a target for your torpedo.');
    if (!pos) {
      return;
    }
    const [x, y] = pos;
    if (!world.isVisible(x, y)) {
      this.ui.message('You see no target there.');
      return;
    }
    const target = world.getMonster(x, y);
    const player = world.player;
    if (target === player) {
      this.ui.message('You cowardly refuse to torpedo yourself');
    } else if (!target) {
      this.ui.message('There appears to be nobody there.');
    } else {
      player.doTorpedo(target);
      return this.redraw();
    }
  }

  async load() {
    const dbPromise = database.openDatabase();
    const p1 = terrain.loadImages();
    const p2 = Monster.loadImages();
    const p3 = GameObject.loadImages();
    world.database = await dbPromise;
    let msg;
    if (await world.tryLoadGame()) {
      msg = 'Game restored.';
    } else {
      msg = 'Starting a new game.';
      newgame();
      await world.saveGame({clearAll: true});
    }
    await p1;
    await p2;
    await p3;
    this.ui.updateStatusArea();
    this.ui.clearMessageArea();
    this.ui.message(msg, 'yellow');
  }

  drawSelection(ctx, x, y) {
    const tileSize = this.tileSize;
    const borderSize = 2;
    const fullTileSize = tileSize + borderSize;

    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.rect(
      x * fullTileSize - 0.5,
      y * fullTileSize - 0.5,
      tileSize + 1,
      tileSize + 1
    );
    ctx.stroke();
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

    if (animationObject === player && animation.animatePlayer) {
      const state = animation.getState(time);
      cx -= Math.round((state.x - px) * fullTileSize);
      cy -= Math.round((state.y - py) * fullTileSize);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

    for (
      let iy = Math.floor(-cy / fullTileSize);
      iy < Math.ceil((height - cy) / fullTileSize);
      iy++
    ) {
      for (
        let ix = Math.floor(-cx / fullTileSize);
        ix < Math.ceil((width - cx) / fullTileSize);
        ix++
      ) {
        const wx = ix + px;
        const wy = iy + py;
        const isVisible = world.isVisible(wx, wy);
        let anythingShown = false;
        const terrain = world.getRememberedTerrain(wx, wy);
        const imgs = terrain.images;
        if (imgs) {
          ctx.drawImage(
            imgs.get(tileSize),
            ix * fullTileSize,
            iy * fullTileSize
          );
          anythingShown = true;
        }
        if (isVisible) {
          for (const gameObject of world.getGameObjects(wx, wy)) {
            if (gameObject !== animationObject) {
              gameObject.draw(
                ctx,
                ix * fullTileSize,
                iy * fullTileSize,
                tileSize
              );
            }
          }
        }
        if (!isVisible && anythingShown) {
          ctx.fillRect(
            ix * fullTileSize,
            iy * fullTileSize,
            tileSize,
            tileSize
          );
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
      const pos = this.eventHandler().getSelected();
      if (pos) {
        this.drawSelection(ctx, pos[0] - px, pos[1] - py);
      }
    }
    ctx.restore();
  }
}

module.exports = GameViewer;
