'use strict';

function swap(pq, i, j) {
  const tmp = pq[i];
  pq[i] = pq[j];
  pq[j] = tmp;
}

function lessThan(obj1, obj2) {
  const time1 = obj1.time;
  const time2 = obj2.time;
  return time1 < time2 || (time1 === time2 && obj1.order < obj2.order);
}

function insert(pq, obj) {
  let pos = pq.length;
  pq.push(obj);

  while (pos > 0) {
    const parentPos = (pos - 1) >> 1;
    const parentObj = pq[parentPos];
    if (lessThan(obj, parentObj)) {
      swap(pq, pos, parentPos);
      pos = parentPos;
    } else {
      break;
    }
  }
}

function remove(pq) {
  if (pq.length === 0) {
    return undefined;
  } else if (pq.length === 1) {
    return pq.pop();
  }
  const result = pq[0];
  pq[0] = pq.pop();
  let pos = 0;
  const obj = pq[pos];
  for (;;) {
    const child1 = 2 * pos + 1;
    const child2 = 2 * pos + 2;
    if (child1 >= pq.length) {
      break;
    } else if (child2 >= pq.length) {
      if (lessThan(pq[child1], obj)) {
        swap(pq, pos, child1);
      }
      break;
    } else {
      const child1Obj = pq[child1];
      const child2Obj = pq[child2];
      if (!lessThan(child1Obj, obj) && !lessThan(child2Obj, obj)) {
        break;
      } else if (lessThan(child1Obj, child2Obj)) {
        swap(pq, pos, child1);
        pos = child1;
      } else {
        swap(pq, pos, child2);
        pos = child2;
      }
    }
  }
  return result;
}

function test(N = 10) {
  const input = [];
  const pq = [];
  for (let i = 0; i < N; i++) {
    const obj = { time: Math.random(), order: i };
    insert(pq, obj);
    input.push(obj);
  }
  const output = [];
  while (pq.length > 0) {
    output.push(remove(pq));
  }
  return [input, output];
}

exports.insert = insert;
exports.remove = remove;
exports.test = test;
