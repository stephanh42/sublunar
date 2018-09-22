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
