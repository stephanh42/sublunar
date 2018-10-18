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

  aName() {
    if (this.money === 1) {
      return 'a single zorkmid';
    } else {
      return this.money + ' zorkmids';
    }
  }
}

registerClass(GameObject, 10);
registerClass(MoneyBag, 30);

exports.GameObject = GameObject;
exports.MoneyBag = MoneyBag;
