/* Export one deterministic specimen for every option in the composable avatar catalog. */
global.window = {};
require("./avatar64.js");

const A = window.PXAvatar64;
const base = {
  type: "human",
  skin: "#c98e5e",
  hairColor: "#2b211b",
  eye: "#3a2a1e",
  cloth: "#696949",
  cloth2: "#d97757",
  hair: "sidepart",
  face: "glasses",
  expr: "smile",
  acc: "none",
  job: null,
};

const groups = [
  ["hair", A.HAIR, "hair"],
  ["accessory", A.ACC, "acc"],
  ["face", A.FACE, "face"],
  ["expression", A.EXPR, "expr"],
  ["animal", A.ANIMAL, "species"],
  ["job", A.JOB, "job"],
];

const samples = groups.flatMap(([group, items, key]) =>
  items.map((item) => {
    const overrides = { ...base, [key]: item.id };
    if (group === "face") overrides.face = item.id;
    if (group === "animal") {
      overrides.type = "animal";
      overrides.face = "none";
      overrides.acc = "none";
      overrides.fur = item.fur ? item.fur[0] : A.FUR[0];
    }
    const spec = A.spec(`avatar-style-v2/${group}/${item.id}`, overrides);
    return { group, id: item.id, ko: item.ko, en: item.en, spec, ops: A.ops(spec) };
  }),
);

const palettes = { skin: A.SKIN, hair: A.HAIRC, eye: A.EYEC, cloth: A.CLOTH, fur: A.FUR };
process.stdout.write(JSON.stringify({ grid: A.GRID, palettes, samples }));
