'use strict';

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
  const factor = newSize/origSize;
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

exports.loadImage = loadImage;
exports.loadImageSizes = loadImageSizes;
