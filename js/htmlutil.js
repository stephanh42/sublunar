'use strict';

function makeSpan(className, text, color) {
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.style.color = color;
  span.appendChild(document.createTextNode(text));
  return span;
}

function removeAllChildren(element) {
  let last;
  while ((last = element.lastChild)) {
    element.removeChild(last);
  }
}

exports.makeSpan = makeSpan;
exports.removeAllChildren = removeAllChildren;
