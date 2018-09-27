'use strict';

function zeroCrossing(x1, y1, x2, y2) {
  const dy = y1 - y2;
  return x2 * (y1 / dy) - x1 * (y2 / dy);
}

class Ray {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }

  atPoint(x, y) {
    return this.a * x + this.b - y;
  }

  zeroCrossing(s1, otherRay, s2) {
    return new Ray(
      zeroCrossing(this.a, s1, otherRay.a, s2),
      zeroCrossing(this.b, s1, otherRay.b, s2)
    );
  }
}

class Beam {
  constructor(rays) {
    this.rays = rays;
  }

  isEmpty() {
    return this.rays.length === 0;
  }

  splitPoint(x, y) {
    const negativeRays = [];
    const zeroRays = [];
    const positiveRays = [];
    let hasNegative = false;
    let hasPositive = false;

    let previousRay = null;
    let previousS = 0.0;
    if (this.rays.length >= 3) {
      previousRay = this.rays[this.rays.length - 1];
      previousS = previousRay.atPoint(x, y);
    }
    for (const ray of this.rays) {
      const s = ray.atPoint(x, y);
      if (
        previousRay &&
        ((previousS < 0 && s > 0) || (previousS > 0 && s < 0))
      ) {
        const splitRay = previousRay.zeroCrossing(previousS, ray, s);
        negativeRays.push(splitRay);
        zeroRays.push(splitRay);
        positiveRays.push(splitRay);
      }
      if (s < 0) {
        negativeRays.push(ray);
        hasNegative = true;
      } else if (s > 0) {
        positiveRays.push(ray);
        hasPositive = true;
      } else {
        negativeRays.push(ray);
        zeroRays.push(ray);
        positiveRays.push(ray);
      }
      previousRay = ray;
      previousS = s;
    }
    return {
      negative: new Beam(hasNegative ? negativeRays : []),
      zero: new Beam(zeroRays),
      positive: new Beam(hasPositive ? positiveRays : [])
    };
  }
}

const initialBeam = new Beam(
  [new Ray(0, 0.5), new Ray(0, -0.5), new Ray(1, -1), new Ray(1, 1)],
  true
);

class FovTree {
  constructor(x, y, beam) {
    this.x = x;
    this.y = y;
    this.distance = Math.hypot(x, y);
    this._beam = beam;
    this._children = null;
  }

  _addChild(dx, dy, beam) {
    if (!beam.isEmpty()) {
      this._children.push(new FovTree(this.x + dx, this.y + dy, beam));
    }
  }

  children() {
    if (!this._children) {
      this._children = [];
      const x = this.x;
      const y = this.y;
      const splitBeams = this._beam.splitPoint(x + 0.5, y + 0.5);
      this._addChild(
        0,
        1,
        splitBeams.positive.splitPoint(x - 0.5, y + 0.5).negative
      );
      this._addChild(1, 1, splitBeams.zero);
      this._addChild(
        1,
        0,
        splitBeams.negative.splitPoint(x + 0.5, y - 0.5).positive
      );
    }
    return this._children;
  }
}

const fovTree = new FovTree(0, 0, initialBeam);

exports.fovTree = fovTree;
