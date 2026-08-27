import type {
  AuditEvent,
  CaseLabel,
  ProposedChange,
  ReservationStatus,
} from "./domain";

export type UiLocale = "en" | "ja";

export const UI_COPY = {
  en: {
    documentTitle: "Teachback — Human-approved WebMCP playbooks",
    metaDescription:
      "Teachback turns demonstrated frontline work into human-approved playbooks that websites can safely enforce through WebMCP.",
    tagline: "Show once. Set the boundaries. Reuse safely.",
    language: "Display language",
    englishLanguage: "English",
    japaneseLanguage: "日本語",
    resetDemo: "Reset demo",
    cases: "Cases",
    playbookFlow: "How Teachback reuses work",
    taughtFrom: "1 · Taught from",
    boundedPlaybook: "2 · Human-bounded playbook",
    reusingFor: "3 · Reusing for this case",
    viewingSource: "3 · Viewing the taught case",
    playbookName: "Late Arrival Care",
    playbookBoundarySummary: "7 rules · approval every run",
    reservationSummary: "Reservation summary",
    plannedArrival: "Planned arrival",
    requestedArrival: "Requested arrival",
    dinner: "Dinner",
    included: "Included",
    none: "None",
    readyHeading: "Ready to reuse this playbook",
    readyBody:
      "Teachback checks the playbook taught on R-2041 against this reservation and prepares a preview only. Nothing changes until a person approves it.",
    recordedHeading: "The playbook was taught here",
    recordedBody:
      "The four actions from this handled reservation became Late Arrival Care. Select another case to reuse it within the approved boundary.",
    sourceCaseLabel: "Teaching source",
    sourceCaseBody:
      "This handled reservation is evidence for the playbook, not a new run.",
    proposedChanges: "Proposed changes",
    applied: "Approved changes have been applied.",
    notApplied: "No changes have been applied.",
    humanReviewRequired: "Human review required",
    noChanges: "No changes were made.",
    reservationId: "Reservation ID",
    status: "Status",
    arrival: "Arrival",
    today: "Today",
    review: "Playbook boundary",
    criteriaPending: "Not checked yet",
    criteriaPassed: "Eligible",
    criteriaRefused: "Not eligible",
    criteriaAllPassed: "All 7 conditions passed",
    criterionPending: "Not evaluated",
    criterionPassed: "Passed",
    criterionRefused: "Did not pass",
    caseAwaitingApproval: "Approval pending",
    caseReadyToCommit: "Ready to commit",
    caseApprovalExpired: "Approval expired",
    webMcpTools: "WebMCP tools",
    webMcpChecking: "Checking availability",
    webMcpReady: "Available · 3 tools",
    webMcpUnavailable: "Not available in this browser",
    webMcpError: "Registration failed",
    webMcpCheckingDetail:
      "Checking whether this browser exposes the WebMCP API.",
    webMcpReadyDetail:
      "An agent can commit the exact approved run through WebMCP.",
    webMcpUnavailableDetail:
      "Preview and human review still work in this browser.",
    webMcpErrorDetail:
      "Reload the page in a WebMCP-enabled browser before committing.",
    outsideBoundary: "Outside the playbook boundary",
    refusedPreparation:
      "The website refused to prepare changes for this case.",
    preparePreview: "Check conditions and prepare preview",
    approvePreview: "Approve preview",
    approvedReady: "Approved",
    approvalWindow: "Approval window",
    approvalValidUntil: "Valid until",
    approvalTimeZone: "JST",
    approvalExactOnly:
      "Only this exact approved digest can be committed once.",
    approvedWithWebMcp: "WebMCP can now commit this run.",
    approvedWithoutWebMcp:
      "Open this page in a WebMCP-enabled browser to commit it.",
    approvalExpired: "Approval expired",
    committed: "Committed",
    prepareAgain: "Prepare again",
    discard: "Discard",
    viewAudit: "View audit trail",
    auditTrail: "Audit trail",
    closeAudit: "Close audit trail",
    eligibility: [
      "Confirmed reservation",
      "Arrival is today",
      "Guest has not checked in",
      "Arrival is by 22:00",
      "No new dietary request",
      "No taxi request",
      "No compensation request",
    ],
  },
  ja: {
    documentTitle: "Teachback — 現場の判断を安全に引き継ぐ",
    metaDescription:
      "Teachbackは、現場で実演した対応を、人が承認した安全なWebMCPプレイブックとして次の担当者へ引き継ぐツールです。",
    tagline: "一度教える。任せる範囲を決める。安心して繰り返す。",
    language: "表示言語",
    englishLanguage: "English",
    japaneseLanguage: "日本語",
    resetDemo: "デモをリセット",
    cases: "予約一覧",
    playbookFlow: "Teachbackの流れ",
    taughtFrom: "1 · 教えた対応",
    boundedPlaybook: "2 · 人が境界を確定",
    reusingFor: "3 · この予約で再利用",
    viewingSource: "3 · 記録元を確認中",
    playbookName: "Late Arrival Care",
    playbookBoundarySummary: "7条件 · 毎回承認",
    reservationSummary: "予約内容",
    plannedArrival: "当初の到着予定",
    requestedArrival: "希望到着時刻",
    dinner: "夕食",
    included: "あり",
    none: "なし",
    readyHeading: "この予約に手順を再利用できます",
    readyBody:
      "R-2041で教えた対応を、この予約の条件に照らして確認し、変更案だけを作成します。担当者が承認するまで、予約は変更されません。",
    recordedHeading: "この対応から教えました",
    recordedBody:
      "この予約で行った4つの対応が「レイトアライバル対応」になりました。別の予約を選ぶと、人が決めた範囲内で再利用できます。",
    sourceCaseLabel: "教えた元ケース",
    sourceCaseBody:
      "この対応済み予約はプレイブックの記録元です。新しい実行対象ではありません。",
    proposedChanges: "変更案",
    applied: "承認済みの変更を反映しました。",
    notApplied: "まだ変更は反映されていません。",
    humanReviewRequired: "担当者の確認が必要です",
    noChanges: "変更は行っていません。",
    reservationId: "予約ID",
    status: "状態",
    arrival: "到着日",
    today: "本日",
    review: "適用条件",
    criteriaPending: "未判定",
    criteriaPassed: "適用可",
    criteriaRefused: "適用不可",
    criteriaAllPassed: "7条件すべて確認済み",
    criterionPending: "未判定です",
    criterionPassed: "条件を満たしています",
    criterionRefused: "条件を満たしていません",
    caseAwaitingApproval: "承認待ち",
    caseReadyToCommit: "反映待ち",
    caseApprovalExpired: "承認切れ",
    webMcpTools: "WebMCPツール",
    webMcpChecking: "利用可否を確認中",
    webMcpReady: "利用可能 · 3ツール",
    webMcpUnavailable: "このブラウザでは未提供",
    webMcpError: "登録できませんでした",
    webMcpCheckingDetail:
      "このブラウザがWebMCP APIを提供しているか確認しています。",
    webMcpReadyDetail:
      "承認済みの内容を、エージェントがWebMCP経由で反映できます。",
    webMcpUnavailableDetail:
      "この画面での変更案作成と担当者確認は利用できます。",
    webMcpErrorDetail:
      "反映前に、WebMCP対応ブラウザでページを再読み込みしてください。",
    outsideBoundary: "プレイブックの対象外",
    refusedPreparation:
      "このケースは対象外のため、変更案は作成されませんでした。",
    preparePreview: "条件を確認して変更案を作る",
    approvePreview: "この内容を承認",
    approvedReady: "承認済み",
    approvalWindow: "承認の有効期限",
    approvalValidUntil: "有効期限",
    approvalTimeZone: "JST",
    approvalExactOnly:
      "承認済みの内容と一致する実行だけを、一度だけ反映できます。",
    approvedWithWebMcp: "WebMCP経由で反映できます。",
    approvedWithoutWebMcp:
      "WebMCP対応ブラウザで開くと、この内容を反映できます。",
    approvalExpired: "承認期限が切れました",
    committed: "反映済み",
    prepareAgain: "もう一度準備",
    discard: "破棄",
    viewAudit: "操作履歴を見る",
    auditTrail: "操作履歴",
    closeAudit: "操作履歴を閉じる",
    eligibility: [
      "予約が確定している",
      "到着日が本日",
      "未チェックイン",
      "到着予定が22:00まで",
      "新しい食事制限の依頼なし",
      "タクシー手配なし",
      "補償依頼なし",
    ],
  },
} as const;

export type UiCopy = (typeof UI_COPY)[UiLocale];

export function copyFor(locale: UiLocale): UiCopy {
  return UI_COPY[locale];
}

const CASE_LABELS: Record<UiLocale, Record<CaseLabel, string>> = {
  en: {
    Recorded: "Taught example",
    "Needs review": "Ready to check",
    "Human only": "Human only",
    Resolved: "Reused",
  },
  ja: {
    Recorded: "教えた例",
    "Needs review": "確認前",
    "Human only": "担当者の判断が必要",
    Resolved: "再利用済み",
  },
};

const STATUS_LABELS: Record<UiLocale, Record<ReservationStatus, string>> = {
  en: {
    confirmed: "Confirmed",
    checked_in: "Checked in",
    cancelled: "Cancelled",
  },
  ja: {
    confirmed: "確定",
    checked_in: "チェックイン済み",
    cancelled: "キャンセル",
  },
};

const FIELD_LABELS: Record<
  UiLocale,
  Record<ProposedChange["field"], string>
> = {
  en: {
    Arrival: "Arrival",
    Meal: "Meal",
    "Guest message": "Guest message",
    Handoff: "Handoff",
  },
  ja: {
    Arrival: "到着時刻",
    Meal: "食事",
    "Guest message": "ゲスト向け文面（英語・原文）",
    Handoff: "引き継ぎ（英語・原文）",
  },
};

const VALUE_LABELS: Record<UiLocale, Record<string, string>> = {
  en: {
    "Regular dinner": "Regular dinner",
    "Late meal box": "Late meal box",
    "No meal service": "No meal service",
  },
  ja: {
    "Regular dinner": "通常の夕食",
    "Late meal box": "遅い到着向けのお食事",
    "No meal service": "食事提供なし",
  },
};

const REASON_LABELS: Record<UiLocale, Record<string, string>> = {
  en: {},
  ja: {
    "Only confirmed reservations can use this playbook.":
      "確定済みの予約だけが対象です。",
    "Only same-day arrivals can use this playbook.":
      "当日到着の予約だけが対象です。",
    "The guest has already checked in.":
      "ゲストはすでにチェックインしています。",
    "Arrival is later than 22:00.": "到着予定が22:00を過ぎています。",
    "A new dietary request requires human review.":
      "新しい食事制限の依頼は、担当者による確認が必要です。",
    "Transportation arrangements are outside this playbook.":
      "移動手段の手配は、このプレイブックの対象外です。",
    "Compensation requests are outside this playbook.":
      "補償の依頼は、このプレイブックの対象外です。",
    "This case already has late-arrival handling.":
      "この予約は、すでに遅着対応済みです。",
  },
};

const ACTOR_LABELS: Record<UiLocale, Record<AuditEvent["actor"], string>> = {
  en: { Human: "Human", Agent: "Agent", Website: "Website" },
  ja: { Human: "担当者", Agent: "エージェント", Website: "システム" },
};

const SYSTEM_MESSAGES_JA: Record<string, string> = {
  "Teachback demo ready.": "Teachbackのデモを開始できます。",
  "WebMCP tools could not be registered.":
    "WebMCPツールを登録できませんでした。",
  "The case changed while the preview was being prepared.":
    "変更案の作成中に予約内容が変わりました。もう一度お試しください。",
  "Approval expired. Prepare a new preview.":
    "承認の有効期限が切れました。もう一度、変更案を作成してください。",
  "Preview discarded.": "変更案を破棄しました。",
  "Demo reset.": "デモをリセットしました。",
  "A preview was created. Human approval is required.":
    "変更案を作成しました。担当者による承認が必要です。",
  "This case requires human review. No changes were made.":
    "このケースは担当者による確認が必要です。変更は行っていません。",
  "The preview was approved for five minutes.":
    "プレビューを承認しました。有効期限は5分です。",
  "The approved changes were committed exactly once.":
    "承認済みの変更を一度だけ反映しました。",
  "The approval has expired. Prepare a new preview.":
    "承認の有効期限が切れました。もう一度、変更案を作成してください。",
};

export function caseLabel(locale: UiLocale, label: CaseLabel): string {
  return CASE_LABELS[locale][label];
}

export function statusLabel(
  locale: UiLocale,
  status: ReservationStatus,
): string {
  return STATUS_LABELS[locale][status];
}

export function fieldLabel(
  locale: UiLocale,
  field: ProposedChange["field"],
): string {
  return FIELD_LABELS[locale][field];
}

export function valueLabel(
  locale: UiLocale,
  field: ProposedChange["field"],
  value: string,
): string {
  if (field !== "Meal") return value;
  return VALUE_LABELS[locale][value] ?? value;
}

export function reasonLabel(locale: UiLocale, reason: string): string {
  return REASON_LABELS[locale][reason] ?? reason;
}

export function actorLabel(
  locale: UiLocale,
  actor: AuditEvent["actor"],
): string {
  return ACTOR_LABELS[locale][actor];
}

export function auditSummaryLabel(locale: UiLocale, summary: string): string {
  if (locale === "en") return summary;

  const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
    [
      /^Recorded the Late Arrival Care demonstration on (.+)\.$/,
      (reservationId) =>
        `${reservationId}でレイトアライバル対応の手順を記録しました。`,
    ],
    [
      /^Rejected Late Arrival Care for (.+)\.$/,
      (reservationId) =>
        `${reservationId}はレイトアライバル対応の対象外でした。`,
    ],
    [
      /^Prepared Late Arrival Care for (.+)\.$/,
      (reservationId) => `${reservationId}の変更案を準備しました。`,
    ],
    [
      /^Approved preview (.+)\.$/,
      (runId) => `変更案 ${runId} を承認しました。`,
    ],
    [
      /^Discarded preview (.+)\.$/,
      (runId) => `変更案 ${runId} を破棄しました。`,
    ],
    [
      /^Expired approval for preview (.+)\.$/,
      (runId) => `変更案 ${runId} の承認期限が切れました。`,
    ],
    [
      /^Committed approved run (.+) to (.+)\.$/,
      (runId, reservationId) =>
        `${reservationId}に承認済みの実行 ${runId} を反映しました。`,
    ],
  ];

  for (const [pattern, translate] of patterns) {
    const match = summary.match(pattern);
    if (match) return translate(...match.slice(1));
  }
  return summary;
}

export function systemMessageLabel(locale: UiLocale, message: string): string {
  if (locale === "en") return message;

  const selected = message.match(/^Selected reservation (.+)\.$/);
  if (selected) return `予約 ${selected[1]} を選択しました。`;
  return SYSTEM_MESSAGES_JA[message] ?? message;
}
