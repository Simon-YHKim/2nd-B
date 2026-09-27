/*
 * Approved avatar treatment for the existing 64-unit rectangle layers.
 * Geometry remains on the 64 x 64 grid; colour changes happen at display size.
 */
(function (root) {
  'use strict';

  var nextId = 0;
  var GRID = 64;
  var APPROVED_TONES = {
    // The reference portrait has warm skin, charcoal hair and muted olive cloth.
    '#c98e5e': ['#dba980', '#cb9870', '#af7c57'],
    '#a86f43': ['#bb8964', '#a87550', '#906142'],
    '#dcaa7e': ['#e4b58e', '#d9a67c', '#bd8e6b'],
    '#895c3a': ['#a27757', '#8c6042', '#755037'],
    '#2b211b': ['#424042', '#2e2d2f', '#1d1c1e'],
    '#5c4a3f': ['#5d5859', '#494548', '#353235'],
    '#241c18': ['#343132', '#222022', '#171618'],
    '#221a16': ['#302d2f', '#211e20', '#151416'],
    '#f7f2e8': ['#fffefa', '#f8f6ef', '#e9e5dc'],
    '#7d9463': ['#83866a', '#707458', '#585d47'],
    '#61764e': ['#666b53', '#555b45', '#424b38'],
    '#96a97a': ['#979a7b', '#83886b', '#6b7258'],
    '#556543': ['#5c6249', '#505741', '#3e4736'],
    '#506341': ['#5c644a', '#505841', '#3d4935']
  };

  function hexToRgb(hex) {
    return [1, 3, 5].map(function (at) { return parseInt(hex.slice(at, at + 2), 16); });
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (channel) {
      return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
    }).join('');
  }

  function mix(hex, other, fraction) {
    var first = hexToRgb(hex);
    var second = hexToRgb(other);
    return rgbToHex(first.map(function (channel, at) {
      return channel + (second[at] - channel) * fraction;
    }));
  }

  function tones(color) {
    if (APPROVED_TONES[color]) return APPROVED_TONES[color];
    var channels = hexToRgb(color);
    var luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
    var lift = luminance < 65 ? 0.065 : luminance > 220 ? 0.035 : 0.115;
    var shade = luminance < 65 ? 0.14 : luminance > 220 ? 0.08 : 0.16;
    return [mix(color, '#fff0dc', lift), color, mix(color, '#211a1b', shade)];
  }

  function number(value, name) {
    if (!Number.isInteger(value)) throw new TypeError(name + ' must be an integer');
    return value;
  }

  function normalizeOp(op) {
    if (!Array.isArray(op) || op.length < 5) throw new TypeError('Each avatar operation must be [x, y, width, height, color]');
    var x = number(op[0], 'x');
    var y = number(op[1], 'y');
    var width = number(op[2], 'width');
    var height = number(op[3], 'height');
    var color = String(op[4]).toLowerCase();
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > GRID || y + height > GRID) {
      throw new RangeError('Avatar operation must fit the 64 x 64 grid');
    }
    if (!/^#[0-9a-f]{6}$/.test(color)) throw new TypeError('Avatar operation color must be #RRGGBB');
    return [x, y, width, height, color];
  }

  function render(rawOps, size) {
    if (!Array.isArray(rawOps)) throw new TypeError('Avatar operations must be an array');
    var px = size === undefined ? GRID : Number(size);
    if (!Number.isSafeInteger(px) || px < 1 || px > 4096) throw new RangeError('SVG size must be between 1 and 4096 pixels');

    var operations = rawOps.map(normalizeOp);
    var bounds = new Map();
    operations.forEach(function (op) {
      var box = bounds.get(op[4]);
      if (!box) {
        bounds.set(op[4], { left: op[0], top: op[1], right: op[0] + op[2], bottom: op[1] + op[3] });
      } else {
        box.left = Math.min(box.left, op[0]);
        box.top = Math.min(box.top, op[1]);
        box.right = Math.max(box.right, op[0] + op[2]);
        box.bottom = Math.max(box.bottom, op[1] + op[3]);
      }
    });

    var prefix = 'approved-avatar-' + (++nextId);
    var ids = new Map();
    var gradients = [];
    bounds.forEach(function (box, color) {
      var id = prefix + '-tone-' + ids.size;
      var palette = tones(color);
      ids.set(color, id);
      gradients.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + box.left + '" y1="' + box.top + '" x2="' + box.right + '" y2="' + box.bottom + '">' +
        '<stop offset="0" stop-color="' + palette[0] + '"/>' +
        '<stop offset="0.48" stop-color="' + palette[1] + '"/>' +
        '<stop offset="1" stop-color="' + palette[2] + '"/>' +
        '</linearGradient>');
    });

    var rectangles = operations.map(function (op) {
      return '<rect x="' + op[0] + '" y="' + op[1] + '" width="' + op[2] + '" height="' + op[3] + '" fill="url(#' + ids.get(op[4]) + ')"/>';
    }).join('');
    var edge = prefix + '-edge';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + px + '" height="' + px + '" shape-rendering="geometricPrecision" aria-hidden="true">' +
      '<defs>' + gradients.join('') +
      '<filter id="' + edge + '" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="0.105" result="soft"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="17" stitchTiles="stitch" result="grain"/>' +
      '<feColorMatrix in="grain" type="saturate" values="0" result="mono"/>' +
      '<feComponentTransfer in="mono" result="faint"><feFuncA type="linear" slope="0.018"/></feComponentTransfer>' +
      '<feComposite in="faint" in2="soft" operator="in" result="clipped"/>' +
      '<feBlend in="soft" in2="clipped" mode="soft-light" result="textured"/>' +
      '<feComposite in="textured" in2="soft" operator="atop" result="surface"/>' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="0.08" result="shadowBlur"/>' +
      '<feOffset in="shadowBlur" dy="0.1" result="shadowOffset"/>' +
      '<feFlood flood-color="#171417" flood-opacity="0.23" result="shadowColor"/>' +
      '<feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadow"/>' +
      '<feMerge><feMergeNode in="shadow"/><feMergeNode in="surface"/></feMerge>' +
      '</filter></defs><g filter="url(#' + edge + ')">' + rectangles + '</g></svg>';
  }

  var api = { render: render };
  root.ApprovedStyleRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
