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
