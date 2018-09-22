'use strict';

const pqueue = require('./pqueue.js');
const {getIdFromXY} = require('./indexutil.js');

class PathNode {
  constructor(heuristic, cost, order, x, y, previous) {
    this.time = heuristic + cost;
    this.cost = cost;
    this.order = order;
    this.x = x;
    this.y = y;
    this.previous = previous;
  }
}

class PathFinder {
  constructor(x0, y0, x1, y1) {
    this.incomplete = true;
    this.found = false;
    this.currentNode = null;

    this.x1 = x1;
    this.y1 = y1;
    this.closedSet = new Set();
    this.openSet = [];

    this.addOpenSet(0, x0, y0, null);
  }

  cost() {
    return 1;
  }

  isPassable() {
    return true;
  }

  isPassableOrDestination(x, y) {
    return ((x === this.x1) && (y === this.y1)) || this.isPassable(x, y);
  }

  addOpenSet(cost, x, y, previous=null) {
    const dx = x - this.x1;
    const dy = y - this.y1;
    const heuristic = Math.max(Math.abs(dx), Math.abs(dy));
    const order = dx*dx + dy*dy; // use Euclidian norm to break ties
    pqueue.insert(this.openSet, new PathNode(heuristic, cost, order, x, y, previous));
  }

  runStep() {
    if (this.openSet.length === 0) {
      this.incomplete = false;
      if (!this.found) {
        this.currentNode = null;
      }
      return;
    }
    const currentNode = pqueue.remove(this.openSet);
    const x = currentNode.x;
    const y = currentNode.y;
    const xy = getIdFromXY(x, y);
    if (this.closedSet.has(xy)) {
      return;
    }
    this.currentNode = currentNode;
    if ((x === this.x1) && (y === this.y1)) {
      this.openSet = [];
      this.incomplete = false;
      this.found = true;
      return;
    }
    this.closedSet.add(xy);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if ((dx === 0) && (dy === 0)) {
          continue;
        }
        const x2 = x + dx;
        const y2 = y + dy;
        const xy2 = getIdFromXY(x2, y2);
        if (this.closedSet.has(xy2) || !this.isPassableOrDestination(x2, y2)) {
          continue;
        }
        const newCost = currentNode.cost + this.cost(x2, y2);
        this.addOpenSet(newCost, x2, y2, currentNode);
      }
    }
  }

  run() {
    while (this.incomplete) {
      this.runStep();
    }
  }

  runN(n) {
    while (this.incomplete && (n > 0)) {
      this.runStep();
      n--;
    }
  }

  getPath() {
    const result = [];
    let node = this.currentNode;
    while (node) {
      result.push([node.x, node.y]);
      node = node.previous;
    }
    result.reverse();
    return result;
  }
}

module.exports = PathFinder;
