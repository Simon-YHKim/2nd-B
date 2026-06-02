import React, { useMemo, useState } from "react";

type OnboardingStepId = "welcome" | "graphVillage" | "secondb" | "trust" | "firstShard";

type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  body: string;
  asset: string;
  primaryLabel: string;
  secondaryLabel?: string;
};

const ASSET_BASE = "/assets/cosmic-pixel-v2/onboarding/";

const steps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "내 생각 조각이 작은 지도가 돼요",
    body: "2ndB는 내가 남긴 기록과 지식을 연결해 나에게 맞는 다음 한 걸음을 함께 찾아주는 앱이에요.",
    asset: `${ASSET_BASE}onboarding/welcome_hero_v2.svg`,
    primaryLabel: "시작하기",
  },
  {
    id: "graphVillage",
    title: "그래프가 곧 마을이에요",
    body: "노드는 장소, 연결선은 길, 기록은 조각이 됩니다.",
    asset: `${ASSET_BASE}onboarding/graph_village_intro_v2.svg`,
    primaryLabel: "마을 둘러보기",
  },
  {
    id: "secondb",
    title: "세컨비를 만나보세요",
    body: "세컨비는 내 조각을 참고해서 대답하는 작은 AI 친구예요.",
    asset: `${ASSET_BASE}onboarding/secondb_intro_card_v2.svg`,
    primaryLabel: "세컨비와 시작",
  },
  {
    id: "trust",
    title: "내 조각은 조심히 다뤄요",
    body: "세컨비가 답할 때 어떤 조각을 참고했는지 함께 보여줘요.",
    asset: `${ASSET_BASE}trust/privacy_trust_card_v2.svg`,
    primaryLabel: "좋아요",
  },
  {
    id: "firstShard",
    title: "첫 조각을 남겨볼까요?",
    body: "한 문장이어도 충분해요. 첫 조각이 들어오면 그래프에 작은 길이 켜져요.",
    asset: `${ASSET_BASE}onboarding/first_shard_card_v2.svg`,
    primaryLabel: "첫 조각 저장",
    secondaryLabel: "건너뛰고 둘러보기",
  },
];

export function OnboardingFlowSkeleton({
  onDone,
  onFirstShard,
}: {
  onDone?: () => void;
  onFirstShard?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const progress = useMemo(() => steps.map((s, i) => ({ id: s.id, active: i === index })), [index]);

  function goNext() {
    if (isLast) {
      onFirstShard?.();
      return;
    }
    setIndex((value) => Math.min(value + 1, steps.length - 1));
  }

  function skip() {
    onDone?.();
  }

  return (
    <main className="onboarding-screen first-run-safe-area" aria-labelledby="onboarding-title">
      <section className="mx-auto flex min-h-[100dvh] max-w-[430px] flex-col px-6 py-5">
        <header className="flex items-center justify-between">
          <span className="text-sm font-bold text-moon-white">2ndB</span>
          <button type="button" onClick={skip} className="text-xs text-mist-gray">
            둘러보기
          </button>
        </header>

        <div className="mt-10">
          <img src={step.asset} alt="" aria-hidden="true" className="w-full rounded-[28px]" />
        </div>

        <div className="mt-9">
          <h1 id="onboarding-title" className="text-2xl font-extrabold leading-tight text-moon-white">
            {step.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-mist-gray">{step.body}</p>
        </div>

        <div className="mt-auto space-y-4 pb-4">
          <div className="flex justify-center gap-3" aria-label="온보딩 진행 상태">
            {progress.map((dot) => (
              <span key={dot.id} className="onboarding-progress-dot" data-active={dot.active} />
            ))}
          </div>

          <button type="button" onClick={goNext} className="onboarding-primary-cta w-full">
            {step.primaryLabel}
          </button>

          {step.secondaryLabel ? (
            <button type="button" onClick={skip} className="onboarding-secondary-cta w-full">
              {step.secondaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function AgeGatePanelSkeleton({ onSubmit }: { onSubmit?: (birthDate: string) => void }) {
  const [birthDate, setBirthDate] = useState("");

  return (
    <main className="onboarding-screen first-run-safe-area">
      <section className="mx-auto flex min-h-[100dvh] max-w-[430px] flex-col px-6 py-5">
        <h1 className="mt-10 text-2xl font-extrabold text-moon-white">시작 전 확인</h1>
        <p className="mt-3 text-sm leading-6 text-mist-gray">계정 생성을 위해 생년월일 확인이 필요해요.</p>

        <div className="onboarding-card mt-10 p-5">
          <label className="text-sm font-bold text-moon-white" htmlFor="birth-date">
            생년월일
          </label>
          <input
            id="birth-date"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            className="mt-3 min-h-12 w-full rounded-2xl border border-space-700 bg-space-950 px-4 text-moon-white"
          />
        </div>

        <button type="button" onClick={() => onSubmit?.(birthDate)} className="onboarding-primary-cta mt-auto w-full">
          확인하고 계속
        </button>
      </section>
    </main>
  );
}
