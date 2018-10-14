'use strict';

const world = require('./world.js');
const {SelectionEventHandler} = require('./event-handler.js');
const {
  removeAllChildren,
  goodColor,
  badColor,
  makeSpan,
  makeElement
} = require('./htmlutil.js');
const {colorFromFraction, airColors} = require('./imgutil.js');

class Message {
  constructor(message, color, hp) {
    this.message = message;
    this.color = color;
    this.repeat = 1;
    this.hp = hp;
  }

  makeElement() {
    const div = makeElement('div', 'message-span', this.message, this.color);
    if (this.repeat > 1) {
      const span2 = makeSpan(null, ` [${this.repeat}x]`, 'white');
      div.appendChild(span2);
    }
    if (this.hp !== 0) {
      const span2 = makeSpan(null, ` (${this.hp} HP)`, 'yellow');
      div.appendChild(span2);
    }
    return div;
  }

  tryCombine(otherMessage) {
    if (!otherMessage) {
      return false;
    }
    if (
      this.message === otherMessage.message &&
      this.color === otherMessage.color
    ) {
      this.repeat += otherMessage.repeat;
      this.hp += otherMessage.hp;
      return true;
    } else {
      return false;
    }
  }
}

class StatusArea {
  constructor(statusArea) {
    this.statusArea = statusArea;
    this.state = null;
  }

  static getState() {
    const player = world.player;
    if (player) {
      return {
        hp: player.getHp(),
        maxHp: player.monsterType.maxHp,
        dead: player.dead,
        depth: player.y,
        maxDepth: player.monsterType.maxDepth,
        airPercentage: world.airPercentage(),
        money: world.money
      };
    } else {
      return null;
    }
  }

  static isStateEqual(state1, state2) {
    if (state1 === state2) {
      return true;
    }
    if (state1 === null || state2 === null) {
      return false;
    }
    for (const [k, v] of Object.entries(state2)) {
      if (state1[k] !== v) {
        return false;
      }
    }
    return true;
  }

  addDiv(...args) {
    this.statusArea.appendChild(makeElement('div', 'status-span', ...args));
  }

  update() {
    const state = StatusArea.getState();
    if (StatusArea.isStateEqual(this.state, state)) {
      return;
    }
    this.state = state;
    const statusArea = this.statusArea;
    removeAllChildren(statusArea);
    if (state === null) {
      return;
    }
    const hpColor = colorFromFraction(state.hp / state.maxHp);
    this.addDiv(`HP: ${state.hp}/${state.maxHp}`, hpColor);
    const depthColor = state.depth <= state.maxDepth ? goodColor : badColor;
    this.addDiv(`Depth: ${state.depth}/${state.maxDepth}`, depthColor);
    this.addDiv(
      `Air: ${state.airPercentage}%`,
      colorFromFraction(state.airPercentage / 100, airColors)
    );
    this.addDiv(`Money: ${state.money}`);
    if (state.dead) {
      this.addDiv('Dead', badColor);
    }
  }
}

class UserInterface {
  constructor(gameViewer) {
    const messageArea = document.getElementById('messageArea');
    const statusArea = document.getElementById('statusArea');
    const questionArea = document.getElementById('questionArea');

    this.gameViewer = gameViewer;
    this.messageArea = messageArea;
    this.questionArea = questionArea;
    this.statusArea = new StatusArea(statusArea);
    this.lastMessage = null;
    messageArea.addEventListener('click', () => this.clearMessageArea());
    questionArea.addEventListener('click', () => this.clearQuestionArea());
  }

  redraw() {
    return this.gameViewer.redraw();
  }

  async selectTile(message) {
    const player = world.player;
    if (!player || player.dead) {
      return null;
    }
    const selectHandler = new SelectionEventHandler(
      this.gameViewer,
      player.x,
      player.y,
      message
    );
    this.gameViewer.eventHandlers.push(selectHandler);
    let result = null;
    try {
      result = await selectHandler.resultPromise;
    } finally {
      this.gameViewer.eventHandlers.pop();
      this.clearQuestionArea();
      this.redraw();
    }
    return result;
  }

  async animate(animation) {
    if (animation.isTrivial()) {
      return;
    }
    const gameViewer = this.gameViewer;
    gameViewer.animation = animation;
    await gameViewer.animateUntil(animation.endTime());
    gameViewer.animation = null;
  }

  now() {
    return performance.now();
  }

  message(message, color = 'white', hp = 0) {
    const msg = new Message(message, color, hp);
    if (msg.tryCombine(this.lastMessage)) {
      this.messageArea.removeChild(this.messageArea.lastChild);
    }
    this.messageArea.appendChild(msg.makeElement());
    this.lastMessage = msg;
  }

  clearMessageArea() {
    removeAllChildren(this.messageArea);
    this.lastMessage = null;
  }

  questionAreaMessage(message, color = 'white') {
    this.questionArea.appendChild(
      makeElement('div', 'message-span', message, color)
    );
  }

  clearQuestionArea() {
    removeAllChildren(this.questionArea);
  }

  updateStatusArea() {
    this.statusArea.update();
  }
}

module.exports = UserInterface;
