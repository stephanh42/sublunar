'use strict';

const GameViewer = require('./gameviewer.js');

const canvas = document.getElementById('theCanvas');
const messageArea = document.getElementById('messageArea');
const statusArea = document.getElementById('statusArea');
const gameViewer = new GameViewer(canvas, messageArea, statusArea);
gameViewer.redrawOnWindowResize();
gameViewer.redraw().then(console.log, console.error);
