'use strict';

const permissiveFov = require("./permissive-fov.js");
const fovTree = permissiveFov.fovTree.children();
const pqueue = require('./pqueue.js');
const database = require('./database.js');
const {getIdFromXY, getXFromId, getYFromId} = require('./indexutil.js');
const {pickle, unpickle} = require('./pickle.js');
const assert = require('./assert.js');

const {terrainTypes, terrainList} = require('./terrain.js');

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

const dummyPromise = Promise.resolve();

class DummyUserInterface {
  redraw() { return dummyPromise; }
  animate() { return dummyPromise; }
  now() { return 0.0; }
}

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

const gameVersion = 4;

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
    this.ui = new DummyUserInterface();
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
    for (const obj of this.getGameObjects(x, y)) {
      if (obj.isMonster) {
        return obj;
      }
    }
    return undefined;
  }

  isPassable(x, y) {
    if (!this.getTerrain(x, y).passable) {
      return false;
    }
    for (const gameObject of this.getGameObjects(x, y)) {
      if (!gameObject.passable) {
        return false;
      }
    }
    return true;
  }

  tryPlayerMove(dx, dy) {
    const player = this.player;
    if (!player) {
      return dummyPromise;
    }
    const xnew = dx + player.x;
    const ynew = dy + player.y;
    if (this.isPassable(xnew, ynew)) {
      return player.doMove(dx, dy);
    } else {
      const monster = this.getMonster(xnew, ynew);
      if (monster) {
        return player.doAttack(monster);
      } else {
        return dummyPromise;
      }
    }
  }

  async runSchedule() {
    const player = this.player;
    const schedule = this.schedule;
    while (player.waiting) {
      const action = pqueue.remove(schedule);
      assert(action);
      this.time = action.time;
      const object = action.object;
      if (object && object.isPlaced) {
        await object[action.action].call(object);
      }
    }
  }

  resolveReference(ref) {
    if (ref) {
      return this.getGameObjects(ref[0], ref[1])[ref[2]];
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
      const transaction = this.database.transaction(database.objectStores, 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));
      transaction.oncomplete = () => { this.markNonDirty(); resolve(); };
      if (clearAll) {
        for (const objectStore of database.objectStores) {
          transaction.objectStore(objectStore).clear();
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
