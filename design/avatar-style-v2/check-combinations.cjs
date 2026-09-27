/* Exercise the composable catalog beyond the 138 single-option review sprites. */
const assert = require("node:assert/strict");
global.window = {};
require("./avatar64.js");

const A = window.PXAvatar64;
const base = {
  type: "human", skin: "#c98e5e", hairColor: "#2b211b", eye: "#3a2a1e",
  cloth: "#7d9463", hair: "sidepart", face: "glasses",
  expr: "smile", acc: "none", job: null, garmentId: null,
};
let checked = 0;

function check(overrides) {
  const spec = A.spec("avatar-style-v2/combinations", { ...base, ...overrides });
  const ops = A.ops(spec);
  assert.ok(ops.length > 0, "empty avatar");
  for (const [x, y, width, height, color] of ops) {
    assert.ok([x, y, width, height].every(Number.isInteger));
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= 64 && y + height <= 64);
    assert.match(color, /^#[0-9a-f]{6}$/i);
  }
  checked += 1;
  return ops;
}

for (const hair of A.HAIR) for (const job of A.JOB) check({ hair: hair.id, job: job.id });
for (const acc of A.ACC) for (const job of A.JOB) check({ acc: acc.id, job: job.id });
for (const face of A.FACE) for (const expr of A.EXPR) check({ face: face.id, expr: expr.id });
for (const animal of A.ANIMAL) for (const acc of A.ACC) {
  check({ type: "animal", species: animal.id, acc: acc.id, job: null });
}

assert.deepEqual(A.GARMENT.map((garment) => garment.id), [
  "tee", "hoodie", "jacket", "blazer", "apron", "sweater",
]);
function regionPixels(ops, top, bottom) {
  const pixels = new Array(64 * (bottom - top)).fill(null);
  for (const [x, y, width, height, color] of ops) {
    for (let py = Math.max(y, top); py < Math.min(y + height, bottom); py++) {
      for (let px = x; px < x + width; px++) pixels[(py - top) * 64 + px] = color;
    }
  }
  return pixels;
}
const bodyPixels = (ops) => regionPixels(ops, 44, 64);
const silhouettes = new Set();
for (const garment of A.GARMENT) {
  const own = check({ garmentId: garment.id });
  const ownTorso = bodyPixels(own);
  silhouettes.add(JSON.stringify(ownTorso));
  for (const job of A.JOB) {
    const spec = A.spec("wardrobe-job", { ...base, garmentId: garment.id, job: job.id });
    assert.equal(spec.garmentId, garment.id, "changing jobs must retain the selected garment");
    assert.deepEqual(bodyPixels(check({ garmentId: garment.id, job: job.id })), ownTorso,
      `${garment.id} must stay visible with ${job.id}`);
  }
}
assert.equal(silhouettes.size, A.GARMENT.length, "every garment must have its own silhouette");
assert.equal(A.spec("invalid-garment", { ...base, garmentId: "unknown" }).garmentId, null);
assert.deepEqual(check({ garmentId: "jacket", job: "chef", wearUniform: true }),
  check({ garmentId: "jacket", job: "chef", wearUniform: false }),
  "a chosen garment must not inherit the job's uniform color");
assert.notDeepEqual(bodyPixels(check({ garmentId: "jacket", cloth2: "#d97757" })),
  bodyPixels(check({ garmentId: "jacket", cloth2: "#4d7a8c" })),
  "wardrobe accent color must remain editable");

const cat = check({ type: "animal", species: "cat", garmentId: null });
const dressedCat = check({ type: "animal", species: "cat", garmentId: "hoodie" });
assert.deepEqual(regionPixels(dressedCat, 0, 40), regionPixels(cat, 0, 40),
  "an animal's ears, face, and species markings must survive an outfit change");
assert.notDeepEqual(bodyPixels(dressedCat), bodyPixels(cat),
  "a selected animal garment must visibly change its torso");

const smile = A.EXPR.find((expression) => expression.id === "smile");
assert.equal(smile.eye, "open");
assert.equal(smile.mouth, "smile");
const sidepart = A.HAIR.find((hair) => hair.id === "sidepart");
assert.ok(sidepart, "approved side-part hair must remain selectable");
const hairPixels = regionPixels(sidepart.f(base.hairColor), 0, 28);
assert.equal(hairPixels[7 * 64 + 26], base.hairColor, "hair must start at the approved crown");
assert.equal(hairPixels[15 * 64 + 20], base.hairColor, "left-flowing fringe must remain visible");
assert.equal(hairPixels[15 * 64 + 27], null, "the side part must expose the forehead");
assert.equal(hairPixels[15 * 64 + 34], base.hairColor, "the right side of the part must remain filled");
const smilingWithGlasses = check({ expr: "smile", face: "glasses" });
const eyePixels = regionPixels(smilingWithGlasses, 0, 40);
assert.equal(eyePixels[26 * 64 + 24], "#f7f2e8", "left white must show inside the glasses");
assert.equal(eyePixels[26 * 64 + 34], "#f7f2e8", "right white must show inside the glasses");
assert.equal(eyePixels[27 * 64 + 26], "#241c18", "the left default pupil must be small and dark");
assert.equal(eyePixels[27 * 64 + 36], "#241c18", "the right default pupil must be small and dark");
assert.equal(eyePixels[28 * 64 + 26], "#f7f2e8", "white must remain below the left pupil");
assert.equal(regionPixels(check({ eye: "#2f5fc0" }), 0, 40)[27 * 64 + 26], "#2f5fc0",
  "choosing another eye color must still change the pupil");

const chef = A.JOB_BY_ID.chef;
assert.ok(chef && chef.hat, "chef must exercise hat occlusion");
const plainChef = check({ job: "chef", acc: "none" });
assert.deepEqual(check({ job: "chef", acc: "headband" }), plainChef);
assert.ok(check({ job: "chef", acc: "earrings" }).length > plainChef.length);
const headPixel = (ops, x, y) => regionPixels(ops, 0, 44)[y * 64 + x];
assert.equal(headPixel(check({ job: "knight" }), 21, 23), "#b0b9cc",
  "the knight's helmet must cover the glasses at its edge");
assert.equal(headPixel(check({ job: "astronaut" }), 30, 36), "#1f2740",
  "the astronaut's visor must cover the lower face");
assert.deepEqual(regionPixels(check({ job: "astronaut", face: "glasses" }), 0, 44),
  regionPixels(check({ job: "astronaut", face: "none" }), 0, 44),
  "a closed helmet must hide the chosen face accessory");
for (const job of [null, "doctor", "firefighter", "chef"]) {
  assert.equal(headPixel(check({ job }), 21, 23), "#241c18",
    `${job || "no job"} must still show the glasses`);
}
const uniform = check({ job: "chef", wearUniform: true });
const ownColor = check({ job: "chef", wearUniform: false });
assert.notDeepEqual(uniform, ownColor);
const pig = A.spec("fur-constraint", { type: "animal", species: "pig", fur: "#2b211b" });
assert.ok(A.ANIMAL.find((animal) => animal.id === "pig").fur.includes(pig.fur));

process.stdout.write(`Checked ${checked} avatar combinations\n`);
