'use strict';

const {lerp} = require('./animation.js');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${url}`));
    img.src = url;
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resizeImage(img, origSize, newSize) {
  if (origSize === newSize) {
    return img;
  }

  const canvas = createCanvas(newSize, newSize);
  const ctx = canvas.getContext('2d');
  const factor = newSize / origSize;
  ctx.scale(factor, factor);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

class ScaledImage {
  constructor(im1, im2) {
    this.im1 = im1;
    this.im2 = im2;
    this.cachedImage = null;
    this.cachedImageSize = -1;
  }

  getUncached(size) {
    if (size <= this.im1.width) {
      return resizeImage(this.im1, this.im1.width, size);
    } else {
      return resizeImage(this.im2, this.im2.width, size);
    }
  }

  get(size) {
    if (this.cachedImageSize !== size) {
      this.cachedImage = this.getUncached(size);
      this.cachedImageSize = size;
    }
    return this.cachedImage;
  }
}

async function loadImageSizes(url) {
  const p1 = loadImage(url + '.png');
  const p2 = loadImage(url + '@2.png');
  return new ScaledImage(await p1, await p2);
}

function lerpColor(s, color1, color2) {
  const [r1, g1, b1] = color1;
  const [r2, g2, b2] = color2;
  const r = Math.round(lerp(s, r1, r2));
  const g = Math.round(lerp(s, g1, g2));
  const b = Math.round(lerp(s, b1, b2));
  return `rgb(${r}, ${g}, ${b}`;
}

const defaultColors = [[255, 0, 0], [255, 255, 0], [0, 255, 0]];
const airColors = [[255, 0, 255], [0, 127, 255], [0, 255, 255]];

function colorFromFraction(fraction, colors = defaultColors) {
  if (fraction < 0.5) {
    return lerpColor(2 * fraction, colors[0], colors[1]);
  } else {
    return lerpColor(2 * (fraction - 0.5), colors[1], colors[2]);
  }
}

class HealthBarDrawer {
  constructor(colors = defaultColors, vertical = false) {
    this.width = -1;
    this.height = -1;
    this.cachedImages = new Map();
    this.colors = colors;
    this.vertical = vertical;
  }

  get(width, height, healthFraction) {
    const fullBar = this.vertical ? height : width;
    const barSize = Math.round(healthFraction * (fullBar - 2));
    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.cachedImages.clear();
    }
    let img = this.cachedImages.get(barSize);
    if (!img) {
      img = createCanvas(width, height);
      const ctx = img.getContext('2d');
      ctx.fillStyle = '#303030';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = colorFromFraction(barSize / (fullBar - 2), this.colors);
      if (this.vertical) {
        ctx.fillRect(1, height - 2 - barSize, width - 2, barSize);
      } else {
        ctx.fillRect(1, 1, barSize, height - 2);
      }

      this.cachedImages.set(barSize, img);
    }
    return img;
  }
}

exports.loadImage = loadImage;
exports.loadImageSizes = loadImageSizes;
exports.colorFromFraction = colorFromFraction;
exports.HealthBarDrawer = HealthBarDrawer;
exports.airColors = airColors;
