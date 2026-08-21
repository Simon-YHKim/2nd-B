import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Rect: () => null,
}));

import {
  AVATAR_ACCESSORIES,
  AVATAR_ANIMALS,
  AVATAR_EXPRESSIONS,
  AVATAR_FACE_DETAILS,
  AVATAR_GRID,
  AVATAR_HAIR,
  AVATAR_JOB_GROUPS,
  AVATAR_JOBS,
  avatarOps,
  createAvatarSpec,
  type AvatarRect,
  type AvatarSpecInput,
} from "../Avatar64";

interface ReferenceEngine {
  ops(spec: AvatarSpecInput): AvatarRect[];
  spec(seed: string | number, overrides?: AvatarSpecInput): AvatarSpecInput;
}

function loadReferenceEngine(): ReferenceEngine {
  const file = path.join(__dirname, "../../../..", "design/pixel_clay_v4/app/px-avatar64.js");
  const window: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync(file, "utf8"), { window }, { filename: file });
  return window.PXAvatar64 as ReferenceEngine;
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const reference = loadReferenceEngine();
const base: AvatarSpecInput = {
  type: "human",
  skin: "#f2c9a0",
  hairColor: "#2b211b",
  eye: "#3a2a1e",
  cloth: "#3f8fbf",
  cloth2: "#bf4a44",
  fur: "#e8a860",
  hair: "curly",
  acc: "earrings",
  face: "glasses",
  expr: "smile",
  species: "cat",
  job: null,
};

function parityCases(): AvatarSpecInput[] {
  return [
    base,
    ...AVATAR_HAIR.map((hair) => ({ ...base, hair: hair.id })),
    ...AVATAR_ACCESSORIES.map((acc) => ({ ...base, acc: acc.id })),
    ...AVATAR_FACE_DETAILS.map((face) => ({ ...base, face: face.id })),
    ...AVATAR_EXPRESSIONS.map((expr) => ({ ...base, expr: expr.id })),
    ...AVATAR_JOBS.flatMap((job) => [
      { ...base, job: job.id },
      { ...base, job: job.id, wearUniform: false },
    ]),
    ...AVATAR_ANIMALS.map((animal) => ({
      ...base,
      type: "animal",
      species: animal.id,
      job: "police",
    })),
    {
      type: "human",
      skin: 7,
      hairColor: 11,
      eye: 6,
      cloth: 12,
      cloth2: 4,
      fur: 9,
      hair: 23,
      acc: 18,
      face: 13,
      expr: 9,
      species: 25,
      job: 43,
    },
  ];
}

describe("Avatar64 React Native engine", () => {
  it("138종 전체 카탈로그와 12개 직업 분야를 보존한다", () => {
    expect(AVATAR_HAIR).toHaveLength(24);
    expect(AVATAR_ACCESSORIES).toHaveLength(20);
    expect(AVATAR_ACCESSORIES.filter((item) => item.id !== "none")).toHaveLength(19);
    expect(AVATAR_FACE_DETAILS).toHaveLength(14);
    expect(AVATAR_EXPRESSIONS).toHaveLength(10);
    expect(AVATAR_ANIMALS).toHaveLength(26);
    expect(AVATAR_JOBS).toHaveLength(44);
    expect(AVATAR_JOB_GROUPS).toHaveLength(12);
  });

  it("모든 부품과 직업 조합이 수정된 웹 정본과 rect 단위로 같다", () => {
    for (const input of parityCases()) {
      expect(avatarOps(input)).toEqual(plain(reference.ops(input)));
    }
  });

  it("seed 기반 spec도 웹 정본과 결정론적으로 같다", () => {
    for (const seed of ["nova", "profile-1", "한글", 0, 7, 128]) {
      expect(createAvatarSpec(seed)).toEqual(plain(reference.spec(seed)));
    }
  });

  it("출력은 64×64 viewBox에 보이는 양수 정수 rect뿐이다", () => {
    for (const input of parityCases()) {
      for (const rect of avatarOps(input)) {
        expect(rect).toHaveLength(5);
        const [x, y, width, height, fill] = rect;
        expect([x, y, width, height].every(Number.isInteger)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        // 뾰족한 귀 끝 1px은 웹 정본에서도 viewBox 위로 잘라 내는 의도된 픽셀 클립이다.
        if (y < 0) {
          expect(y).toBe(-1);
          expect(width).toBe(2);
          expect(height).toBe(3);
          expect([22, 40]).toContain(x);
        }
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(x + width).toBeLessThanOrEqual(AVATAR_GRID);
        expect(y + height).toBeLessThanOrEqual(AVATAR_GRID);
        expect(x + width).toBeGreaterThan(0);
        expect(y + height).toBeGreaterThan(0);
        expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("웹 번들·SVG 문자열·곡선 요소를 앱 런타임에 들이지 않는다", () => {
    const source = readFileSync(path.join(__dirname, "..", "Avatar64.tsx"), "utf8");
    expect(source).not.toContain("design/pixel_clay_v4");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/<(?:Circle|Ellipse|Line|Path|Polygon|Polyline)\b/);
    expect(source).toContain("<SvgRect");
  });
});
