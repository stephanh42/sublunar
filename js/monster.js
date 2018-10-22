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
