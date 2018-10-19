'use strict';

function makeElement(type, className, text, color) {
  const span = document.createElement(type);
  if (className) {
    span.className = className;
  }
  if (color) {
    span.style.color = color;
  }
  if (text) {
    span.appendChild(document.createTextNode(text));
  }
  return span;
}

function wrapTableCell(node) {
  const tableCell = makeElement('td');
  tableCell.appendChild(node);
  return tableCell;
}

function makeSpan(...args) {
  return makeElement('span', ...args);
}

function removeAllChildren(element) {
  let last;
  while ((last = element.lastChild)) {
    element.removeChild(last);
  }
}

let lastId = 0;

function freshId() {
  const result = 'id' + lastId;
  lastId++;
  return result;
}

exports.makeElement = makeElement;
exports.makeSpan = makeSpan;
exports.wrapTableCell = wrapTableCell;
exports.removeAllChildren = removeAllChildren;
exports.freshId = freshId;
exports.goodColor = '#00ff00';
exports.badColor = '#ff0000';
exports.neutralColor = 'white';
exports.helpColor = '#7f7fff';
