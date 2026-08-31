import type {
  AuditEvent,
  ProposedChange,
  ReservationStatus,
} from "./domain";

export type UiLocale = "en" | "ja";

export const UI_COPY = {
  en: {
    documentTitle: "Teachback — Human-approved WebMCP playbooks",
    metaDescription:
      "Teachback turns demonstrated frontline work into human-approved playbooks that websites can safely enforce through WebMCP.",
    language: "Display language",
    englishLanguage: "English",
    japaneseLanguage: "日本語",
    resetDemo: "Reset demo",
    resetConfirmTitle: "Reset all demo work?",
    resetConfirmBody: "This clears changes, approvals, newly created rules and the audit trail for all 8 cases. The original examples will be restored. This cannot be undone.",
    resetConfirm: "Reset all cases",
    cancel: "Cancel",
    storageWarning: "Changes could not be saved in this browser. Work is available in this tab, but may be lost or restored to an earlier state after reloading.",
    storageRetry: "Retry saving",
    storagePartialWarning: "Only part of the work may have been saved. Your current work is still open. Retry saving before reloading this page.",
    resetFailed: "The reset could not be saved. Your current work is still open. Retry saving before resetting again.",
    clearSearch: "Clear search",
    viewConditions: "View the 7 conditions",
    emptySearchHelp: "Try another name or reservation ID. No reservation is selected in these results.",
    caseNeedsHumanReview: "Needs a person",
    reservationResponse: "Reservation response",
    ruleRegistration: "Rule from this response",
    ruleNotCreated: "Not created yet",
    ruleRegistered: "Registered",
    registeredRule: "Registered rule",
    recordedResponse: "Recorded response",
    recordedMessage: "Recorded message and handoff",
    sourceReadyHelp: "The guest’s request has been handled. Create a rule to reuse these recorded actions on other reservations.",
    sourcePublishedHelp: "This rule is available on matching reservations. Applying it still requires approval each time.",
    tryMatchingCase: "Try a matching case",
    viewSource: "View recorded source",
    requests: "Guest requests",
    noRequests: "No additional requests",
    dietaryRequested: "Dietary request",
    taxiRequested: "Taxi requested",
    compensationRequested: "Compensation requested",
    requestHandled: "Handled",
    requestPending: "Not handled",
    fixedResponseBoundary: "Fixed response conditions",
    editableBoundary: "Confirm before publishing",
    manualEndpoint: "No changes were applied and no handoff was sent. This demo stops here; a staff member must handle this request outside Teachback.",
    tryAnotherCase: "Try another eligible case",
    noMatchingRuleHelp: "The registered rules do not cover this request. Check why, or create a suitable rule from a recorded response.",
    inspectRecordedCase: "Review a matching recorded response",
    rulePublishedNotice: "Rule registered from",
    reuseTargetNotice: "Now showing a matching reservation:",
    dismissNotice: "Dismiss notice",
    auditProvenance: "Website: built-in demo generation and checks. Agent: a WebMCP tool call. Person: review and approval.",
    checkConditions: "Check conditions",
    primaryPitch: "Reuse one taught workflow with conditions and approval.",
    teachingSource: "Review example",
    agentStructured: "Create conditions",
    humanConstrained: "Confirm boundary",
    teachingProgress: "Rule creation progress",
    teachingPanelHeading: "Create a reusable rule",
    backToReservation: "Back to reservation",
    teachingRuleLabel: "Target response",
    teachingRuleDescription:
      "A late-arrival response that keeps the approved meal and handoff steps together.",
    nightTeachingRuleDescription:
      "A late-night arrival response covering dietary handling, taxi arrangements, and handoff.",
    teachingAppliesTo: "Applies to",
    teachingAppliesToValue: "Same-day late arrivals",
    nightTeachingAppliesToValue: "Arrivals after 23:00",
    teachingActionCount: "Included actions",
    teachingRuleCount: "Expected conditions",
    teachingCountUnit: "",
    nightBoundaryReviewBody:
      "Review the proposed conditions before making this response available to matching reservations.",
    agentDraftBody:
      "Create a draft from the recorded actions. A person must review it before publishing.",
    createAgentDraft: "Create draft",
    boundaryReviewHeading: "Review proposed conditions",
    boundaryReviewBody:
      "Two proposed limits are too broad. A person must tighten both before publishing.",
    latestArrivalRule: "Latest arrival",
    taxiRule: "Taxi request",
    dietaryRule: "Dietary request",
    compensationRule: "Compensation requests",
    handleInPlaybook: "Handled in playbook",
    taxiEscalate: "Escalate to a person",
    compensationAllow: "Handle automatically",
    compensationEscalate: "Escalate to a person",
    agentProposal: "Proposed",
    humanBoundary: "Confirmed by person",
    publishPlaybook: "Publish reusable rule",
    publishReady: "The human-set boundary is ready to publish.",
    cases: "Cases",
    caseSearch: "Search cases",
    caseSearchPlaceholder: "Reservation ID or guest name",
    noMatchingCases: "No matching cases",
    previousCases: "Show previous cases",
    nextCases: "Show more cases",
    previousCasesShort: "Previous",
    nextCasesShort: "Next",
    caseUnhandled: "Unhandled",
    caseAwaitingReview: "Awaiting review",
    caseAwaitingApplication: "Awaiting application",
    caseApprovalExpired: "Review again",
    caseHandled: "Handled",
    nextAction: "Next step",
    playbookFlow: "Reusable playbook",
    playbookOrigin: "Taught from",
    playbookName: "Late Arrival Care",
    playbookBoundarySummary: "7 rules · approval every run",
    reservationSummary: "Reservation summary",
    plannedArrival: "Planned arrival",
    requestedArrival: "Requested arrival",
    dinner: "Dinner",
    included: "Included",
    none: "None",
    readyHeading: "Ready to reuse this playbook",
    readyBody: "The reservation does not change until a person approves it.",
    recordedHeading: "The playbook was taught here",
    recordedBody:
      "The recorded actions from this reservation became a reusable rule. Select another case to reuse it within the approved boundary.",
    unlearnedRecordedHeading: "Turn this response into a rule",
    unlearnedRecordedBody:
      "Create a reusable rule from the actions recorded on this handled reservation.",
    sourceCaseBody:
      "A reusable rule was created from the response recorded on this reservation.",
    unlearnedSourceCaseBody:
      "The recorded response can be turned into a reusable rule.",
    teachThisCase: "Teach from this case",
    unmatchedHeading: "No reusable rule applies to this reservation",
    unmatchedBody:
      "Review this reservation’s conditions and requests before deciding how to handle it.",
    nightPlaybookName: "Night Arrival Coordination",
    proposedChanges: "Proposed changes",
    appliedChanges: "Applied changes",
    applied: "Approved changes have been applied.",
    notApplied: "No changes have been applied.",
    humanReviewRequired: "Human review required",
    noProposalCreated: "No preview was created.",
    reservationId: "Reservation ID",
    status: "Status",
    arrival: "Arrival",
    today: "Today",
    review: "Playbook boundary",
    reviewAndApply: "Review and apply",
    criteriaPending: "Not checked yet",
    criteriaPassed: "7 of 7 conditions met",
    criteriaRefused: "Needs review",
    criteriaAllPassed: "7/7 conditions met",
    criteriaPreviouslyPassed: "Previous check: 7/7 conditions met",
    criterionPending: "Not evaluated",
    criterionPassed: "Passed",
    criterionRefused: "Did not pass",
    webMcpChecking: "Checking availability",
    webMcpReady: "Site tools registered",
    webMcpUnavailable: "Review only",
    webMcpError: "Changes cannot be applied",
    outsideBoundary: "Outside the playbook boundary",
    preparePreview: "Check conditions and prepare preview",
    approvePreview: "Approve only",
    approveAndApply: "Approve and apply",
    applyApproved: "Apply approved changes",
    applying: "Applying…",
    applyFailed: "Changes were not applied. Review the proposal and try again.",
    agentApprovalOptions: "Let an agent apply",
    agentApprovalHelp: "Approve for one use within 5 minutes, then ask your connected agent to apply. You can also apply here.",
    approvalScope: "Approval",
    approvalChangeCountUnit: "changes",
    approvalLimit: "Permission",
    approvalLimitValue: "One use after approval · valid for 5 minutes",
    auditEvidence:
      "Records condition checks, approvals, applied changes, and stopped actions.",
    approvedReady: "Approved · awaiting application",
    approvedNextStep:
      "The reservation is unchanged. Apply the approved changes below.",
    approvalValidUntil: "Valid until",
    approvalTimeZone: "JST",
    approvalExactOnly: "May be applied once.",
    approvedWithoutWebMcp:
      "This page’s WebMCP tools are currently unavailable.",
    approvalExpired: "Approval expired",
    committed: "Changes applied",
    prepareAgain: "Prepare again",
    discard: "Discard",
    viewAudit: "View audit trail",
    auditTrail: "Audit trail",
    closeAudit: "Close audit trail",
    webMcpConnected: "WebMCP tools registered",
    webMcpCheckingConnection: "Registering WebMCP tools",
    webMcpNotConnected: "WebMCP tools unavailable",
    webMcpToolCount: "site tools",
    webMcpLastCall: "Last call",
    webMcpResult: "Result",
    webMcpNoCalls: "No WebMCP call in this session yet.",
    eligibility: [
      "Confirmed reservation",
      "Arrival is today",
      "Guest has not checked in",
      "Arrival is by 22:00",
      "No new dietary request",
      "No taxi request",
      "No compensation request",
    ],
    nightEligibility: [
      "Confirmed reservation",
      "Arrival is today",
      "Guest has not checked in",
      "Arrival is by 23:59",
      "Dietary request can be handled",
      "Requested taxi can be arranged",
      "No compensation request",
    ],
  },
  ja: {
    documentTitle: "Teachback — 現場の判断を安全に引き継ぐ",
    metaDescription:
      "Teachbackは、現場で実演した対応を、人が承認した安全なWebMCPプレイブックとして次の担当者へ引き継ぐツールです。",
    language: "表示言語",
    englishLanguage: "English",
    japaneseLanguage: "日本語",
    resetDemo: "デモをリセット",
    resetConfirmTitle: "デモをすべてリセットしますか？",
    resetConfirmBody: "8件すべての変更・承認、追加したルール、操作履歴を消して、最初の実例に戻します。この操作は取り消せません。",
    resetConfirm: "すべての予約をリセット",
    cancel: "キャンセル",
    storageWarning: "このブラウザに保存できませんでした。このタブでは作業を続けられますが、再読み込みすると作業が消えたり、以前の状態に戻る可能性があります。",
    storageRetry: "保存を再試行",
    storagePartialWarning: "作業の一部だけが保存された可能性があります。現在の作業は画面に残しています。再読み込みせず、保存を再試行してください。",
    resetFailed: "リセットを保存できませんでした。現在の作業は画面に残しています。保存を再試行してから、もう一度リセットしてください。",
    clearSearch: "検索をクリア",
    viewConditions: "7つの適用条件を見る",
    emptySearchHelp: "氏名や予約IDを変えて検索してください。この検索結果では予約は選択されていません。",
    caseNeedsHumanReview: "担当者対応が必要",
    reservationResponse: "予約への対応",
    ruleRegistration: "この対応からのルール",
    ruleNotCreated: "未作成",
    ruleRegistered: "登録済み",
    registeredRule: "登録したルール",
    recordedResponse: "記録した対応",
    recordedMessage: "記録した文面・引き継ぎ",
    sourceReadyHelp: "この予約への対応は完了しています。記録した対応からルールを作ると、別の予約で再利用できます。",
    sourcePublishedHelp: "条件に合う別の予約で利用できます。変更の反映には毎回、担当者の承認が必要です。",
    tryMatchingCase: "条件に合う予約で試す",
    viewSource: "作成元の対応を見る",
    requests: "ゲストからの依頼",
    noRequests: "追加の依頼なし",
    dietaryRequested: "食事制限の依頼",
    taxiRequested: "タクシーの依頼",
    compensationRequested: "補償の依頼",
    requestHandled: "対応済み",
    requestPending: "未対応",
    fixedResponseBoundary: "この対応の固定条件",
    editableBoundary: "公開前に確定する条件",
    manualEndpoint: "変更の反映や担当者への送信は行っていません。このデモではここまでです。実務では担当者が別途対応してください。",
    tryAnotherCase: "別の対応可能な予約で試す",
    noMatchingRuleHelp: "登録済みのルールでは、この依頼を扱えません。条件外の理由を確認するか、対応記録から合うルールを作成できます。",
    inspectRecordedCase: "条件に合う対応記録を見る",
    rulePublishedNotice: "対応からルールを登録しました：",
    reuseTargetNotice: "次に試せる予約を表示しています：",
    dismissNotice: "通知を閉じる",
    auditProvenance: "サイト：デモ内の草案生成・条件判定。エージェント：WebMCP経由の呼び出し。担当者：確認・承認。",
    checkConditions: "条件を確認",
    primaryPitch: "教えた対応を、条件と承認付きで再利用する。",
    teachingSource: "実例を確認",
    agentStructured: "条件を作成",
    humanConstrained: "境界を確認",
    teachingProgress: "対応ルール作成の進捗",
    teachingPanelHeading: "対応ルールを作る",
    backToReservation: "予約詳細に戻る",
    teachingRuleLabel: "対象の対応",
    teachingRuleDescription:
      "遅い到着に必要な食事と引き継ぎをまとめて扱う対応です。",
    nightTeachingRuleDescription:
      "23:00以降の到着に対する、食事制限対応・タクシー手配・引き継ぎまでの一連の対応です。",
    teachingAppliesTo: "適用の候補",
    teachingAppliesToValue: "当日の遅い到着予約",
    nightTeachingAppliesToValue: "23:00以降の到着予約",
    teachingActionCount: "含まれる対応",
    teachingRuleCount: "想定される条件数",
    teachingCountUnit: "件",
    nightBoundaryReviewBody:
      "提案された条件を確認し、条件に合う予約で利用できる状態にします。",
    agentDraftBody:
      "記録した対応から再利用条件の草案を作ります。公開前に担当者の確認が必要です。",
    createAgentDraft: "草案を作成",
    boundaryReviewHeading: "提案された条件を確認",
    boundaryReviewBody:
      "2つの提案が広すぎます。人が両方を安全側へ修正するまで公開できません。",
    latestArrivalRule: "対応する最終到着時刻",
    taxiRule: "タクシー依頼",
    dietaryRule: "食事制限の依頼",
    compensationRule: "補償依頼",
    handleInPlaybook: "対応ルールで処理",
    taxiEscalate: "担当者へ切り替える",
    compensationAllow: "自動で対応する",
    compensationEscalate: "担当者へ切り替える",
    agentProposal: "提案",
    humanBoundary: "担当者が確定",
    publishPlaybook: "対応ルールを公開",
    publishReady: "人が決めた境界を公開できます。",
    cases: "予約一覧",
    caseSearch: "予約を検索",
    caseSearchPlaceholder: "予約ID・氏名で検索",
    noMatchingCases: "一致する予約はありません",
    previousCases: "前の予約を表示",
    nextCases: "続きの予約を表示",
    previousCasesShort: "前へ",
    nextCasesShort: "次へ",
    caseUnhandled: "未対応",
    caseAwaitingReview: "確認待ち",
    caseAwaitingApplication: "反映待ち",
    caseApprovalExpired: "再確認が必要",
    caseHandled: "対応済み",
    nextAction: "次の操作",
    playbookFlow: "対応ルール",
    playbookOrigin: "作成元",
    playbookName: "レイトアライバル対応",
    playbookBoundarySummary: "7条件 · 毎回承認",
    reservationSummary: "予約内容",
    plannedArrival: "当初の到着予定",
    requestedArrival: "希望到着時刻",
    dinner: "夕食",
    included: "あり",
    none: "なし",
    readyHeading: "この予約に手順を再利用できます",
    readyBody: "担当者が承認するまで、予約は変更されません。",
    recordedHeading: "この対応から教えました",
    recordedBody:
      "この予約で記録した対応から、再利用できるルールを作成しました。別の予約を選ぶと、人が決めた範囲内で再利用できます。",
    unlearnedRecordedHeading: "この対応をルールにできます",
    unlearnedRecordedBody:
      "記録した対応を、条件付きで再利用できるルールにします。",
    sourceCaseBody:
      "この予約で記録した対応から、再利用できるルールを作成しました。",
    unlearnedSourceCaseBody:
      "この予約で記録した対応を、再利用できるルールにできます。",
    teachThisCase: "この対応から教える",
    unmatchedHeading: "この予約に使える対応ルールはありません",
    unmatchedBody:
      "この予約の条件と依頼内容を確認し、対応方法を判断してください。",
    nightPlaybookName: "夜間到着対応",
    proposedChanges: "変更案",
    appliedChanges: "反映した内容",
    applied: "承認済みの変更を反映しました。",
    notApplied: "まだ変更は反映されていません。",
    humanReviewRequired: "担当者の確認が必要です",
    noProposalCreated: "変更案は作成していません。",
    reservationId: "予約ID",
    status: "状態",
    arrival: "到着日",
    today: "本日",
    review: "適用条件",
    reviewAndApply: "確認と反映",
    criteriaPending: "未判定",
    criteriaPassed: "7/7条件を満たす",
    criteriaRefused: "確認が必要",
    criteriaAllPassed: "7/7条件を確認済み",
    criteriaPreviouslyPassed: "前回の確認結果：7/7条件を満たす",
    criterionPending: "未判定です",
    criterionPassed: "条件を満たしています",
    criterionRefused: "条件を満たしていません",
    webMcpChecking: "反映機能を確認中",
    webMcpReady: "サイトツール登録済み",
    webMcpUnavailable: "確認のみ利用できます",
    webMcpError: "変更を反映できません",
    outsideBoundary: "対応ルールの対象外",
    preparePreview: "条件を確認して変更案を作る",
    approvePreview: "承認のみ行う",
    approveAndApply: "承認して反映",
    applyApproved: "承認した内容を反映",
    applying: "反映中…",
    applyFailed: "変更を反映できませんでした。変更案を確認して、もう一度お試しください。",
    agentApprovalOptions: "エージェントに反映を任せる",
    agentApprovalHelp: "5分以内・1回限りの反映を承認し、接続したエージェントに依頼します。この画面から自分で反映することもできます。",
    approvalScope: "承認内容",
    approvalChangeCountUnit: "件の変更",
    approvalLimit: "許可範囲",
    approvalLimitValue: "承認後1回限り · 有効時間5分",
    auditEvidence:
      "条件確認、担当者の承認、変更の反映、停止した操作を記録します。",
    approvedReady: "承認済み・反映待ち",
    approvedNextStep:
      "予約はまだ変更されていません。下のボタンで反映できます。",
    approvalValidUntil: "有効期限",
    approvalTimeZone: "JST",
    approvalExactOnly: "この変更案を1回だけ反映できます。",
    approvedWithoutWebMcp:
      "現在、このページのWebMCPツールは利用できません。",
    approvalExpired: "承認期限が切れました",
    committed: "反映済み",
    prepareAgain: "もう一度準備",
    discard: "破棄",
    viewAudit: "操作履歴を見る",
    auditTrail: "操作履歴",
    closeAudit: "操作履歴を閉じる",
    webMcpConnected: "WebMCPツール登録済み",
    webMcpCheckingConnection: "WebMCPツールを登録中",
    webMcpNotConnected: "WebMCPツール利用不可",
    webMcpToolCount: "サイトツール",
    webMcpLastCall: "直近の呼び出し",
    webMcpResult: "結果",
    webMcpNoCalls: "このセッションではまだWebMCPを呼び出していません。",
    eligibility: [
      "予約が確定している",
      "到着日が本日",
      "未チェックイン",
      "到着予定が22:00まで",
      "新しい食事制限の依頼なし",
      "タクシー手配なし",
      "補償依頼なし",
    ],
    nightEligibility: [
      "予約が確定している",
      "到着日が本日",
      "未チェックイン",
      "到着予定が23:59まで",
      "食事制限の依頼に対応できる",
      "依頼されたタクシーを手配できる",
      "補償依頼なし",
    ],
  },
} as const;

export type UiCopy = (typeof UI_COPY)[UiLocale];

export function copyFor(locale: UiLocale): UiCopy {
  return UI_COPY[locale];
}

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
    "Dietary request": "Dietary request",
    Taxi: "Taxi",
    "Guest message": "Guest message",
    Handoff: "Handoff",
  },
  ja: {
    Arrival: "到着時刻",
    Meal: "食事",
    "Dietary request": "食事制限対応",
    Taxi: "タクシー手配",
    "Guest message": "ゲスト向け文面",
    Handoff: "引き継ぎ",
  },
};

const VALUE_LABELS: Record<UiLocale, Record<string, string>> = {
  en: {
    "Regular dinner": "Regular dinner",
    "Late meal box": "Late meal box",
    "No meal service": "No meal service",
    Pending: "Pending",
    Handled: "Handled",
    Requested: "Requested",
    Arranged: "Arranged",
  },
  ja: {
    "Regular dinner": "通常の夕食",
    "Late meal box": "遅い到着向けのお食事",
    "No meal service": "食事提供なし",
    Pending: "未対応",
    Handled: "対応済み",
    Requested: "依頼あり",
    Arranged: "手配済み",
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
      "移動手段の手配は、この対応ルールの対象外です。",
    "Compensation requests are outside this playbook.":
      "補償の依頼は、この対応ルールの対象外です。",
    "This case already has late-arrival handling.":
      "この予約は、すでに遅着対応済みです。",
  },
};

const ACTOR_LABELS: Record<UiLocale, Record<AuditEvent["actor"], string>> = {
  en: { Human: "Human", Agent: "Agent", Website: "Website" },
  ja: { Human: "担当者", Agent: "エージェント", Website: "サイト" },
};

const SYSTEM_MESSAGES_JA: Record<string, string> = {
  "The website created a draft of 7 rules. Human boundary review is required.": "サイトが7つの条件の草案を作成しました。担当者が任せる範囲を確認してください。",
  "Select a visible reservation before reading or changing a case.": "検索結果から予約を選んでから、内容の取得や変更を行ってください。",
  "Teachback demo ready.": "Teachbackのデモを開始できます。",
  "WebMCP tools could not be registered.":
    "エージェント用ツールを登録できませんでした。画面からの反映は利用できます。",
  "The case changed while the approved run was being committed.":
    "反映処理中に表示中の予約や状態が変わりました。変更案を確認し直してください。",
  "No changes have been applied.": "予約はまだ変更されていません。",
  "The reservation changed after the preview was created.":
    "変更案の作成後に予約が更新されています。新しい変更案を作成してください。",
  "The requested changes differ from the approved preview.":
    "表示した変更案と反映内容が一致しません。新しい変更案を作成してください。",
  "The published playbook boundary changed after preparation.":
    "変更案の作成後に適用条件が変わりました。新しい変更案を作成してください。",
  "A person must review and publish the playbook first.":
    "先に対応ルールを確認し、公開してください。",
  "The prepared run was not found.":
    "対象の変更案が見つかりません。新しい変更案を作成してください。",
  "The reservation no longer matches the published playbook boundary.":
    "現在の予約は対応ルールの条件を満たしていません。条件を確認し直してください。",
  "The run conflicts with the current case state.":
    "予約と変更案の状態が一致しません。条件を確認し直してください。",
  "There is no preview awaiting review.": "承認できる変更案がありません。",
    "Human approval is required.": "この変更案を担当者が承認する必要があります。",
  "This run was already committed.": "この変更案はすでに反映されています。",
  "The playbook was not found.": "対応ルールが見つかりません。条件を確認し直してください。",
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
  "The agent drafted 7 rules. Human boundary review is required.":
    "エージェントが7つの条件を提案しました。担当者の確認が必要です。",
  "Late Arrival Care v1 was published with human-set boundaries.":
    "人が境界を確定したレイトアライバル対応 v1 を公開しました。",
  "late-arrival-care@1 was published with human-set boundaries.":
    "人が境界を確定したレイトアライバル対応を公開しました。",
  "night-arrival-coordination@1 was published with human-set boundaries.":
    "夜間到着対応を公開しました。条件に合う予約で利用できます。",
  "Selected R-2050 as the second teaching source.":
    "R-2050を対応の記録元として選びました。",
  "The approval has expired. Prepare a new preview.":
    "承認の有効期限が切れました。もう一度、変更案を作成してください。",
};

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
  if (!["Meal", "Dietary request", "Taxi"].includes(field)) return value;
  return VALUE_LABELS[locale][value] ?? value;
}

export function reasonLabel(locale: UiLocale, reason: string): string {
  const arrivalLimit = /^Arrival is later than (\d{2}:\d{2})\.$/.exec(reason);
  if (locale === "ja" && arrivalLimit) return `到着予定が${arrivalLimit[1]}を過ぎています。`;
  return REASON_LABELS[locale][reason] ?? reason;
}

export function actorLabel(
  locale: UiLocale,
  actor: AuditEvent["actor"],
): string {
  return ACTOR_LABELS[locale][actor];
}

export function auditOperationLabel(
  locale: UiLocale,
  summary: string,
): string {
  const labels = {
    en: {
      teaching: "Recorded actions",
      draft: "Draft created",
      policy: "Condition check",
      approval: "Approval",
      application: "Applied change",
      lifecycle: "Approval status",
    },
    ja: {
      teaching: "対応を記録",
      draft: "草案を作成",
      policy: "条件評価",
      approval: "担当者の承認",
      application: "変更を反映",
      lifecycle: "承認状態",
    },
  }[locale];

  if (summary.startsWith("Recorded ")) return labels.teaching;
  if (summary.startsWith("Drafted ")) return labels.draft;
  if (summary.startsWith("Changed ") || summary.startsWith("Published ")) {
    return labels.approval;
  }
  if (summary.startsWith("Prepared ") || summary.startsWith("Rejected ")) {
    return labels.policy;
  }
  if (summary.startsWith("Approved ")) return labels.approval;
  if (summary.startsWith("Committed ")) return labels.application;
  return labels.lifecycle;
}

export function auditSummaryLabel(locale: UiLocale, summary: string): string {
  const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
    [
      /^Changed (taxi|dietary|compensation) handling from (allow|escalate) to (allow|escalate)\.$/,
      (field, _before, after) => locale === "ja"
        ? `${({ taxi: "タクシー依頼", dietary: "食事制限の依頼", compensation: "補償依頼" } as Record<string, string>)[field]}を${after === "escalate" ? "担当者判断" : "ルール内での処理"}へ変更しました。`
        : `Changed ${field} requests to ${after === "escalate" ? "require human review" : "be handled in the rule"}.`,
    ],
    [
      /^Recorded 4 semantic actions from R-2041\.$/,
      () =>
        locale === "ja"
          ? "R-2041から4つの対応を記録しました。"
          : "Recorded 4 actions from R-2041.",
    ],
    [
      /^Drafted 7 rules from R-2041 as (.+)\.$/,
      () =>
        locale === "ja"
          ? "R-2041から7つの条件を提案しました。"
          : "Created 7 proposed conditions from R-2041.",
    ],
    [
      /^Drafted 7 rules from R-2050 as (.+)\.$/,
      () =>
        locale === "ja"
          ? "R-2050から7つの条件を提案しました。"
          : "Created 7 proposed conditions from R-2050.",
    ],
    [
      /^Selected recorded case R-2050 to teach night-arrival-coordination@1\.$/,
      () =>
        locale === "ja"
          ? "R-2050を対応の記録元として選びました。"
          : "Selected R-2050 as the recorded example.",
    ],
    [
      /^Changed latest arrival from (.+) to (.+)\.$/,
      (before, after) =>
        locale === "ja"
          ? `最終到着時刻を${before}から${after}へ変更しました。`
          : `Changed the latest arrival from ${before} to ${after}.`,
    ],
    [
      /^Changed taxi handling from allow to escalate\.$/,
      () =>
        locale === "ja"
          ? "タクシー依頼を担当者判断へ変更しました。"
          : "Changed taxi requests to require human review.",
    ],
    [
      /^Published Late Arrival Care v1\.$/,
      () =>
        locale === "ja"
          ? "レイトアライバル対応 v1 を公開しました。"
          : "Published Late Arrival Care v1.",
    ],
    [
      /^Published late-arrival-care@1\.$/,
      () =>
        locale === "ja"
          ? "レイトアライバル対応を公開しました。"
          : "Published Late Arrival Care.",
    ],
    [
      /^Published night-arrival-coordination@1\.$/,
      () =>
        locale === "ja"
          ? "夜間到着対応を公開しました。"
          : "Published Night Arrival Coordination.",
    ],
    [
      /^Recorded the Late Arrival Care demonstration on (.+)\.$/,
      (reservationId) =>
        locale === "ja"
          ? `${reservationId}でレイトアライバル対応を記録しました。`
          : `Recorded Late Arrival Care on ${reservationId}.`,
    ],
    [
      /^Rejected Late Arrival Care for (.+)\.$/,
      (reservationId) =>
        locale === "ja"
          ? `${reservationId}はレイトアライバル対応の対象外でした。`
          : `${reservationId} was outside the Late Arrival Care conditions.`,
    ],
    [
      /^Prepared Late Arrival Care for (.+)\.$/,
      (reservationId) =>
        locale === "ja"
          ? `${reservationId}の変更案を準備しました。`
          : `Prepared changes for ${reservationId}.`,
    ],
    [
      /^Prepared Night Arrival Coordination for (.+)\.$/,
      (reservationId) =>
        locale === "ja"
          ? `${reservationId}の夜間到着対応案を準備しました。`
          : `Prepared night-arrival changes for ${reservationId}.`,
    ],
    [
      /^Approved preview (.+)\.$/,
      () => (locale === "ja" ? "変更案を承認しました。" : "Approved the proposed changes."),
    ],
    [
      /^Discarded preview (.+)\.$/,
      () => (locale === "ja" ? "変更案を破棄しました。" : "Discarded the proposed changes."),
    ],
    [
      /^Expired approval for preview (.+)\.$/,
      () => (locale === "ja" ? "変更案の承認期限が切れました。" : "Approval for the proposed changes expired."),
    ],
    [
      /^Committed approved run (.+) to (.+)\.$/,
      (_runId, reservationId) =>
        locale === "ja"
          ? `${reservationId}に承認済みの変更を反映しました。`
          : `Applied the approved changes to ${reservationId}.`,
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
  const teachingSource = message.match(/^Selected (.+) as a teaching source\.$/);
  if (teachingSource) return `予約 ${teachingSource[1]} の対応からルールを作成します。`;
  if (message === "Returned to reservation details.") return "予約詳細に戻りました。";
  return SYSTEM_MESSAGES_JA[message] ?? reasonLabel(locale, message);
}
