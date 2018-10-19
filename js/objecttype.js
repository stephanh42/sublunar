'use strict';

module.exports = [
  {
    name: 'money bag',
    imageName: 'moneybag'
  },
  {
    name: 'submarine',
    maxHp: 20,
    maxDepth: 10,
    hpRecovery: 1 / 12,
    meleeVerb: 'rams'
  },
  {
    name: 'Selenian submarine',
    imageName: 'selenian-sub',
    maxHp: 15,
    maxDepth: 12,
    hpRecovery: 1 / 20,
    meleeVerb: 'rams',
    torpedoRate: 0.1,
    frequency: 5,
    moneyDrop: {probability: 0.8, min: 1, max: 5}
  },
  {
    name: 'squid',
    baseDelay: 12,
    maxHp: 12,
    frequency: 10,
    alive: true,
    moneyDrop: {probability: 0.5, min: 1, max: 3}
  },
  {
    name: 'torpedo',
    maxHp: 5,
    baseDelay: 4,
    hpRecovery: 0,
    meleeVerb: 'explodes at',
    isBlocking: false,
    kamikaze: true
  }
];
