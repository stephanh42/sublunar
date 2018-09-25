(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function lerp(s, x0, x1) {
  return (1-s)*x0 + s*x1;
}

const identity = x => x;
const bump = x => 4*x*(1-x);

class State {
  constructor(time, x, y, opacity=1) {
    this.time = time;
    this.x = x;
    this.y = y;
    this.opacity = opacity;
  }

  interpolate(otherState, time, sfunc) {
    let s = (time - this.time)/(otherState.time - this.time);
    s = sfunc(Math.max(0, Math.min(1, s)));
    return new State(time,
        lerp(s, this.x, otherState.x),
        lerp(s, this.y, otherState.y),
        lerp(s, this.opacity, otherState.opacity));
  }
}

class ObjectAnimation {
  constructor(gameObject, beginState, endState, {sfunc=identity, animatePlayer=true}={}) {
    this.gameObject = gameObject;
    this.beginState = beginState;
    this.endState = endState;
    this.sfunc = sfunc;
    this.animatePlayer = animatePlayer;
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

class AssertionError extends Error {
}

function assert(check, message='Invalid assertion') {
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

  async load() {
  }

  redraw() {
    if (this.drawPromise === null) {
      this.drawPromise = this.loadPromise.then(() =>
          new Promise((resolve, reject) =>
            window.requestAnimationFrame((time) => {
              this.drawPromise = null;
              try {
                this.basicDraw(time);
                resolve(time);
              } catch (exc) {
                reject(exc);
              }
              })));
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
    const width = (canvas.clientWidth * this.dpi)|0;
    const height = (canvas.clientHeight * this.dpi)|0;
    if ((width !== canvas.width) || (height !== canvas.height)) {
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
      (evt.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
      (evt.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
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


class BlockedEventHandler {
  isActive() { return false; }

  onkeydown() {}
  onclick() {}
}

class ActiveEventHandler {
  constructor(canvasViewer) {
    this.canvasViewer = canvasViewer;
  }

  isActive() { return true; }

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

    const tileX = Math.floor((x - cx)/fullTileSize);
    const tileY = Math.floor((y - cy)/fullTileSize);
    if ((Math.abs(tileX) <= 1) && (Math.abs(tileY) <= 1) && ((tileX !== 0) || (tileY !== 0))) {
      canvasViewer.playerMove(tileX, tileY);
    }
  }
}

exports.blockedEventHandler = new BlockedEventHandler();
exports.ActiveEventHandler = ActiveEventHandler;

},{}],6:[function(require,module,exports){
'use strict';

const world = require('./world.js');
const pqueue = require('./pqueue.js');
const {getIdFromXY} = require('./indexutil.js');
const {registerClass} = require('./pickle.js');
const assert = require('./assert.js');

class GameObject {
  constructor() {
    this.flags = 0;
    this.x = 0;
    this.y = 0;
  }

  getFlag(bit) {
    const mask = 1<<bit;
    return (this.flags & mask) === mask;
  }

  setFlag(bit, flag) {
    const mask = 1<<bit;
    this.flags = flag ? (this.flags | mask) : (this.flags & ~mask);
  }

  get isPlaced() { return this.getFlag(0); }
  set isPlaced(flag) { this.setFlag(0, flag); }

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

  markDirty() {
    if (this.isPlaced) {
      world.dirtyGameObjects.add(getIdFromXY(this.x, this.y));
    }
  }

  updateIfPlayer() {
    if (this === world.player) {
      world.updateVisible();
      world.ui.updateStatusArea();
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
    return this.isMonster();
  }
}

registerClass(GameObject, 10);

module.exports = GameObject;

},{"./assert.js":2,"./indexutil.js":11,"./pickle.js":17,"./pqueue.js":18,"./world.js":24}],7:[function(require,module,exports){
'use strict';

const CanvasViewer = require('./canvasviewer.js');
const terrain = require('./terrain.js');
const Monster = require('./monster.js');

const database = require('./database.js');
const world = require('./world.js');
const newgame = require('./newgame.js');
const {makeSpan, removeAllChildren} = require('./htmlutil.js');
const {ActiveEventHandler, blockedEventHandler} = require('./event-handler.js');
const assert = require('./assert.js');

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
      return {
        hp: player.getHp(),
        maxHp: player.monsterType.maxHp,
        dead: player.dead,
        depth: player.y,
        maxDepth: player.monsterType.maxDepth
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
    let hpColor = 'chartreuse';
    for (const [limit, color] of [[0.25, 'red'], [0.5, 'orange'], [0.75, 'yellow']]) {
      if (state.hp <= limit * state.maxHp) {
        hpColor = color;
        break;
      }
    }
    this.addSpan('status-span', `HP: ${state.hp}/${state.maxHp}`, hpColor);
    const depthColor = (state.depth <= state.maxDepth) ? 'chartreuse' : 'red';
    this.addSpan('status-span', `Depth: ${state.depth}/${state.maxDepth}`, depthColor);
    if (state.dead) {
      this.addSpan('status-span', 'Dead', 'red');
    }
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
    this.ui.clearMessageArea();
    return this.handlePromise(world.tryPlayerMove(dx, dy));
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

},{"./assert.js":2,"./canvasviewer.js":3,"./database.js":4,"./event-handler.js":5,"./htmlutil.js":8,"./monster.js":12,"./newgame.js":14,"./terrain.js":21,"./world.js":24}],8:[function(require,module,exports){
'use strict';

function makeSpan(className, text, color) {
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.style.color = color;
  span.appendChild(document.createTextNode(text));
  return span;
}

function removeAllChildren(element) {
  let last;
  while ((last = element.lastChild)) {
    element.removeChild(last);
  }
}

exports.makeSpan = makeSpan;
exports.removeAllChildren = removeAllChildren;

},{}],9:[function(require,module,exports){
'use strict';

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
  const factor = newSize/origSize;
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

exports.loadImage = loadImage;
exports.loadImageSizes = loadImageSizes;

},{}],10:[function(require,module,exports){
'use strict';

const GameViewer = require('./gameviewer.js');

const canvas = document.getElementById('theCanvas');
const messageArea = document.getElementById('messageArea');
const statusArea = document.getElementById('statusArea');
const gameViewer = new GameViewer(canvas, messageArea, statusArea);
gameViewer.redrawOnWindowResize();
gameViewer.redraw().then(console.log, console.error);

},{"./gameviewer.js":7}],11:[function(require,module,exports){
'use strict';

const xyMask = (1<<16)-1;

exports.getIdFromXY = (x, y) => (x << 16) | (y & xyMask);
exports.getXFromId = xy => (xy >> 16);
exports.getYFromId = xy => ((xy << 16) >> 16);

},{}],12:[function(require,module,exports){
'use strict';

const {loadImageSizes} = require('./imgutil.js');
const {awaitPromises} = require('./terrain.js');
const {registerClass} = require('./pickle.js');
const {randomInt, randomRange} = require('./randutil.js');
const GameObject = require('./game-object.js');
const world = require('./world.js');
const animation = require('./animation.js');
const PathFinder = require('./path-finder.js');
const {toTitleCase} = require('./textutil.js');
const assert = require('./assert.js');

const monsterTypes = {};
const monsterList = [];
const dummyPromise = Promise.resolve();

function makeMonsterType(id, json) {
  const result = {
   id: id,
   baseDelay: 6,
   intelligence: 10,
   hpRecovery: 1/24,
   maxDepth: Infinity,
   images: null
  };
  Object.assign(result, json);
  result.imageName = result.imageName || result.name;
  return result;
}

for (const json of require('./monstertype.js')) {
  const monsterObj = makeMonsterType(monsterList.length, json);
  monsterList.push(monsterObj);
  monsterTypes[monsterObj.name] = monsterObj;
}

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

class MonsterPathFinder extends PathFinder {
  constructor(x0, y0, x1, y1, monster) {
    super(x0, y0, x1, y1);
    this.monster = monster;
  }

  isPassable(x, y) {
    return this.monster.isPassable(x, y);
  }
}

class Monster extends GameObject {
  constructor(monsterType) {
    super();
    this.monsterType = monsterType;
    this.baseHp = monsterType ? monsterType.maxHp : 0;
    this.baseHpTime = 0;
    this.direction = (randomInt(2) === 0);
  }

  get waiting() { return this.getFlag(1); }
  set waiting(flag) { this.setFlag(1, flag); }

  get direction() { return this.getFlag(2); }
  set direction(flag) { this.setFlag(2, flag); }

  get dead() { return this.getFlag(3); }
  set dead(flag) { this.setFlag(3, flag); }

  pickleData() {
    const json = super.pickleData();
    json.mt = this.monsterType.id;
    json.hp = this.baseHp;
    json.hpTime = this.baseHpTime;
    return json;
  }

  unpickleData(json) {
    super.unpickleData(json);
    this.monsterType = monsterList[json.mt];
    this.baseHp = json.hp;
    this.baseHpTime = json.hpTime;
  }

  getHp() {
    if (this.dead) {
      return 0;
    }
    const dt = world.time - this.baseHpTime;
    const hp = (this.baseHp + dt * this.monsterType.hpRecovery)|0;
    return Math.max(0, Math.min(this.monsterType.maxHp, hp));
  }

  theName() {
    const name = this.monsterType.name;
    if (this.isPlayer()) {
      return 'your ' + name;
    } else {
      return 'the ' + name;
    }
  }

  draw(ctx, x, y, tileSize) {
    const img = this.monsterType.images.get(tileSize);
    drawImageDirection(ctx, img, x, y, this.direction);
  }

  sleep(deltaTime) {
    this.waiting = true;
    this.schedule(deltaTime, "wakeUp");
  }

  updateSeen() {
    if (!this.waiting && !this.isPlayer()) {
      this.sleep(0);
    }
  }

  setDirection(dx) {
    if (dx !== 0) {
      this.direction = (dx > 0);
      this.markDirty();
    }
  }

  doMove(dx, dy) {
    assert(!this.waiting);
    const xold = this.x;
    const yold = this.y;
    const xnew = xold + dx;
    const ynew = yold + dy;
    const oldVisible = world.isVisible(xold, yold);
    this.basicMove(xnew, ynew);
    this.sleep(this.monsterType.baseDelay);
    const newVisible = world.isVisible(xnew, ynew);
    this.setDirection(dx);
    if (oldVisible || newVisible) {
      const time = world.ui.now();
      return world.ui.animate(
          new animation.ObjectAnimation(
            this,
            new animation.State(time, xold, yold, oldVisible|0),
            new animation.State(time+100, xnew, ynew, newVisible|0)));
    } else {
      return dummyPromise;
    }
  }

  async doDamage(hp) {
    const newHp = Math.max(0, this.getHp() - hp);
    this.baseHp = newHp;
    this.baseHpTime = world.time;
    this.markDirty();
    if (newHp === 0) {
      this.dead = true;
      if (this.isPlayer()) {
        world.ui.message('You die.', 'red');
        world.ui.updateStatusArea();
      } else {
        if (world.isVisible(this.x, this.y)) {
          const time = world.ui.now();
          await world.ui.animate(
              new animation.ObjectAnimation(
                this,
                new animation.State(time, this.x, this.y, 1),
                new animation.State(time+100, this.x, this.y, 0)));
          world.ui.message(`${toTitleCase(this.theName())} dies.`);
        }
        this.basicUnplace();
      }
    }
  }

  async doAttack(victim) {
    assert(!this.waiting);
    const oldVisible = world.isVisible(this.x, this.y);
    const newVisible = world.isVisible(victim.x, victim.y);
    const hp = randomRange(1, 4);
    this.setDirection(victim.x - this.x);
    this.sleep(this.monsterType.baseDelay);
    if (oldVisible || newVisible) {
      const time = world.ui.now();
      world.ui.message(`${toTitleCase(this.theName())} attacks ${victim.theName()}.`,
          this.isPlayer() ? 'chartreuse' : 'red', hp);
      await world.ui.animate(
          new animation.ObjectAnimation(
            this,
            new animation.State(time, this.x, this.y, oldVisible|0),
            new animation.State(time+100, victim.x, victim.y, newVisible|0),
            {sfunc: animation.bump, animatePlayer: false}));
    }
    return victim.doDamage(hp);
  }

  isPlayer() {
    return this === world.player;
  }

  isPassable(x, y) {
    return world.isPassable(x, y);
  }

  target() {
    const player = world.player;
    if (player.isPlaced && !player.dead) {
      return player;
    } else {
      return null;
    }
  }

  async wakeUp() {
    this.waiting = false;
    if (!this.isPlayer()) {
      const target = this.target();
      if (target) {
        const pf = new MonsterPathFinder(this.x, this.y, target.x, target.y, this);
        pf.runN(this.monsterType.intelligence);
        const path = pf.getPath();
        if (path.length >= 2) {
          const [x2, y2] = path[1];
          if (this.isPassable(x2, y2)) {
            return this.doMove(x2 - this.x, y2 - this.y);
          } else if (world.getGameObjects(x2, y2).includes(target)) {
            return this.doAttack(target);
          }
        }
      }
    }
  }

  static loadImages() {
    const promises = [];
    for (const monster of monsterList) {
      if (monster.imageName) {
        promises.push(loadImageSizes('img/' + monster.imageName).then(imgs => { monster.images = imgs; }));
      }
    }
    return awaitPromises(promises);
  }

  isMonster() {
    return !this.dead;
  }
}

Monster.monsterTypes = monsterTypes;
Monster.monsterList = monsterList;

registerClass(Monster, 20);

module.exports = Monster;

},{"./animation.js":1,"./assert.js":2,"./game-object.js":6,"./imgutil.js":9,"./monstertype.js":13,"./path-finder.js":15,"./pickle.js":17,"./randutil.js":19,"./terrain.js":21,"./textutil.js":23,"./world.js":24}],13:[function(require,module,exports){
'use strict';

module.exports = [
{
  name: 'submarine',
  maxHp: 20,
  maxDepth: 10
},
{
  name: 'squid',
  baseDelay: 12,
  maxHp: 12
}
];

},{}],14:[function(require,module,exports){
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
      if (world.isPassable(x, y) && (Math.random() < 0.01)) {
        (new Monster(Monster.monsterTypes.squid)).basicMove(x, y);
      }
    }
    for (;;) {
      const [xn, yn] = randomStep(x, y);
      if ((yn >= 0) && (yn < 10)) {
        x = xn; y = yn; break;
      }
    }
  }
}

function newGame() {
  world.reset();
  randomWalk(1000);
  const player = new Monster(Monster.monsterTypes.submarine);
  world.player = player;
  player.basicMove(0, 0);
  return world;
}

module.exports = newGame;

},{"./monster.js":12,"./randutil.js":19,"./terrain.js":21,"./world.js":24}],15:[function(require,module,exports){
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
    return ((x === this.x1) && (y === this.y1)) || this.isPassable(x, y);
  }

  addOpenSet(cost, x, y, previous=null) {
    const dx = x - this.x1;
    const dy = y - this.y1;
    const heuristic = Math.max(Math.abs(dx), Math.abs(dy));
    const order = dx*dx + dy*dy; // use Euclidian norm to break ties
    pqueue.insert(this.openSet, new PathNode(heuristic, cost, order, x, y, previous));
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
    if ((x === this.x1) && (y === this.y1)) {
      this.openSet = [];
      this.incomplete = false;
      this.found = true;
      return;
    }
    this.closedSet.add(xy);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if ((dx === 0) && (dy === 0)) {
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
    while (this.incomplete && (n > 0)) {
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
    return this.a*x + this.b - y;
  }

  zeroCrossing(s1, otherRay, s2) {
    return new Ray(
      zeroCrossing(this.a, s1, otherRay.a, s2),
      zeroCrossing(this.b, s1, otherRay.b, s2));
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
      if (previousRay &&
          (((previousS < 0) && (s > 0)) || ((previousS > 0) && (s < 0)))) {
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
    return {negative: new Beam(hasNegative ? negativeRays: []),
            zero: new Beam(zeroRays),
            positive: new Beam(hasPositive ? positiveRays : [])
    };
  }
}

const initialBeam = new Beam([
  new Ray(0, 0.5),
  new Ray(0, -0.5),
  new Ray(1, -1),
  new Ray(1, 1)
], true);

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
      const splitBeams = this._beam.splitPoint(x+0.5, y+0.5);
      this._addChild(0, 1,
          splitBeams.positive.splitPoint(x-0.5, y+0.5).negative);
      this._addChild(1, 1, splitBeams.zero);
      this._addChild(1, 0,
          splitBeams.negative.splitPoint(x+0.5, y-0.5).positive);
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
  assert(classIdToConstructor.get(classId) === undefined, 'Class ID already in use');
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

exports.registerClass = registerClass;
exports.pickle = pickle;
exports.unpickle = unpickle;

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
  return (time1 < time2) || ((time1 === time2) && (obj1.order < obj2.order));
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
    const child1 = 2*pos+1;
    const child2 = 2*pos+2;
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

function test(N=10) {
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
  return (Math.random() * n)|0;
}

function randomStep(x=0, y=0) {
  switch (randomInt(4)) {
    case 0: x++; break;
    case 1: y++; break;
    case 2: x--; break;
    case 3: y--; break;
  }
  return [x, y];
}

function randomRange(lo, hi) {
  const n = hi - lo;
  const nhalf = n>>1;
  return lo + randomInt(nhalf+1) + randomInt(n-nhalf+1);
}

exports.randomInt = randomInt;
exports.randomStep = randomStep;
exports.randomRange = randomRange;

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
      promises.push(loadImageSizes('img/' + terrain.imageName).then(imgs => { terrain.images = imgs; }));
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

exports.toTitleCase = toTitleCase;

},{}],24:[function(require,module,exports){
'use strict';

const permissiveFov = require("./permissive-fov.js");
const fovTree = permissiveFov.fovTree.children();
const pqueue = require('./pqueue.js');
const database = require('./database.js');
const {getIdFromXY, getXFromId, getYFromId} = require('./indexutil.js');
const {pickle, unpickle} = require('./pickle.js');
const assert = require('./assert.js');

const {terrainTypes} = require('./terrain.js');
const TerrainGrid = require('./terrain-grid.js');

const emptyArray = [];

function getReference(gameObj) {
  return gameObj ? gameObj.getReference() : null;
}

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

const gameVersion = 6;

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
        let x = tree.x; let y = tree.y;
        if (t & 1) { x = -x; }
        if (t & 2) { y = -y; }
        if (t & 4) {
          const tmp = x;
          x = y; y = tmp;
        }
        x += px; y += py;
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

  isPassable(x, y) {
    if (!this.getTerrain(x, y).passable) {
      return false;
    }
    for (const gameObject of this.getGameObjects(x, y)) {
      if (gameObject.isBlocking()) {
        return false;
      }
    }
    return true;
  }

  async tryPlayerMove(dx, dy) {
    const player = this.player;
    if (!player) {
      return;
    }
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
      this.time = action.time;
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
      player: getReference(this.player)
    };
  }

  setGlobalData(json) {
    this.visible = json.visible;
    this.time = json.time;
    this.scheduleOrder = json.scheduleOrder;
    this.schedule = json.schedule.map(action => this.unpickleAction(action));
    this.player = this.resolveReference(json.player);
  }

  saveGame({clearAll=false}={}) {
    return new Promise((resolve, reject) => {
      const dead = this.player && this.player.dead;
      const transaction = this.database.transaction(database.objectStores, 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));
      transaction.oncomplete = () => { this.markNonDirty(); resolve(); };
      if (clearAll || dead) {
        for (const objectStore of database.objectStores) {
        transaction.objectStore(objectStore).clear();
        }
        if (dead) { return; }
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
      this.rememberedTerrainGrid.saveDirty(transaction.objectStore('remembered-terrain'));
    });
  }

  tryLoadGame() {
    return new Promise((resolve, reject) => {
      this.reset();
      const transaction = this.database.transaction(database.objectStores, 'readonly');
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
      this.rememberedTerrainGrid.load(transaction.objectStore('remembered-terrain'));

      transaction.objectStore('game-objects').openCursor().onsuccess = event => {
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
            if (result && (result.version === gameVersion)) {
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

},{"./assert.js":2,"./database.js":4,"./indexutil.js":11,"./permissive-fov.js":16,"./pickle.js":17,"./pqueue.js":18,"./terrain-grid.js":20,"./terrain.js":21}]},{},[10]);
