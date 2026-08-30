export type DataLocale = "en" | "ko";
export type DataRightId = "import" | "account-export" | "iden" | "deletion";
export type DataRoute = "/import-hub" | "/account?tool=export" | "/iden" | "/privacy";
export type DataGlyph = "uploadFile" | "download" | "iden" | "trash";

export interface DataScreenCopy {
  title: string;
  hero: string;
  expanded: string;
  collapsed: string;
}

export interface DataRightItem {
  id: DataRightId;
  icon: DataGlyph;
  title: string;
  summary: string;
  detail: string;
  actionLabel: string;
  route: DataRoute;
  danger?: true;
}

const SCREEN_COPY: Record<DataLocale, DataScreenCopy> = {
  en: {
    title: "My data",
    hero: "Import material, move account data, control its use, or open deletion settings here.",
    expanded: "Details open",
    collapsed: "Details closed",
  },
  ko: {
    title: "내 데이터",
    hero: "자료를 가져오고, 계정 데이터를 옮기고, 사용 범위를 정하고, 삭제 설정을 여는 곳입니다.",
    expanded: "설명 열림",
    collapsed: "설명 닫힘",
  },
};

const RIGHTS: Record<DataLocale, readonly DataRightItem[]> = {
  en: [
    {
      id: "import",
      icon: "uploadFile",
      title: "Import personal data",
      summary: "Review outside material before bringing it in.",
      detail:
        "The import hub reviews supported files and assistant exports before adding anything to your record structure.",
      actionLabel: "Open import hub",
      route: "/import-hub",
    },
    {
      id: "account-export",
      icon: "download",
      title: "Export the whole account",
      summary: "Prepare the complete structured account bundle.",
      detail:
        "This is different from the wiki context pack. It prepares the complete account-owned JSON bundle, and export starts only after you confirm it on Account.",
      actionLabel: "Open account export",
      route: "/account?tool=export",
    },
    {
      id: "iden",
      icon: "iden",
      title: "Portable IDEN",
      summary: "Move a compact identity file.",
      detail:
        "IDEN is not a complete account backup. It is a portable identity summary built from material you saved.",
      actionLabel: "Open IDEN",
      route: "/iden",
    },
    {
      id: "deletion",
      icon: "trash",
      title: "Deletion management",
      summary: "Open the account and data deletion controls.",
      detail:
        "Review and confirmation stay in the privacy screen, the single owner of account and data deletion.",
      actionLabel: "Open deletion settings",
      route: "/privacy",
      danger: true,
    },
  ],
  ko: [
    {
      id: "import",
      icon: "uploadFile",
      title: "개인 데이터 가져오기",
      summary: "외부 자료를 검토한 뒤 가져옵니다.",
      detail:
        "가져오기 허브에서 지원 파일과 대화 도구 내보내기를 검토한 뒤 현재 기록 구조에 담습니다.",
      actionLabel: "가져오기 허브 열기",
      route: "/import-hub",
    },
    {
      id: "account-export",
      icon: "download",
      title: "전체 계정 내보내기",
      summary: "계정의 전체 구조화 묶음을 준비합니다.",
      detail:
        "위키 context pack과 다릅니다. 계정 소유 데이터를 전체 JSON 묶음으로 준비하며, 계정 화면에서 직접 확인한 뒤 내보내기를 시작합니다.",
      actionLabel: "계정 내보내기 열기",
      route: "/account?tool=export",
    },
    {
      id: "iden",
      icon: "iden",
      title: "포터블 IDEN",
      summary: "나를 설명하는 간결한 파일을 옮깁니다.",
      detail:
        "IDEN은 전체 계정 백업이 아닙니다. 저장한 자료를 바탕으로 만든 포터블 요약입니다.",
      actionLabel: "IDEN 열기",
      route: "/iden",
    },
    {
      id: "deletion",
      icon: "trash",
      title: "삭제 관리",
      summary: "계정과 데이터 삭제 설정을 엽니다.",
      detail:
        "삭제 확인과 실행은 계정·데이터 삭제를 단일 소유하는 개인정보 화면에서만 진행합니다.",
      actionLabel: "삭제 설정 열기",
      route: "/privacy",
      danger: true,
    },
  ],
};

export function dataScreenCopyFor(locale: DataLocale): DataScreenCopy {
  return SCREEN_COPY[locale];
}

export function dataRightsFor(locale: DataLocale): readonly DataRightItem[] {
  return RIGHTS[locale];
}
