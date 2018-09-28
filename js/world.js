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

const gameVersion = 7;

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
      airDuration: this.airDuration
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
