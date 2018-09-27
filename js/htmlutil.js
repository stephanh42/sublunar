'use strict';

function makeElement(type, className, text, color) {
  const span = document.createElement(type);
  if (className) {
    span.className = className;
  }
  span.style.color = color;
  span.appendChild(document.createTextNode(text));
  return span;
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

exports.makeElement = makeElement;
exports.makeSpan = makeSpan;
exports.removeAllChildren = removeAllChildren;
exports.goodColor = '#00ff00';
exports.badColor = '#ff0000';
exports.neutralColor = 'white';
