/* Prototype integration check: legacy profile → wardrobe UI → saved approved render. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const here = __dirname;
const html = fs.readFileSync(path.join(here, '2nd-Brain.html'), 'utf8');
const scripts = ['px-avatar64.js', 'px-approved-style-renderer.js', 'sb-avatar.jsx'];
const positions = scripts.map((name) => html.indexOf('src="' + name + '"'));
assert.ok(positions.every((position) => position >= 0));
assert.ok(positions[0] < positions[1] && positions[1] < positions[2], 'avatar scripts must load in order');

const storage = new Map([['sb_profile', JSON.stringify({
  name: '기존 사용자', avatar: { v: 64, seed: 'saved', type: 'human', hair: 'sidepart',
    face: 'glasses', expr: 'smile', job: 'doctor', cloth: '#7d9463' }
})]]);

function boot() {
  const states = [];
  let cursor = 0;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
    },
    useState(initial) {
      const index = cursor++;
      if (!Object.prototype.hasOwnProperty.call(states, index)) {
        states[index] = typeof initial === 'function' ? initial() : initial;
      }
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
    useEffect() {}
  };
  const window = { SB: { C: () => '#fff' } };
  const context = vm.createContext({
    window, React, localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    Icon() {}, MdIconButton() {}, MdButton() {}, console
  });
  for (const name of scripts.slice(0, 2)) {
    vm.runInContext(fs.readFileSync(path.join(here, name), 'utf8'), context, { filename: name });
  }
  const jsx = babel.transformSync(fs.readFileSync(path.join(here, 'sb-avatar.jsx'), 'utf8'), {
    babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-react-jsx')]
  }).code;
  vm.runInContext(jsx, context, { filename: 'sb-avatar.jsx' });
  return {
    window,
    renderStudio(props) { cursor = 0; return window.AvatarStudio(props); }
  };
}

function walk(element, predicate) {
  if (Array.isArray(element)) return element.flatMap((child) => walk(child, predicate));
  if (!element || typeof element !== 'object' || !element.props) return [];
  if (typeof element.type === 'function' && ['Tab', 'StRail', 'StSwatch'].includes(element.type.name)) {
    return walk(element.type(element.props), predicate);
  }
  return (predicate(element) ? [element] : []).concat(walk(element.props.children, predicate));
}

function textOf(element) {
  if (Array.isArray(element)) return element.map(textOf).join('');
  if (typeof element === 'string') return element;
  return element && element.props ? textOf(element.props.children) : '';
}

const app = boot();
const old = app.window.SBProfile.get().avatar;
assert.equal(old.hair, 'sidepart');
assert.equal(old.face, 'glasses');
assert.equal(old.job, 'doctor');
assert.equal(old.garmentId, null);
assert.equal(old.cloth2, old.cloth, 'old profiles should keep their garment color');

let saved;
const props = { spec: old, onSave: (spec) => { saved = spec; app.window.SBProfile.set({ avatar: spec }); }, onClose() {} };
function clickByText(label) {
  const match = walk(app.renderStudio(props), (element) => element.type === 'button' && textOf(element).trim() === label)[0];
  assert.ok(match, 'missing UI choice: ' + label);
  match.props.onClick();
}
clickByText('옷');
clickByText('후드티');
function clickSwatch(label) {
  const match = walk(app.renderStudio(props), (element) => element.type === 'button' && element.props['aria-label'] === label)[0];
  assert.ok(match, 'missing color choice: ' + label);
  match.props.onClick();
}
clickSwatch('옷 색 1');
clickSwatch('옷 포인트 색 4');
clickByText('직업');
const chef = walk(app.renderStudio(props), (element) => element.type === 'button' && element.props.title === '요리사')[0];
assert.ok(chef, 'chef job choice missing');
chef.props.onClick();
const save = walk(app.renderStudio(props), (element) => textOf(element).trim() === '이 아바타로 할래요' && typeof element.props.onClick === 'function')[0];
assert.ok(save, 'save button missing');
save.props.onClick();
assert.equal(saved.garmentId, 'hoodie');
assert.equal(saved.job, 'chef');
assert.equal(saved.hair, 'sidepart');
assert.equal(saved.face, 'glasses');
assert.equal(saved.cloth, '#696949');
assert.equal(saved.cloth2, '#e0a63c');

const reopened = boot();
assert.equal(reopened.window.SBProfile.get().avatar.garmentId, 'hoodie');
assert.equal(reopened.window.SBProfile.get().avatar.job, 'chef');
assert.equal(reopened.window.SBProfile.get().avatar.cloth, '#696949');
assert.equal(reopened.window.SBProfile.get().avatar.cloth2, '#e0a63c');
const avatarElement = reopened.window.SbAvatar({ spec: reopened.window.SBProfile.get().avatar, size: 128, crop: true });
const svg = avatarElement.props.dangerouslySetInnerHTML.__html;
assert.match(svg, /viewBox="12 0 40 40"/);
assert.match(svg, /shape-rendering="crispEdges"/);
assert.doesNotMatch(svg, /<filter|<linearGradient|feTurbulence/);

storage.delete('sb_profile');
const fresh = boot().window.SBProfile.get().avatar;
assert.equal(fresh.cloth, '#696949', 'new profiles should match the approved catalog specimen');
assert.equal(fresh.cloth2, '#d97757');

storage.set('sb_profile', JSON.stringify({ avatar: {
  v: 16, seed: 'older', type: 'human', hair: 12, face: 2, skin: 4, cloth: 2
} }));
const old16 = boot().window.SBProfile.get().avatar;
assert.equal(old16.hair, reopened.window.PXAvatar64.HAIR[12].id);
assert.equal(old16.face, reopened.window.PXAvatar64.FACE[2].id);
assert.equal(old16.skin, reopened.window.PXAvatar64.SKIN[4]);
assert.equal(old16.cloth2, old16.cloth);

const started = performance.now();
for (const item of reopened.window.PXAvatar64.ANIMAL.concat(reopened.window.PXAvatar64.JOB)) {
  const spec = reopened.window.PXAvatar64.avatarSpec(item.id, {
    type: item.group ? 'human' : 'animal',
    [item.group ? 'job' : 'species']: item.id
  });
  reopened.window.ApprovedStyleRenderer.render(reopened.window.PXAvatar64.ops(spec), 32);
}
console.log('Prototype avatar migration, wardrobe save/reopen and approved SVG: OK');
console.log('70 small preview SVGs generated in ' + Math.round(performance.now() - started) + ' ms (JavaScript only)');
