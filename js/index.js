'use strict';

const GameViewer = require('./gameviewer.js');

const canvas = document.getElementById('theCanvas');
const messageArea = document.getElementById('messageArea');
const gameViewer = new GameViewer(canvas, messageArea);
gameViewer.redrawOnWindowResize();
gameViewer.redraw().then(console.log, console.error);
