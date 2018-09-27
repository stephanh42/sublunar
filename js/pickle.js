'use strict';

const assert = require('./assert.js');

const classIdSymbol = Symbol();
const classIdToConstructor = new Map();

function registerClass(constructor, classId) {
  assert(
    classIdToConstructor.get(classId) === undefined,
    'Class ID already in use'
  );
  const prototype = constructor.prototype;
  assert(prototype.pickleData, 'Class misses pickleData method');
  assert(prototype.unpickleData, 'Class misses unpickleData method');
  classIdToConstructor.set(classId, constructor);
  prototype[classIdSymbol] = classId;
}

function pickle(obj) {
  const result = obj.pickleData();
  result['class'] = obj[classIdSymbol];
  return result;
}

function unpickle(json) {
  const constructor = classIdToConstructor.get(json['class']);
  const result = new constructor();
  result.unpickleData(json);
  return result;
}

exports.registerClass = registerClass;
exports.pickle = pickle;
exports.unpickle = unpickle;
