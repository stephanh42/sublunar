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
    assert(!this.waiting, 'Monster is waiting');
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

  async doDamage(hp, deadMessage) {
    const newHp = Math.max(0, this.getHp() - hp);
    this.baseHp = newHp;
    this.baseHpTime = world.time;
    this.markDirty();
    if (newHp === 0) {
      this.dead = true;
      if (this.isPlayer()) {
        if (deadMessage) {
          world.ui.message(deadMessage, 'red');
        }
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
    assert(!this.waiting, 'Monster is waiting, cannot attack');
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

  async checkDepth() {
    assert(this.isPlayer(), 'Non-player checks depth');
    const maxDepth = this.monsterType.maxDepth;
    const depth = this.y;
    const badLuck = Math.min(1, Math.max(0, depth- maxDepth)/maxDepth);
    if (Math.random() < badLuck) {
      const hp = randomRange(1, 3);
      world.ui.message('The hull creaks ominously under the enormous pressure.', 'red', hp);
      await this.doDamage(hp, 'A sudden rush of water enters the vessel.');
    }
    this.schedule(randomRange(5, 10), 'checkDepth');
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
