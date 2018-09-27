'use strict';

const objectStores = ['game', 'game-objects', 'terrain', 'remembered-terrain'];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open('SublunarGameDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = event => resolve(event.target.result);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      for (const objectStore of objectStores) {
        db.createObjectStore(objectStore);
      }
    };
  });
}

exports.objectStores = objectStores;
exports.openDatabase = openDatabase;
