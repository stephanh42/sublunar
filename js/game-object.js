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
    const mask = 1 << bit;
    return (this.flags & mask) === mask;
  }

  setFlag(bit, flag) {
    const mask = 1 << bit;
    this.flags = flag ? this.flags | mask : this.flags & ~mask;
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
