(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function lerp(s, x0, x1) {
  return (1 - s) * x0 + s * x1;
}

const identity = x => x;
const bump = x => 4 * x * (1 - x);

class State {
  constructor(time, x, y, opacity = 1) {
    this.time = time;
    this.x = x;
    this.y = y;
    this.opacity = opacity;
  }

  equals(other) {
    return (
      this.x === other.x && this.y === other.y && this.opacity === other.opacity
    );
  }

  interpolate(otherState, time, sfunc) {
    let s = (time - this.time) / (otherState.time - this.time);
    s = sfunc(Math.max(0, Math.min(1, s)));
    return new State(
      time,
      lerp(s, this.x, otherState.x),
      lerp(s, this.y, otherState.y),
      lerp(s, this.opacity, otherState.opacity)
    );
  }
}

class ObjectAnimation {
  constructor(
    gameObject,
    beginState,
    endState,
    {sfunc = identity, animatePlayer = true} = {}
  ) {
    this.gameObject = gameObject;
    this.beginState = beginState;
    this.endState = endState;
    this.sfunc = sfunc;
    this.animatePlayer = animatePlayer;
  }

  isTrivial() {
    return this.beginState.equals(this.endState);
  }

  getState(time) {
    return this.beginState.interpolate(this.endState, time, this.sfunc);
  }

  endTime() {
    return this.endState.time;
  }
}

exports.lerp = lerp;
exports.bump = bump;
exports.State = State;
exports.ObjectAnimation = ObjectAnimation;

},{}],2:[function(require,module,exports){
'use strict';

class AssertionError extends Error {}

function assert(check, message = 'Invalid assertion') {
  if (!check) {
    throw new AssertionError(message);
  }
}

module.exports = assert;

},{}],3:[function(require,module,exports){
'use strict';

class CanvasViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawPromise = null;
    // ensure load() is only started on next tick
    this.loadPromise = Promise.resolve().then(() => this.load());
    this.dpi = 1;
  }

  async load() {}

  redraw() {
    if (this.drawPromise === null) {
      this.drawPromise = this.loadPromise.then(
        () =>
          new Promise((resolve, reject) =>
            window.requestAnimationFrame(time => {
              this.drawPromise = null;
              try {
                this.basicDraw(time);
                resolve(time);
              } catch (exc) {
                reject(exc);
              }
            })
          )
      );
    }
    return this.drawPromise;
  }

  async animateUntil(time) {
    for (;;) {
      const t = await this.redraw();
      if (t >= time) {
        return t;
      }
    }
  }

  redrawOnWindowResize() {
    window.addEventListener('resize', () => this.redraw(), false);
  }

  basicDraw(time) {
    performance.mark('draw-start');
    const canvas = this.canvas;
    const width = (canvas.clientWidth * this.dpi) | 0;
    const height = (canvas.clientHeight * this.dpi) | 0;
    if (width !== canvas.width || height !== canvas.height) {
      canvas.width = width;
      canvas.height = height;
    }
    this.draw(time);
    performance.mark('draw-end');
    performance.measure('draw', 'draw-start', 'draw-end');
  }

  draw() {}

  getMousePos(evt) {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    return [
      ((evt.clientX - rect.left) / (rect.right - rect.left)) * canvas.width,
      ((evt.clientY - rect.top) / (rect.bottom - rect.top)) * canvas.height
    ];
  }
}

module.exports = CanvasViewer;

},{}],4:[function(require,module,exports){
'use strict';

const objectStores = ['game', 'game-objects', 'terrain', 'remembered-terrain'];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open('SublunarGameDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = event => resolve(event.target.result);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      for (const objectStore of objectStores) {
        db.createObjectStore(objectStore);
      }
    };
  });
}

exports.objectStores = objectStores;
exports.openDatabase = openDatabase;

},{}],5:[function(require,module,exports){
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
    } else {
      switch (evt.key) {
        case '+':
          canvasViewer.tileSize = Math.min(96, canvasViewer.tileSize + 8);
          canvasViewer.redraw();
          break;

        case '-':
          canvasViewer.tileSize = Math.max(32, canvasViewer.tileSize - 8);
          canvasViewer.redraw();
          break;

        case 't':
          canvasViewer.handlePromise(() => canvasViewer.playerTorpedo());
          break;

        case ',':
          canvasViewer.handlePromise(() => canvasViewer.playerPickup());
          break;
      }
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

},{"./world.js":25}],6:[function(require,module,exports){
'use strict';

const world = require('./world.js');
const pqueue = require('./pqueue.js');
const {getIdFromXY} = require('./indexutil.js');
const {registerClass} = require('./pickle.js');
const animation = require('./animation.js');
const assert = require('./assert.js');
const {loadImageSizes} = require('./imgutil.js');
const {awaitPromises} = require('./terrain.js');
const {aOrAn} = require('./textutil.js');

const objectTypes = {};
const objectTypeList = [];

function makeObjectType(id, json) {
  const result = {
    id: id,
    baseDelay: 6,
    intelligence: 10,
    hpRecovery: 1 / 24,
    maxDepth: Infinity,
    frequency: 0,
    meleeVerb: 'attacks',
    alive: false,
    isBlocking: true,
    kamikaze: false,
    torpedoRate: 0,
    drawAngled: false,
    moneyDrop: null,
    imageName: null,
    images: null
  };
  Object.assign(result, json);
  result.imageName = result.imageName || result.name;
  return result;
}

for (const json of require('./objecttype.js')) {
  const objectObj = makeObjectType(objectTypeList.length, json);
  objectTypeList.push(objectObj);
  objectTypes[objectObj.name] = objectObj;
}

class GameObject {
  constructor() {
    this.flags = 0;
    this.x = 0;
    this.y = 0;
  }

  getFlag(bit) {
    const mask = 1 << bit;
    return (this.flags & mask) === mask;
  }

  setFlag(bit, flag) {
    const mask = 1 << bit;
    this.flags = flag ? this.flags | mask : this.flags & ~mask;
  }

  getFlags(bit, length) {
    const mask = (1 << length) - 1;
    return (this.flags >> bit) & mask;
  }

  setFlags(bit, length, value) {
    const mask = (1 << length) - 1;
    this.flags = (this.flags & ~(mask << bit)) | ((value & mask) << bit);
  }

  get isPlaced() {
    return this.getFlag(0);
  }
  set isPlaced(flag) {
    this.setFlag(0, flag);
  }

  pickleData() {
    const json = {};
    if (this.flags) {
      json.flags = this.flags;
    }
    return json;
  }

  unpickleData(json) {
    this.flags = json.flags || 0;
  }

  postLoad() {}

  markDirty() {
    if (this.isPlaced) {
      world.dirtyGameObjects.add(getIdFromXY(this.x, this.y));
    }
  }

  updateIfPlayer() {
    if (this === world.player) {
      world.updateVisible();
      if (world.ui) {
        world.ui.updateStatusArea();
      }
    }
  }

  basicMove(x, y) {
    if (this.isPlaced) {
      this.markDirty();
      world.deleteGameObject(this.x, this.y, this);
    }
    this.x = x;
    this.y = y;
    this.isPlaced = true;
    world.setGameObject(x, y, this);
    this.markDirty();
    this.updateIfPlayer();
  }

  basicUnplace() {
    if (this.isPlaced) {
      this.markDirty();
      world.deleteGameObject(this.x, this.y, this);
      this.x = 0;
      this.y = 0;
      this.isPlaced = false;
      this.updateIfPlayer();
    }
  }

  async animateMove(xnew, ynew) {
    const xold = this.x;
    const yold = this.y;
    const oldVisible = world.isVisible(xold, yold);
    this.basicMove(xnew, ynew);
    const newVisible = world.isVisible(xnew, ynew);
    if (oldVisible || newVisible) {
      const time = world.ui.now();
      return world.ui.animate(
        new animation.ObjectAnimation(
          this,
          new animation.State(time, xold, yold, oldVisible | 0),
          new animation.State(time + 100, xnew, ynew, newVisible | 0)
        )
      );
    }
  }

  updateSeen() {}

  schedule(deltaTime, action) {
    const order = world.scheduleOrder;
    world.scheduleOrder = order + 1;
    pqueue.insert(world.schedule, {
      time: world.time + deltaTime,
      order: order,
      object: this,
      action: action
    });
  }

  getReference() {
    if (this.isPlaced) {
      const index = world.getGameObjects(this.x, this.y).indexOf(this);
      assert(index >= 0);
      return Int32Array.of(getIdFromXY(this.x, this.y), index);
    } else {
      return null;
    }
  }

  isMonster() {
    return false;
  }

  isBlocking() {
    return false;
  }

  canPickup() {
    return false;
  }

  static loadImages() {
    const promises = [];
    for (const obj of objectTypeList) {
      if (obj.imageName) {
        promises.push(
          loadImageSizes('img/' + obj.imageName).then(imgs => {
            obj.images = imgs;
          })
        );
      }
    }
    return awaitPromises(promises);
  }
}

GameObject.objectTypes = objectTypes;
GameObject.objectTypeList = objectTypeList;

class TypedGameObject extends GameObject {
  constructor(objectType) {
    super();
    this.objectType = objectType;
  }

  get sinking() {
    return this.getFlag(4);
  }

  set sinking(flag) {
    this.setFlag(4, flag);
  }

  pickleData() {
    const json = super.pickleData();
    json.ot = this.objectType.id;
    return json;
  }

  unpickleData(json) {
    super.unpickleData(json);
    this.objectType = objectTypeList[json.ot];
  }

  draw(ctx, x, y, tileSize) {
    const img = this.objectType.images.get(tileSize);
    ctx.drawImage(img, x, y);
  }

  async doSink() {
    assert(this.sinking, 'We are not sinking');
    if (
      this.isPlaced &&
      world.isPassable(this.x, this.y + 1, this.isBlocking())
    ) {
      this.scheduleSink();
      return this.animateMove(this.x, this.y + 1);
    } else {
      this.sinking = false;
    }
  }

  scheduleSink() {
    this.sinking = true;
    this.schedule(12, 'doSink');
  }

  aName() {
    const name = this.objectType.name;
    return aOrAn(name) + ' ' + name;
  }
}

class MoneyBag extends TypedGameObject {
  constructor(money = 0) {
    super(objectTypes['money bag']);
    this.money = money;
  }

  pickleData() {
    const json = super.pickleData();
    json.money = this.money;
    return json;
  }

  unpickleData(json) {
    super.unpickleData(json);
    this.money = json.money;
  }

  canPickup() {
    return true;
  }

  doPickup() {
    world.money += this.money;
    this.basicUnplace();
  }

  aName() {
    if (this.money === 1) {
      return 'a bag with a single zorkmid';
    } else {
      return `a bag with ${this.money} zorkmids`;
    }
  }
}

registerClass(GameObject, 10);
registerClass(MoneyBag, 30);

exports.TypedGameObject = TypedGameObject;
exports.GameObject = GameObject;
exports.MoneyBag = MoneyBag;

},{"./animation.js":1,"./assert.js":2,"./imgutil.js":9,"./indexutil.js":11,"./objecttype.js":14,"./pickle.js":17,"./pqueue.js":18,"./terrain.js":21,"./textutil.js":23,"./world.js":25}],7:[function(require,module,exports){
'use strict';

const CanvasViewer = require('./canvasviewer.js');
const UserInterface = require('./user-interface.js');
const terrain = require('./terrain.js');
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

  async playerPickup() {
    const player = world.player;
    const objectsToPickup = world
      .getGameObjects(player.x, player.y)
      .filter(obj => obj.canPickup());
    if (objectsToPickup.length === 0) {
      this.ui.message('Nothing to pick up');
      return;
    }
    const options = objectsToPickup.map(obj => obj.aName());
    const selected = await this.ui.askMultipleChoices({
      question: 'Pick up what?',
      options
    });
    for (const item of selected) {
      objectsToPickup[item].doPickup();
      this.ui.message(`You pick up ${objectsToPickup[item].aName()}.`);
    }
    this.ui.updateStatusArea();
  }

  async load() {
    const dbPromise = database.openDatabase();
    const p1 = terrain.loadImages();
    const p2 = GameObject.loadImages();
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
    const maxDepth = player.objectType.maxDepth;

    const tileSize = this.tileSize;
    const borderSize = 2;
    const fullTileSize = tileSize + borderSize;
    const lineDash = [1 / 8, 1 / 8].map(x => fullTileSize * x);

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
          if (wy === maxDepth + 1 && terrain.passable) {
            ctx.save();
            ctx.strokeStyle = 'rgb(255, 127, 127)';
            ctx.lineWidth = 2;
            ctx.setLineDash(lineDash);
            ctx.beginPath();
            ctx.moveTo(ix * fullTileSize, iy * fullTileSize + 1);
            ctx.lineTo((ix + 1) * fullTileSize, iy * fullTileSize + 1);
            ctx.stroke();
            ctx.restore();
          }
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

},{"./assert.js":2,"./canvasviewer.js":3,"./database.js":4,"./event-handler.js":5,"./game-object.js":6,"./htmlutil.js":8,"./newgame.js":13,"./terrain.js":21,"./user-interface.js":24,"./world.js":25}],8:[function(require,module,exports){
'use strict';

function makeElement(type, className, text, color) {
  const span = document.createElement(type);
  if (className) {
    span.className = className;
  }
  if (color) {
    span.style.color = color;
  }
  if (text) {
    span.appendChild(document.createTextNode(text));
  }
  return span;
}

function wrapTableCell(node) {
  const tableCell = makeElement('td');
  tableCell.appendChild(node);
  return tableCell;
}

function makeSpan(...args) {
  return makeElement('span', ...args);
}

function removeAllChildren(element) {
  let last;
  while ((last = element.lastChild)) {
    element.removeChild(last);
  }
}

let lastId = 0;

function freshId() {
  const result = 'id' + lastId;
  lastId++;
  return result;
}

exports.makeElement = makeElement;
exports.makeSpan = makeSpan;
exports.wrapTableCell = wrapTableCell;
exports.removeAllChildren = removeAllChildren;
exports.freshId = freshId;
exports.goodColor = '#00ff00';
exports.badColor = '#ff0000';
exports.neutralColor = 'white';
exports.helpColor = '#7f7fff';

},{}],9:[function(require,module,exports){
'use strict';

const {lerp} = require('./animation.js');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${url}`));
    img.src = url;
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resizeImage(img, origSize, newSize) {
  if (origSize === newSize) {
    return img;
  }

  const canvas = createCanvas(newSize, newSize);
  const ctx = canvas.getContext('2d');
  const factor = newSize / origSize;
  ctx.scale(factor, factor);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

class ScaledImage {
  constructor(im1, im2) {
    this.im1 = im1;
    this.im2 = im2;
    this.cachedImage = null;
    this.cachedImageSize = -1;
  }

  getUncached(size) {
    if (size <= this.im1.width) {
      return resizeImage(this.im1, this.im1.width, size);
    } else {
      return resizeImage(this.im2, this.im2.width, size);
    }
  }

  get(size) {
    if (this.cachedImageSize !== size) {
      this.cachedImage = this.getUncached(size);
      this.cachedImageSize = size;
    }
    return this.cachedImage;
  }
}

async function loadImageSizes(url) {
  const p1 = loadImage(url + '.png');
  const p2 = loadImage(url + '@2.png');
  return new ScaledImage(await p1, await p2);
}

function lerpColor(s, color1, color2) {
  const [r1, g1, b1] = color1;
  const [r2, g2, b2] = color2;
  const r = Math.round(lerp(s, r1, r2));
  const g = Math.round(lerp(s, g1, g2));
  const b = Math.round(lerp(s, b1, b2));
  return `rgb(${r}, ${g}, ${b}`;
}

const defaultColors = [[255, 0, 0], [255, 255, 0], [0, 255, 0]];
const airColors = [[255, 0, 255], [0, 127, 255], [0, 255, 255]];

function colorFromFraction(fraction, colors = defaultColors) {
  if (fraction < 0.5) {
    return lerpColor(2 * fraction, colors[0], colors[1]);
  } else {
    return lerpColor(2 * (fraction - 0.5), colors[1], colors[2]);
  }
}

class HealthBarDrawer {
  constructor(colors = defaultColors, vertical = false) {
    this.width = -1;
    this.height = -1;
    this.cachedImages = new Map();
    this.colors = colors;
    this.vertical = vertical;
  }

  get(width, height, healthFraction) {
    const fullBar = this.vertical ? height : width;
    const barSize = Math.round(healthFraction * (fullBar - 2));
    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.cachedImages.clear();
    }
    let img = this.cachedImages.get(barSize);
    if (!img) {
      img = createCanvas(width, height);
      const ctx = img.getContext('2d');
      ctx.fillStyle = '#303030';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = colorFromFraction(barSize / (fullBar - 2), this.colors);
      if (this.vertical) {
        ctx.fillRect(1, height - 2 - barSize, width - 2, barSize);
      } else {
        ctx.fillRect(1, 1, barSize, height - 2);
      }

      this.cachedImages.set(barSize, img);
    }
    return img;
  }
}

exports.loadImage = loadImage;
exports.loadImageSizes = loadImageSizes;
exports.colorFromFraction = colorFromFraction;
exports.HealthBarDrawer = HealthBarDrawer;
exports.airColors = airColors;

},{"./animation.js":1}],10:[function(require,module,exports){
'use strict';

const GameViewer = require('./gameviewer.js');

const gameViewer = new GameViewer();
gameViewer.redrawOnWindowResize();
gameViewer.redraw().then(console.log, console.error);

},{"./gameviewer.js":7}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
'use strict';

const {HealthBarDrawer, airColors} = require('./imgutil.js');
const {registerClass, getReference} = require('./pickle.js');
const {randomInt, randomRange, probability} = require('./randutil.js');
const {TypedGameObject, MoneyBag} = require('./game-object.js');
const world = require('./world.js');
const animation = require('./animation.js');
const PathFinder = require('./path-finder.js');
const {toTitleCase} = require('./textutil.js');
const {goodColor, badColor, helpColor} = require('./htmlutil.js');
const {getAngleFromXY} = require('./indexutil.js');
const assert = require('./assert.js');

function drawImageDirection(ctx, img, x, y, direction) {
  if (direction) {
    ctx.drawImage(img, x, y);
  } else {
    ctx.save();
    ctx.translate(x + img.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

function drawImageAngle(ctx, img, x, y, angle) {
  const xc = img.width >> 1;
  const yc = img.height >> 1;
  ctx.save();
  ctx.translate(x + xc, y + yc);
  ctx.rotate(angle * (Math.PI / 4));
  ctx.drawImage(img, -xc, -yc);
  ctx.restore();
}

class MonsterPathFinder extends PathFinder {
  constructor(x0, y0, x1, y1, monster) {
    super(x0, y0, x1, y1);
    this.monster = monster;
  }

  isPassable(x, y) {
    return this.monster.isPassable(x, y);
  }
}

const hpHealthBarDrawer = new HealthBarDrawer();
const airHealthBarDrawer = new HealthBarDrawer(airColors, true);

class Monster extends TypedGameObject {
  constructor(objectType) {
    super(objectType);
    this.baseHp = objectType ? objectType.maxHp : 0;
    this.baseHpTime = 0;
    this.target = null;
    this.movesLeft = Infinity;
    this.setDirection(randomInt(2) * 2 - 1, 0);
  }

  static chooseMonsterType(filter = () => true) {
    const theMonsterList = TypedGameObject.objectTypeList.filter(filter);
    const totalFrequency = theMonsterList.reduce(
      (sum, mt) => sum + mt.frequency,
      0
    );
    const triggerFrequency = Math.random() * totalFrequency;
    let frequency = 0;
    for (let i = 0; i < theMonsterList.length; i++) {
      const mt = theMonsterList[i];
      frequency += mt.frequency;
      if (triggerFrequency < frequency) {
        return mt;
      }
    }
    return null;
  }

  get waiting() {
    return this.getFlag(1);
  }
  set waiting(flag) {
    this.setFlag(1, flag);
  }

  get direction() {
    return this.getFlag(2);
  }
  set direction(flag) {
    this.setFlag(2, flag);
  }

  get dead() {
    return this.getFlag(3);
  }
  set dead(flag) {
    this.setFlag(3, flag);
  }

  get angle() {
    return this.getFlags(5, 3);
  }
  set angle(angle) {
    this.setFlags(5, 3, angle);
  }

  pickleData() {
    const json = super.pickleData();
    json.hp = this.baseHp;
    json.hpTime = this.baseHpTime;
    const target = getReference(this.target);
    if (target) {
      json.target = target;
    }
    if (this.movesLeft !== Infinity) {
      json.movesLeft = this.movesLeft;
    }
    return json;
  }

  unpickleData(json) {
    super.unpickleData(json);
    ({
      hp: this.baseHp,
      hpTime: this.baseHpTime,
      target: this.target = null,
      movesLeft: this.movesLeft = Infinity
    } = json);
  }

  postLoad(world) {
    this.target = world.resolveReference(this.target);
  }

  getHp() {
    if (this.dead) {
      return 0;
    }
    const dt = world.time - this.baseHpTime;
    const hp = (this.baseHp + dt * this.objectType.hpRecovery) | 0;
    return Math.max(0, Math.min(this.objectType.maxHp, hp));
  }

  theName() {
    const name = this.objectType.name;
    if (this.isPlayer()) {
      return 'your ' + name;
    } else {
      return 'the ' + name;
    }
  }

  titleCaseName() {
    return toTitleCase(this.theName());
  }

  draw(ctx, x, y, tileSize) {
    const img = this.objectType.images.get(tileSize);
    if (this.objectType.drawAngled) {
      drawImageAngle(ctx, img, x, y, this.angle);
    } else {
      drawImageDirection(ctx, img, x, y, this.direction);
    }
    const hpFraction = this.getHp() / this.objectType.maxHp;
    const barWidth = tileSize >> 1;
    const barHeight = tileSize >> 3;
    if (hpFraction < 1) {
      const healthBar = hpHealthBarDrawer.get(barWidth, barHeight, hpFraction);
      ctx.drawImage(
        healthBar,
        x + tileSize - barWidth - 1,
        y + tileSize - barHeight - 1
      );
    }
    if (this.isPlayer() && world.airPercentage() < 100) {
      const airBar = airHealthBarDrawer.get(
        barHeight,
        barWidth,
        world.airPercentage() / 100
      );
      ctx.drawImage(airBar, x + 2, y + tileSize - barWidth - 2);
    }
  }

  sleep(deltaTime) {
    this.waiting = true;
    this.schedule(deltaTime, 'wakeUp');
  }

  updateSeen() {
    if (!this.waiting && !this.isPlayer()) {
      this.sleep(0);
    }
  }

  setDirection(dx, dy) {
    if (dx !== 0) {
      this.direction = dx > 0;
      this.markDirty();
    }
    const angle = getAngleFromXY(dx, dy);
    if (angle !== undefined) {
      this.angle = angle;
      this.markDirty();
    }
  }

  async doMove(dx, dy) {
    assert(!this.waiting, 'Monster is waiting');
    const xold = this.x;
    const yold = this.y;
    const xnew = xold + dx;
    const ynew = yold + dy;
    this.sleep(this.objectType.baseDelay);
    this.setDirection(dx, dy);
    await this.animateMove(xnew, ynew);
    if (this.isPlayer()) {
      const objectsToPickup = world
        .getGameObjects(this.x, this.y)
        .filter(obj => obj.canPickup());
      if (objectsToPickup.length !== 0) {
        if (objectsToPickup.length === 1) {
          world.ui.message(`You see ${objectsToPickup[0].aName()} here.`);
        } else {
          world.ui.message(`You see ${objectsToPickup.length} objects here.`);
        }
        world.ui.message('Press , to pick up objects.', helpColor);
      }
    }
    this.movesLeft = this.movesLeft - 1;
    if (this.movesLeft === 0) {
      return this.blowUp();
    }
  }

  doTorpedo(target) {
    const torpedo = new Monster(Monster.objectTypes.torpedo);
    this.setDirection(target.x - this.x, target.y - this.y);
    torpedo.direction = this.direction;
    torpedo.target = target;
    torpedo.basicMove(this.x, this.y);
    torpedo.sleep(0);
    const distance = Math.max(
      Math.abs(target.x - this.x),
      Math.abs(target.y - this.y)
    );
    torpedo.movesLeft = distance + randomRange(1, Math.max(4, distance * 2));
    this.sleep(this.objectType.baseDelay);
    if (!this.isPlayer() && world.isVisible(this.x, this.y)) {
      world.ui.message(`${this.titleCaseName()} launches a torpedo.`);
    }
  }

  async doDamage(hp, deadMessage, silentDead = false) {
    const newHp = Math.max(0, this.getHp() - hp);
    this.baseHp = newHp;
    this.baseHpTime = world.time;
    this.markDirty();
    if (newHp === 0) {
      this.dead = true;
      if (this.isPlayer()) {
        if (deadMessage) {
          world.ui.message(deadMessage, badColor);
        }
        world.ui.message('You die.', badColor);
        world.ui.updateStatusArea();
      } else {
        if (world.isVisible(this.x, this.y)) {
          const time = world.ui.now();
          await world.ui.animate(
            new animation.ObjectAnimation(
              this,
              new animation.State(time, this.x, this.y, 1),
              new animation.State(time + 100, this.x, this.y, 0)
            )
          );
          if (!silentDead) {
            const verb = this.objectType.alive ? 'dies' : 'is destroyed';
            world.ui.message(`${this.titleCaseName()} ${verb}.`);
          }
        }
        this.doDrop();
        this.basicUnplace();
      }
    }
  }

  doDrop() {
    const moneyDrop = this.objectType.moneyDrop;
    if (moneyDrop && probability(moneyDrop.probability)) {
      const moneyBag = new MoneyBag(randomRange(moneyDrop.min, moneyDrop.max));
      moneyBag.basicMove(this.x, this.y);
      moneyBag.scheduleSink();
    }
  }

  async doAttack(victim) {
    assert(!this.waiting, 'Monster is waiting, cannot attack');
    const oldVisible = world.isVisible(this.x, this.y);
    const newVisible = world.isVisible(victim.x, victim.y);
    const hp = randomRange(1, 4);
    this.setDirection(victim.x - this.x, victim.y - this.y);
    this.sleep(this.objectType.baseDelay);
    const kamikaze = this.objectType.kamikaze;
    if (oldVisible || newVisible) {
      const time = world.ui.now();
      const meleeVerb = this.objectType.meleeVerb;
      world.ui.message(
        `${this.titleCaseName()} ${meleeVerb} ${victim.theName()}.`,
        this.isPlayer() ? goodColor : badColor,
        hp
      );
      await world.ui.animate(
        new animation.ObjectAnimation(
          this,
          new animation.State(time, this.x, this.y, oldVisible | 0),
          new animation.State(time + 100, victim.x, victim.y, newVisible | 0),
          {
            sfunc: kamikaze ? animation.identity : animation.bump,
            animatePlayer: false
          }
        )
      );
    }
    if (kamikaze) {
      await this.blowUp();
    }
    return victim.doDamage(hp);
  }

  isPlayer() {
    return this === world.player;
  }

  isPassable(x, y) {
    return (
      world.isPassable(x, y, this.isBlocking()) &&
      (this.isPlayer() || y <= this.objectType.maxDepth)
    );
  }

  getTarget() {
    if (this.target) {
      return this.target.dead ? null : this.target;
    }
    const player = world.player;
    if (player.isPlaced && !player.dead) {
      return player;
    } else {
      return null;
    }
  }

  canSee(otherMonster) {
    if (this.isPlayer()) {
      return world.isVisible(otherMonster.x, otherMonster.y);
    } else if (otherMonster.isPlayer()) {
      return world.isVisible(this.x, this.y);
    } else {
      assert(
        false,
        'Not implemented: visual check between two non-player monsters'
      );
      return false;
    }
  }

  async wakeUp() {
    this.waiting = false;
    if (!this.isPlayer()) {
      const target = this.getTarget();
      if (target) {
        if (probability(this.objectType.torpedoRate) && this.canSee(target)) {
          this.doTorpedo(target);
          return;
        }
        const pf = new MonsterPathFinder(
          this.x,
          this.y,
          target.x,
          target.y,
          this
        );
        pf.runN(this.objectType.intelligence);
        const path = pf.getPath();
        if (path.length >= 1) {
          const [x2, y2] = path[Math.min(1, path.length - 1)];
          if (world.getGameObjects(x2, y2).includes(target)) {
            return this.doAttack(target);
          } else if (this.isPassable(x2, y2)) {
            return this.doMove(x2 - this.x, y2 - this.y);
          }
        }
      } else if (this.objectType.kamikaze) {
        return this.blowUp();
      }
    }
  }

  blowUp() {
    return this.doDamage(
      Infinity,
      `${this.titleCaseName()} blows itself up.`,
      true /* silentDead */
    );
  }

  async checkDepth() {
    assert(this.isPlayer(), 'Non-player checks depth');
    const maxDepth = this.objectType.maxDepth;
    const depth = this.y;
    const badLuck = Math.min(1, Math.max(0, depth - maxDepth) / maxDepth);
    if (Math.random() < badLuck) {
      const hp = randomRange(1, 3);
      world.ui.message(
        'The hull creaks ominously under the enormous pressure.',
        badColor,
        hp
      );
      await this.doDamage(hp, 'A sudden rush of water enters the vessel.');
    }
    this.schedule(randomRange(5, 10), 'checkDepth');
  }

  isMonster() {
    return !this.dead;
  }

  isBlocking() {
    return this.objectType.isBlocking;
  }
}

registerClass(Monster, 20);

module.exports = Monster;

},{"./animation.js":1,"./assert.js":2,"./game-object.js":6,"./htmlutil.js":8,"./imgutil.js":9,"./indexutil.js":11,"./path-finder.js":15,"./pickle.js":17,"./randutil.js":19,"./textutil.js":23,"./world.js":25}],13:[function(require,module,exports){
'use strict';

const {terrainTypes} = require('./terrain.js');
const Monster = require('./monster.js');
const world = require('./world.js');
const {randomStep} = require('./randutil.js');

function randomWalk(n) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    if (y === 0) {
      world.setTerrain(x, 0, terrainTypes.wave);
      world.setTerrain(x, -1, terrainTypes.air);
    } else {
      world.setTerrain(x, y, terrainTypes.water);
      if (world.isPassable(x, y) && Math.random() < 0.01) {
        const objectType = Monster.chooseMonsterType(mt => y <= mt.maxDepth);
        if (objectType) {
          new Monster(objectType).basicMove(x, y);
        }
      }
    }
    for (;;) {
      const [xn, yn] = randomStep(x, y);
      if (yn >= 0 && yn < 20) {
        x = xn;
        y = yn;
        break;
      }
    }
  }
}

function newGame() {
  world.reset();
  randomWalk(1000);
  const player = new Monster(Monster.objectTypes.submarine);
  world.player = player;
  player.basicMove(0, 0);
  player.schedule(0, 'checkDepth');
  return world;
}

module.exports = newGame;

},{"./monster.js":12,"./randutil.js":19,"./terrain.js":21,"./world.js":25}],14:[function(require,module,exports){
'use strict';

module.exports = [
  {
    name: 'money bag',
    imageName: 'moneybag'
  },
  {
    name: 'submarine',
    maxHp: 20,
    maxDepth: 10,
    hpRecovery: 1 / 12,
    meleeVerb: 'rams'
  },
  {
    name: 'Selenian submarine',
    imageName: 'selenian-sub',
    maxHp: 15,
    maxDepth: 12,
    hpRecovery: 1 / 20,
    meleeVerb: 'rams',
    torpedoRate: 0.1,
    frequency: 5,
    moneyDrop: {probability: 0.8, min: 1, max: 5}
  },
  {
    name: 'squid',
    baseDelay: 12,
    maxHp: 12,
    frequency: 10,
    alive: true,
    moneyDrop: {probability: 0.5, min: 1, max: 3}
  },
  {
    name: 'torpedo',
    maxHp: 5,
    baseDelay: 4,
    hpRecovery: 0,
    meleeVerb: 'explodes at',
    isBlocking: false,
    kamikaze: true,
    drawAngled: true
  }
];

},{}],15:[function(require,module,exports){
'use strict';

const pqueue = require('./pqueue.js');
const {getIdFromXY} = require('./indexutil.js');

class PathNode {
  constructor(heuristic, cost, order, x, y, previous) {
    this.time = heuristic + cost;
    this.cost = cost;
    this.order = order;
    this.x = x;
    this.y = y;
    this.previous = previous;
  }
}

class PathFinder {
  constructor(x0, y0, x1, y1) {
    this.incomplete = true;
    this.found = false;
    this.currentNode = null;

    this.x1 = x1;
    this.y1 = y1;
    this.closedSet = new Set();
    this.openSet = [];

    this.addOpenSet(0, x0, y0, null);
  }

  cost() {
    return 1;
  }

  isPassable() {
    return true;
  }

  isPassableOrDestination(x, y) {
    return (x === this.x1 && y === this.y1) || this.isPassable(x, y);
  }

  addOpenSet(cost, x, y, previous = null) {
    const dx = x - this.x1;
    const dy = y - this.y1;
    const heuristic = Math.max(Math.abs(dx), Math.abs(dy));
    const order = dx * dx + dy * dy; // use Euclidian norm to break ties
    pqueue.insert(
      this.openSet,
      new PathNode(heuristic, cost, order, x, y, previous)
    );
  }

  runStep() {
    if (this.openSet.length === 0) {
      this.incomplete = false;
      if (!this.found) {
        this.currentNode = null;
      }
      return;
    }
    const currentNode = pqueue.remove(this.openSet);
    const x = currentNode.x;
    const y = currentNode.y;
    const xy = getIdFromXY(x, y);
    if (this.closedSet.has(xy)) {
      return;
    }
    this.currentNode = currentNode;
    if (x === this.x1 && y === this.y1) {
      this.openSet = [];
      this.incomplete = false;
      this.found = true;
      return;
    }
    this.closedSet.add(xy);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const x2 = x + dx;
        const y2 = y + dy;
        const xy2 = getIdFromXY(x2, y2);
        if (this.closedSet.has(xy2) || !this.isPassableOrDestination(x2, y2)) {
          continue;
        }
        const newCost = currentNode.cost + this.cost(x2, y2);
        this.addOpenSet(newCost, x2, y2, currentNode);
      }
    }
  }

  run() {
    while (this.incomplete) {
      this.runStep();
    }
  }

  runN(n) {
    while (this.incomplete && n > 0) {
      this.runStep();
      n--;
    }
  }

  getPath() {
    const result = [];
    let node = this.currentNode;
    while (node) {
      result.push([node.x, node.y]);
      node = node.previous;
    }
    result.reverse();
    return result;
  }
}

module.exports = PathFinder;

},{"./indexutil.js":11,"./pqueue.js":18}],16:[function(require,module,exports){
'use strict';

function zeroCrossing(x1, y1, x2, y2) {
  const dy = y1 - y2;
  return x2 * (y1 / dy) - x1 * (y2 / dy);
}

class Ray {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }

  atPoint(x, y) {
    return this.a * x + this.b - y;
  }

  zeroCrossing(s1, otherRay, s2) {
    return new Ray(
      zeroCrossing(this.a, s1, otherRay.a, s2),
      zeroCrossing(this.b, s1, otherRay.b, s2)
    );
  }
}

class Beam {
  constructor(rays) {
    this.rays = rays;
  }

  isEmpty() {
    return this.rays.length === 0;
  }

  splitPoint(x, y) {
    const negativeRays = [];
    const zeroRays = [];
    const positiveRays = [];
    let hasNegative = false;
    let hasPositive = false;

    let previousRay = null;
    let previousS = 0.0;
    if (this.rays.length >= 3) {
      previousRay = this.rays[this.rays.length - 1];
      previousS = previousRay.atPoint(x, y);
    }
    for (const ray of this.rays) {
      const s = ray.atPoint(x, y);
      if (
        previousRay &&
        ((previousS < 0 && s > 0) || (previousS > 0 && s < 0))
      ) {
        const splitRay = previousRay.zeroCrossing(previousS, ray, s);
        negativeRays.push(splitRay);
        zeroRays.push(splitRay);
        positiveRays.push(splitRay);
      }
      if (s < 0) {
        negativeRays.push(ray);
        hasNegative = true;
      } else if (s > 0) {
        positiveRays.push(ray);
        hasPositive = true;
      } else {
        negativeRays.push(ray);
        zeroRays.push(ray);
        positiveRays.push(ray);
      }
      previousRay = ray;
      previousS = s;
    }
    return {
      negative: new Beam(hasNegative ? negativeRays : []),
      zero: new Beam(zeroRays),
      positive: new Beam(hasPositive ? positiveRays : [])
    };
  }
}

const initialBeam = new Beam(
  [new Ray(0, 0.5), new Ray(0, -0.5), new Ray(1, -1), new Ray(1, 1)],
  true
);

class FovTree {
  constructor(x, y, beam) {
    this.x = x;
    this.y = y;
    this.distance = Math.hypot(x, y);
    this._beam = beam;
    this._children = null;
  }

  _addChild(dx, dy, beam) {
    if (!beam.isEmpty()) {
      this._children.push(new FovTree(this.x + dx, this.y + dy, beam));
    }
  }

  children() {
    if (!this._children) {
      this._children = [];
      const x = this.x;
      const y = this.y;
      const splitBeams = this._beam.splitPoint(x + 0.5, y + 0.5);
      this._addChild(
        0,
        1,
        splitBeams.positive.splitPoint(x - 0.5, y + 0.5).negative
      );
      this._addChild(1, 1, splitBeams.zero);
      this._addChild(
        1,
        0,
        splitBeams.negative.splitPoint(x + 0.5, y - 0.5).positive
      );
    }
    return this._children;
  }
}

const fovTree = new FovTree(0, 0, initialBeam);

exports.fovTree = fovTree;

},{}],17:[function(require,module,exports){
'use strict';

const assert = require('./assert.js');

const classIdSymbol = Symbol();
const classIdToConstructor = new Map();

function registerClass(constructor, classId) {
  assert(
    classIdToConstructor.get(classId) === undefined,
    'Class ID already in use'
  );
  const prototype = constructor.prototype;
  assert(prototype.pickleData, 'Class misses pickleData method');
  assert(prototype.unpickleData, 'Class misses unpickleData method');
  classIdToConstructor.set(classId, constructor);
  prototype[classIdSymbol] = classId;
}

function pickle(obj) {
  const result = obj.pickleData();
  result['class'] = obj[classIdSymbol];
  return result;
}

function unpickle(json) {
  const constructor = classIdToConstructor.get(json['class']);
  const result = new constructor();
  result.unpickleData(json);
  return result;
}

function getReference(gameObj) {
  return gameObj ? gameObj.getReference() : null;
}

exports.registerClass = registerClass;
exports.pickle = pickle;
exports.unpickle = unpickle;
exports.getReference = getReference;

},{"./assert.js":2}],18:[function(require,module,exports){
'use strict';

function swap(pq, i, j) {
  const tmp = pq[i];
  pq[i] = pq[j];
  pq[j] = tmp;
}

function lessThan(obj1, obj2) {
  const time1 = obj1.time;
  const time2 = obj2.time;
  return time1 < time2 || (time1 === time2 && obj1.order < obj2.order);
}

function insert(pq, obj) {
  let pos = pq.length;
  pq.push(obj);

  while (pos > 0) {
    const parentPos = (pos - 1) >> 1;
    const parentObj = pq[parentPos];
    if (lessThan(obj, parentObj)) {
      swap(pq, pos, parentPos);
      pos = parentPos;
    } else {
      break;
    }
  }
}

function remove(pq) {
  if (pq.length === 0) {
    return undefined;
  } else if (pq.length === 1) {
    return pq.pop();
  }
  const result = pq[0];
  pq[0] = pq.pop();
  let pos = 0;
  const obj = pq[pos];
  for (;;) {
    const child1 = 2 * pos + 1;
    const child2 = 2 * pos + 2;
    if (child1 >= pq.length) {
      break;
    } else if (child2 >= pq.length) {
      if (lessThan(pq[child1], obj)) {
        swap(pq, pos, child1);
      }
      break;
    } else {
      const child1Obj = pq[child1];
      const child2Obj = pq[child2];
      if (!lessThan(child1Obj, obj) && !lessThan(child2Obj, obj)) {
        break;
      } else if (lessThan(child1Obj, child2Obj)) {
        swap(pq, pos, child1);
        pos = child1;
      } else {
        swap(pq, pos, child2);
        pos = child2;
      }
    }
  }
  return result;
}

function test(N = 10) {
  const input = [];
  const pq = [];
  for (let i = 0; i < N; i++) {
    const obj = {time: Math.random(), order: i};
    insert(pq, obj);
    input.push(obj);
  }
  const output = [];
  while (pq.length > 0) {
    output.push(remove(pq));
  }
  return [input, output];
}

exports.insert = insert;
exports.remove = remove;
exports.test = test;

},{}],19:[function(require,module,exports){
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

function probability(prob) {
  return Math.random() < prob;
}

exports.randomInt = randomInt;
exports.randomStep = randomStep;
exports.randomRange = randomRange;
exports.probability = probability;

},{}],20:[function(require,module,exports){
'use strict';

const {getIdFromXY} = require('./indexutil.js');
const {terrainList} = require('./terrain.js');

function getTerrainIdFromXY(x, y) {
  return getIdFromXY(x >> 4, y >> 4);
}

function getIndexFromXY(x, y) {
  return ((y & 15) << 4) | (x & 15);
}

class TerrainGrid {
  constructor(defaultTerrain) {
    this.defaultTerrain = defaultTerrain;
    this.terrainMap = new Map();
    this.dirty = new Set();
  }

  get(x, y) {
    const id = getTerrainIdFromXY(x, y);
    const array = this.terrainMap.get(id);
    if (array) {
      return terrainList[array[getIndexFromXY(x, y)]];
    } else {
      return this.defaultTerrain;
    }
  }

  set(x, y, terrain) {
    const id = getTerrainIdFromXY(x, y);
    this.dirty.add(id);
    let array = this.terrainMap.get(id);
    if (!array) {
      array = new Uint8Array(256);
      array.fill(this.defaultTerrain.id);
      this.terrainMap.set(id, array);
    }
    array[getIndexFromXY(x, y)] = terrain.id;
  }

  markNonDirty() {
    this.dirty.clear();
  }

  saveDirty(objectStore) {
    for (const xy of this.dirty) {
      objectStore.put(this.terrainMap.get(xy), xy);
    }
  }

  load(objectStore) {
    objectStore.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        this.terrainMap.set(cursor.key, cursor.value);
        cursor.continue();
      }
    };
  }
}

module.exports = TerrainGrid;

},{"./indexutil.js":11,"./terrain.js":21}],21:[function(require,module,exports){
'use strict';

const {loadImageSizes} = require('./imgutil.js');

async function awaitPromises(promises) {
  for (const promise of promises) {
    await promise;
  }
}

class Terrain {
  constructor(id, json) {
    this.id = id;
    this.name = json.name;
    this.transparent = json.transparent;
    this.passable = json.passable;
    this.imageName = json.image;
    this.images = null;
  }
}

const terrainTypes = {};
const terrainList = [];

for (const json of require('./terraintype.js')) {
  const terrainObj = new Terrain(terrainList.length, json);
  terrainList.push(terrainObj);
  terrainTypes[terrainObj.name] = terrainObj;
}

function loadImages() {
  const promises = [];
  for (const terrain of terrainList) {
    if (terrain.imageName) {
      promises.push(
        loadImageSizes('img/' + terrain.imageName).then(imgs => {
          terrain.images = imgs;
        })
      );
    }
  }
  return awaitPromises(promises);
}

exports.terrainTypes = terrainTypes;
exports.terrainList = terrainList;
exports.loadImages = loadImages;
exports.awaitPromises = awaitPromises;

},{"./imgutil.js":9,"./terraintype.js":22}],22:[function(require,module,exports){
'use strict';

module.exports = [
  {
    name: 'unseen',
    passable: false,
    transparent: false
  },
  {
    name: 'wall',
    image: 'wall',
    passable: false,
    transparent: false
  },
  {
    name: 'water',
    image: 'water',
    passable: true,
    transparent: true
  },
  {
    name: 'wave',
    image: 'wave',
    passable: true,
    transparent: true
  },
  {
    name: 'air',
    passable: false,
    transparent: true
  }
];

},{}],23:[function(require,module,exports){
'use strict';

function toTitleCase(str) {
  if (str === '') {
    return str;
  } else {
    return str[0].toUpperCase() + str.slice(1);
  }
}

const vowels = new Set('aeiou');

function aOrAn(str) {
  return vowels.has(str[0]) ? 'an' : 'a';
}

exports.toTitleCase = toTitleCase;
exports.aOrAn = aOrAn;

},{}],24:[function(require,module,exports){
'use strict';

const world = require('./world.js');
const {SelectionEventHandler} = require('./event-handler.js');
const {
  removeAllChildren,
  goodColor,
  badColor,
  makeSpan,
  makeElement,
  wrapTableCell,
  freshId
} = require('./htmlutil.js');
const {colorFromFraction, airColors} = require('./imgutil.js');

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
    if (
      this.message === otherMessage.message &&
      this.color === otherMessage.color
    ) {
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
        maxHp: player.objectType.maxHp,
        dead: player.dead,
        depth: player.y,
        maxDepth: player.objectType.maxDepth,
        airPercentage: world.airPercentage(),
        money: world.money
      };
    } else {
      return null;
    }
  }

  static isStateEqual(state1, state2) {
    if (state1 === state2) {
      return true;
    }
    if (state1 === null || state2 === null) {
      return false;
    }
    for (const [k, v] of Object.entries(state2)) {
      if (state1[k] !== v) {
        return false;
      }
    }
    return true;
  }

  addDiv(...args) {
    this.statusArea.appendChild(makeElement('div', 'status-span', ...args));
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
    const hpColor = colorFromFraction(state.hp / state.maxHp);
    this.addDiv(`HP: ${state.hp}/${state.maxHp}`, hpColor);
    const depthColor = state.depth <= state.maxDepth ? goodColor : badColor;
    this.addDiv(`Depth: ${state.depth}/${state.maxDepth}`, depthColor);
    this.addDiv(
      `Air: ${state.airPercentage}%`,
      colorFromFraction(state.airPercentage / 100, airColors)
    );
    this.addDiv(`Money: ${state.money}`);
    if (state.dead) {
      this.addDiv('Dead', badColor);
    }
  }
}

class UserInterface {
  constructor(gameViewer) {
    const messageArea = document.getElementById('messageArea');
    const statusArea = document.getElementById('statusArea');
    const questionArea = document.getElementById('questionArea');

    this.gameViewer = gameViewer;
    this.messageArea = messageArea;
    this.questionArea = questionArea;
    this.statusArea = new StatusArea(statusArea);
    this.lastMessage = null;
    messageArea.addEventListener('click', () => this.clearMessageArea());
    //    questionArea.addEventListener('click', () => this.clearQuestionArea());
  }

  redraw() {
    return this.gameViewer.redraw();
  }

  async selectTile(message) {
    const player = world.player;
    if (!player || player.dead) {
      return null;
    }
    const selectHandler = new SelectionEventHandler(
      this.gameViewer,
      player.x,
      player.y,
      message
    );
    this.gameViewer.eventHandlers.push(selectHandler);
    let result = null;
    try {
      result = await selectHandler.resultPromise;
    } finally {
      this.gameViewer.eventHandlers.pop();
      this.clearQuestionArea();
      this.redraw();
    }
    return result;
  }

  async animate(animation) {
    if (animation.isTrivial()) {
      return;
    }
    const gameViewer = this.gameViewer;
    gameViewer.animation = animation;
    await gameViewer.animateUntil(animation.endTime());
    gameViewer.animation = null;
  }

  now() {
    return performance.now();
  }

  message(message, color = 'white', hp = 0) {
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

  questionAreaMessage(message, color = 'white') {
    this.questionArea.appendChild(
      makeElement('div', 'message-span', message, color)
    );
  }

  clearQuestionArea() {
    removeAllChildren(this.questionArea);
  }

  updateStatusArea() {
    this.statusArea.update();
  }

  askMultipleChoices({question, options, acceptButton = 'OK'}) {
    this.clearQuestionArea();
    const form = makeElement('form');
    form.appendChild(makeElement('div', null, question));
    const checkboxes = [];
    const table = makeElement('table');
    for (const option of options) {
      const tableRow = makeElement('tr');
      const checkbox = makeElement('input', 'checkbox');
      checkbox.type = 'checkbox';
      checkbox.id = freshId();
      checkbox.checked = true;
      checkboxes.push(checkbox);
      const label = makeElement('label', null, option);
      label.for = checkbox.id;
      tableRow.appendChild(wrapTableCell(checkbox));
      tableRow.appendChild(wrapTableCell(label));
      table.appendChild(tableRow);
    }
    form.appendChild(table);
    const div = makeElement('div');
    const button = makeElement('button', null, acceptButton);
    button.type = 'button';
    div.appendChild(button);
    const cancelButton = makeElement('button', null, 'Cancel');
    cancelButton.type = 'button';
    div.appendChild(cancelButton);
    form.appendChild(div);
    this.questionArea.appendChild(form);

    return new Promise(resolve => {
      button.addEventListener('click', () => {
        const selected = [];
        for (let i = 0; i < checkboxes.length; i++) {
          if (checkboxes[i].checked) {
            selected.push(i);
          }
        }
        resolve(selected);
      });
      cancelButton.addEventListener('click', () => resolve([]));
    }).then(result => {
      window.setTimeout(() => this.clearQuestionArea());
      return result;
    });
  }
}

module.exports = UserInterface;

},{"./event-handler.js":5,"./htmlutil.js":8,"./imgutil.js":9,"./world.js":25}],25:[function(require,module,exports){
'use strict';

const permissiveFov = require('./permissive-fov.js');
const fovTree = permissiveFov.fovTree.children();
const pqueue = require('./pqueue.js');
const database = require('./database.js');
const {getIdFromXY, getXFromId, getYFromId} = require('./indexutil.js');
const {pickle, unpickle, getReference} = require('./pickle.js');
const {badColor} = require('./htmlutil.js');
const assert = require('./assert.js');

const {terrainTypes} = require('./terrain.js');
const TerrainGrid = require('./terrain-grid.js');

const emptyArray = [];

function pickleAction(action) {
  action = Object.assign({}, action);
  action.object = getReference(action.object);
  return action;
}

function unpickleWithLocation(x, y, obj) {
  obj = unpickle(obj);
  obj.x = x;
  obj.y = y;
  return obj;
}

const gameVersion = 10;

class World {
  constructor() {
    this.terrainGrid = null;
    this.rememberedTerrainGrid = null;
    this.gameObjects = null;
    this.dirtyGameObjects = null;
    this.player = null;
    this.visible = null;
    this.time = 0;
    this.scheduleOrder = 0;
    this.schedule = [];
    this.ui = null;
    this.database = null;
    this.lastAirTime = 0;
    this.airDuration = 0;
    this.money = 0;
  }

  reset() {
    this.terrainGrid = new TerrainGrid(terrainTypes.wall);
    this.rememberedTerrainGrid = new TerrainGrid(terrainTypes.unseen);
    this.gameObjects = new Map();
    this.dirtyGameObjects = new Set();
    this.visible = new Set();
    this.time = 0;
    this.scheduleOrder = 0;
    this.schedule = [];
    this.player = null;
    this.lastAirTime = 0;
    this.airDuration = 600;
    this.money = 0;
  }

  getTerrain(x, y) {
    return this.terrainGrid.get(x, y);
  }

  setTerrain(x, y, terrain) {
    return this.terrainGrid.set(x, y, terrain);
  }

  getRememberedTerrain(x, y) {
    return this.rememberedTerrainGrid.get(x, y);
  }

  updateSeen(x, y) {
    this.rememberedTerrainGrid.set(x, y, this.terrainGrid.get(x, y));
    for (const gameObject of this.getGameObjects(x, y)) {
      gameObject.updateSeen();
    }
  }

  updateVisible() {
    const visible = new Set();
    this.visible = visible;
    const player = this.player;
    if (!player) {
      return;
    }
    const px = player.x;
    const py = player.y;
    const distance = 7;
    const world = this;

    visible.add(getIdFromXY(px, py));
    world.updateSeen(px, py);

    function processTrees(trees, t) {
      for (const tree of trees) {
        if (tree.distance > distance) {
          continue;
        }
        let x = tree.x;
        let y = tree.y;
        if (t & 1) {
          x = -x;
        }
        if (t & 2) {
          y = -y;
        }
        if (t & 4) {
          const tmp = x;
          x = y;
          y = tmp;
        }
        x += px;
        y += py;
        visible.add(getIdFromXY(x, y));
        world.updateSeen(x, y);
        if (world.getTerrain(x, y).transparent) {
          processTrees(tree.children(), t);
        }
      }
    }

    for (let t = 0; t < 8; t++) {
      processTrees(fovTree, t);
    }
  }

  isVisible(x, y) {
    return this.visible.has(getIdFromXY(x, y));
  }

  setGameObject(x, y, obj) {
    const xy = getIdFromXY(x, y);
    const ar = this.gameObjects.get(xy);
    if (ar) {
      ar.push(obj);
    } else {
      this.gameObjects.set(xy, [obj]);
    }
  }

  deleteGameObject(x, y, obj) {
    const xy = getIdFromXY(x, y);
    const ar = this.gameObjects.get(xy);
    if (ar.length === 1) {
      assert(ar[0] === obj);
      this.gameObjects.delete(xy);
    } else {
      const index = ar.indexOf(obj);
      assert(index >= 0);
      ar.splice(index, 1);
    }
  }

  getGameObjects(x, y) {
    return this.gameObjects.get(getIdFromXY(x, y)) || emptyArray;
  }

  getMonster(x, y) {
    const ar = this.getGameObjects(x, y);
    let i = ar.length - 1;
    while (i >= 0) {
      const obj = ar[i];
      if (obj.isMonster()) {
        return obj;
      }
      i--;
    }
    return undefined;
  }

  /* Can somebody pass at (x,y).
   * isBlocking is the blocking status of the monster trying to pass.
   */
  isPassable(x, y, isBlocking = true) {
    if (!this.getTerrain(x, y).passable) {
      return false;
    }
    if (isBlocking) {
      for (const gameObject of this.getGameObjects(x, y)) {
        if (gameObject.isBlocking()) {
          return false;
        }
      }
    }
    return true;
  }

  airPercentage() {
    const dt = this.time - this.lastAirTime;
    return Math.ceil(
      (100 * Math.max(0, this.airDuration - dt)) / this.airDuration
    );
  }

  async checkAir(oldAirPercentage) {
    const player = this.player;
    if (!player) {
      return;
    }
    if (player.y <= 0) {
      this.lastAirTime = this.time;
    }
    const airPercentage = this.airPercentage();
    if (airPercentage === 0) {
      return player.doDamage(Infinity, 'You suffocate as you run out of air.');
    } else {
      for (const [limit, message] of [
        [50, 'Air getting low.'],
        [25, 'WARNING: low on air.'],
        [10, 'PANIC: almost out of air.']
      ]) {
        if (oldAirPercentage > limit && airPercentage <= limit) {
          this.ui.message(message, badColor);
          break;
        }
      }
    }
  }

  async tryPlayerMove(dx, dy) {
    const player = this.player;
    const xnew = dx + player.x;
    const ynew = dy + player.y;
    if (this.isPassable(xnew, ynew)) {
      return player.doMove(dx, dy);
    } else {
      const monster = this.getMonster(xnew, ynew);
      if (monster) {
        return player.doAttack(monster);
      }
    }
  }

  async runSchedule() {
    const player = this.player;
    const schedule = this.schedule;
    while (player.waiting && !player.dead) {
      const action = pqueue.remove(schedule);
      assert(action);
      const oldAirPercentage = this.airPercentage();
      this.time = action.time;
      await this.checkAir(oldAirPercentage);
      this.ui.updateStatusArea();
      const object = action.object;
      if (object && object.isPlaced) {
        await object[action.action].call(object);
      }
    }
  }

  resolveReference(ref) {
    if (ref) {
      return this.gameObjects.get(ref[0])[ref[1]];
    } else {
      return null;
    }
  }

  unpickleAction(action) {
    action = Object.assign({}, action);
    action.object = this.resolveReference(action.object);
    return action;
  }

  getGlobalData() {
    return {
      version: gameVersion,
      visible: this.visible,
      time: this.time,
      scheduleOrder: this.scheduleOrder,
      schedule: this.schedule.map(pickleAction),
      player: getReference(this.player),
      lastAirTime: this.lastAirTime,
      airDuration: this.airDuration,
      money: this.money
    };
  }

  setGlobalData(json) {
    this.visible = json.visible;
    this.time = json.time;
    this.scheduleOrder = json.scheduleOrder;
    this.schedule = json.schedule.map(action => this.unpickleAction(action));
    this.player = this.resolveReference(json.player);
    this.lastAirTime = json.lastAirTime;
    this.airDuration = json.airDuration;
    this.money = json.money;
    for (const [, ar] of this.gameObjects) {
      for (const gameObject of ar) {
        gameObject.postLoad(this);
      }
    }
  }

  saveGame({clearAll = false} = {}) {
    return new Promise((resolve, reject) => {
      const dead = this.player && this.player.dead;
      const transaction = this.database.transaction(
        database.objectStores,
        'readwrite'
      );
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));
      transaction.oncomplete = () => {
        this.markNonDirty();
        resolve();
      };
      if (clearAll || dead) {
        for (const objectStore of database.objectStores) {
          transaction.objectStore(objectStore).clear();
        }
        if (dead) {
          return;
        }
      }
      transaction.objectStore('game').put(this.getGlobalData(), 1);
      const gameObjectsStore = transaction.objectStore('game-objects');
      for (const xy of this.dirtyGameObjects) {
        const gameObjects = this.gameObjects.get(xy);
        if (gameObjects) {
          gameObjectsStore.put(gameObjects.map(pickle), xy);
        } else {
          gameObjectsStore.delete(xy);
        }
      }
      this.terrainGrid.saveDirty(transaction.objectStore('terrain'));
      this.rememberedTerrainGrid.saveDirty(
        transaction.objectStore('remembered-terrain')
      );
    });
  }

  tryLoadGame() {
    return new Promise((resolve, reject) => {
      this.reset();
      const transaction = this.database.transaction(
        database.objectStores,
        'readonly'
      );
      transaction.onerror = () => {
        if (transaction.error) {
          reject(transaction.error);
        } else {
          resolve(false); // we aborted
        }
      };
      transaction.onabort = () => resolve(false);
      transaction.oncomplete = () => resolve(true);

      this.terrainGrid.load(transaction.objectStore('terrain'));
      this.rememberedTerrainGrid.load(
        transaction.objectStore('remembered-terrain')
      );

      transaction
        .objectStore('game-objects')
        .openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          const xy = cursor.key;
          const x = getXFromId(xy);
          const y = getYFromId(xy);
          const ar = cursor.value.map(obj => unpickleWithLocation(x, y, obj));
          this.gameObjects.set(xy, ar);
          cursor.continue();
        } else {
          // go on with reading the rest
          transaction.objectStore('game').get(1).onsuccess = event => {
            const result = event.target.result;
            if (result && result.version === gameVersion) {
              this.setGlobalData(result);
            } else {
              transaction.abort();
            }
          };
        }
      };
    });
  }

  markNonDirty() {
    this.dirtyGameObjects.clear();
    this.terrainGrid.markNonDirty();
    this.rememberedTerrainGrid.markNonDirty();
  }
}

module.exports = new World();

},{"./assert.js":2,"./database.js":4,"./htmlutil.js":8,"./indexutil.js":11,"./permissive-fov.js":16,"./pickle.js":17,"./pqueue.js":18,"./terrain-grid.js":20,"./terrain.js":21}]},{},[10]);
