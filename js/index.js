'use strict';

const GameViewer = require('./gameviewer.js');

const gameViewer = new GameViewer();
gameViewer.redrawOnWindowResize();
gameViewer.redraw().then(console.log, console.error);
