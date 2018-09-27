'use strict';

module.exports = [
  {
    name: 'submarine',
    maxHp: 20,
    maxDepth: 10,
    hpRecovery: 1 / 12
  },
  {
    name: 'Selenian submarine',
    imageName: 'selenian-sub',
    maxHp: 15,
    maxDepth: 12,
    hpRecovery: 1 / 20,
    frequency: 5
  },
  {
    name: 'squid',
    baseDelay: 12,
    maxHp: 12,
    frequency: 10
  }
];
