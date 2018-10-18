'use strict';

function toTitleCase(str) {
  if (str === '') {
    return str;
  } else {
    return str[0].toUpperCase() + str.slice(1);
  }
}

const vowels = new Set('aeiou');

function aOrAn(str) {
  return vowels.has(str[0]) ? 'an' : 'a';
}

exports.toTitleCase = toTitleCase;
exports.aOrAn = aOrAn;
