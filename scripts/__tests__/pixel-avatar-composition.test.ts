import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

type Rect = [number, number, number, number, string];
type AvatarSpec = Record<string, unknown>;

interface Job {
  id: string;
  cloth: string;
  hat: ((color: string) => Rect[]) | null;
}

interface AvatarEngine {
  JOB: Job[];
  ops(spec: AvatarSpec): Rect[];
}

function loadEngine(): AvatarEngine {
  const file = path.join(__dirname, "../..", "design/pixel_clay_v4/app/px-avatar64.js");
  const window: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync(file, "utf8"), { window }, { filename: file });
  return window.PXAvatar64 as AvatarEngine;
}

const engine = loadEngine();
const base: AvatarSpec = {
  type: "human",
  skin: "#f2c9a0",
  hairColor: "#2b211b",
  eye: "#3a2a1e",
  cloth: "#3f8fbf",
  cloth2: "#bf4a44",
  hair: "curly",
  acc: "none",
  face: "glasses",
  expr: "smile",
  species: "cat",
  fur: "#e8a860",
  job: null,
};

function ops(spec: AvatarSpec): Rect[] {
  // vm 안의 배열을 현재 realm의 평범한 값으로 바꿔 Jest 비교를 안정시킨다.
  return JSON.parse(JSON.stringify(engine.ops(spec))) as Rect[];
}

describe("PIXEL-CLAY avatar role composition", () => {
  it("모자 직업 32종에서도 자리가 겹치지 않는 소품 4종을 유지한다", () => {
    const hatJobs = engine.JOB.filter((job) => job.hat != null);
    const nonOverlapping = ["earrings", "scarf", "bowtie", "facemask"];

    expect(hatJobs).toHaveLength(32);
    expect(hatJobs.length * nonOverlapping.length).toBe(128);
    for (const job of hatJobs) {
      const withoutAccessory = ops({ ...base, job: job.id, acc: "none" });
      for (const acc of nonOverlapping) {
        expect(ops({ ...base, job: job.id, acc })).not.toEqual(withoutAccessory);
      }
    }
  });

  it("모자와 같은 자리를 쓰는 머리 위 소품 15종만 양보한다", () => {
    const headTop = [
      "headband",
      "beanie",
      "capback",
      "flowerpin",
      "headphone",
      "bandana",
      "hairclip",
      "halo",
      "catears",
      "crownsm",
      "hoodup",
      "antenna",
      "horns",
      "visor",
      "freckleset",
    ];
    const withoutAccessory = ops({ ...base, job: "police", acc: "none" });

    expect(headTop).toHaveLength(15);
    for (const acc of headTop) {
      expect(ops({ ...base, job: "police", acc })).toEqual(withoutAccessory);
    }
  });

  it("유니폼을 기본으로 쓰되 사용자의 옷 색으로 되돌릴 수 있다", () => {
    const police = engine.JOB.find((job) => job.id === "police");
    expect(police).toBeDefined();

    const uniform = ops({ ...base, job: "police" });
    const ownColor = ops({ ...base, job: "police", wearUniform: false });

    expect(uniform).toContainEqual([20, 44, 24, 2, police!.cloth]);
    expect(ownColor).toContainEqual([20, 44, 24, 2, base.cloth]);
    expect(ownColor).not.toEqual(uniform);
  });

  it("직업 없음으로 돌아가면 원래 캐릭터를 손상 없이 복원한다", () => {
    expect(ops({ ...base, job: null, wearUniform: false })).toEqual(ops(base));
  });

  it("범위 밖인 동물 아바타에는 직업을 합성하지 않는다", () => {
    const animal = { ...base, type: "animal", species: "cat", acc: "none" };
    expect(ops({ ...animal, job: "police" })).toEqual(ops({ ...animal, job: null }));
  });
});
