'use strict';

const {loadImageSizes} = require('./imgutil.js');
const {awaitPromises} = require('./terrain.js');
const {registerClass} = require('./pickle.js');
const {randomInt} = require('./randutil.js');
const GameObject = require('./game-object.js');
const world = require('./world.js');
const animation = require('./animation.js');
const PathFinder = require('./path-finder.js');
const {toTitleCase} = require('./textutil.js');
const assert = require('./assert.js');

const monsterTypes = {};
const monsterList = [];
const dummyPromise = Promise.resolve();

class MonsterType {
  constructor(id, json) {
    this.id = id;
    this.name = json.name;
    this.imageName = json.image || json.name;
    this.baseDelay = json.baseDelay || 6;
    this.intelligence = json.intelligence || 10;
    this.images = null;
  }
}

for (const json of require('./monstertype.js')) {
  const monsterObj = new MonsterType(monsterList.length, json);
  monsterList.push(monsterObj);
  monsterTypes[monsterObj.name] = monsterObj;
}

function drawImageDirection(ctx, img, x, y, direction) {
  if (direction === 1) {
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
    this.direction = 2*randomInt(2) - 1;
  }

  get waiting() { return this.getFlag(2); }
  set waiting(flag) { this.setFlag(2, flag); }

  pickleData() {
    const json = super.pickleData();
    json.mt = this.monsterType.id;
    json.dir = this.direction;
    return json;
  }

  unpickleData(json) {
    super.unpickleData(json);
    this.monsterType = monsterList[json.mt];
    this.direction = json.dir;
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
      this.direction = dx;
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

  doAttack(victim) {
    assert(!this.waiting);
    const oldVisible = world.isVisible(this.x, this.y);
    const newVisible = world.isVisible(victim.x, victim.y);
    const hp = 4 + randomInt(6);
    this.setDirection(victim.x - this.x);
    this.sleep(this.monsterType.baseDelay);
    if (oldVisible || newVisible) {
      const time = world.ui.now();
      world.ui.message(`${toTitleCase(this.theName())} attacks ${victim.theName()}.`, 
          this.isPlayer() ? 'chartreuse' : 'red', hp);
      return world.ui.animate(
          new animation.ObjectAnimation(
            this,
            new animation.State(time, this.x, this.y, oldVisible|0),
            new animation.State(time+100, victim.x, victim.y, newVisible|0),
            {sfunc: animation.bump, animatePlayer: false}));
    } else {
      return dummyPromise;
    }
  }

  isPlayer() {
    return this === world.player;
  }

  isPassable(x, y) {
    return world.isPassable(x, y);
  }

  target() {
    const player = world.player;
    if (player.isPlaced) {
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
}

Monster.monsterTypes = monsterTypes;
Monster.monsterList = monsterList;
Monster.prototype.passable = false;
Monster.prototype.isMonster = true;

registerClass(Monster, 20);

module.exports = Monster;
