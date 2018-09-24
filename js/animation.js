'use strict';

function lerp(s, x0, x1) {
  return (1-s)*x0 + s*x1;
}

const identity = x => x;
const bump = x => 4*x*(1-x);

class State {
  constructor(time, x, y, opacity=1) {
    this.time = time;
    this.x = x;
    this.y = y;
    this.opacity = opacity;
  }

  interpolate(otherState, time, sfunc)
  {
    let s = (time - this.time)/(otherState.time - this.time);
    s = sfunc(Math.max(0, Math.min(1, s)));
    return new State(time,
        lerp(s, this.x, otherState.x),
        lerp(s, this.y, otherState.y),
        lerp(s, this.opacity, otherState.opacity));
  }
}

class ObjectAnimation {
  constructor(gameObject, beginState, endState, {sfunc=identity, animatePlayer=true}={}) {
    this.gameObject = gameObject;
    this.beginState = beginState;
    this.endState = endState;
    this.sfunc = sfunc;
    this.animatePlayer = animatePlayer;
  }

  getState(time) {
    return this.beginState.interpolate(this.endState, time, this.sfunc);
  }

  endTime() {
    return this.endState.time;
  }
}

exports.lerp = lerp;
exports.bump = bump;
exports.State = State;
exports.ObjectAnimation = ObjectAnimation;
