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
