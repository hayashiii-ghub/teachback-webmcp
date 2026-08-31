import type { CommandType, Issue, Reservation, TextToken } from "./domain";
export type Locale = "ja" | "en";
export type Translate = (ja: string, en: string) => string;
export const translate =
  (locale: Locale): Translate =>
  (ja, en) =>
    locale === "ja" ? ja : en;
export function commandLabel(type: CommandType, t: Translate) {
  return {
    set_estimated_arrival: t("到着予定を更新", "Update arrival"),
    set_meal_service: t("軽食ボックスに変更", "Prepare meal box"),
    draft_guest_message: t("英語案内の下書き", "Draft guest message"),
    add_shift_handoff: t("引き継ぎを記録", "Add shift handoff"),
  }[type];
}
export function fieldLabel(field: string, t: Translate) {
  const labels: Partial<Record<keyof Reservation, string>> = {
    estimatedArrivalDate: t("到着日", "Arrival date"),
    estimatedArrivalTime: t("到着予定", "Arrival time"),
    mealService: t("夕食", "Dinner"),
    guestMessageDraft: t("ゲスト向け下書き", "Guest message draft"),
    shiftHandoff: t("引き継ぎ", "Shift handoff"),
  };
  return labels[field as keyof Reservation] ?? field;
}
export function valueText(value: unknown, t: Translate): string {
  if (value === null || value === undefined || value === "")
    return t("未設定", "Not set");
  if (value === "late_meal_box") return t("軽食ボックス", "Late meal box");
  if (value === "regular_dinner") return t("通常の夕食", "Regular dinner");
  if (value === "none") return t("なし", "None");
  return String(value);
}
export function templateText(tokens: TextToken[]) {
  return tokens
    .map((token) =>
      token.kind === "literal" ? token.value : `{{${token.field}}}`,
    )
    .join("");
}
export function parseTemplate(text: string): TextToken[] {
  const parts = text
    .split(/(\{\{(?:guestDisplayName|requestedArrivalTime)\}\})/g)
    .filter(Boolean);
  return parts.map((part) =>
    part === "{{guestDisplayName}}"
      ? { kind: "case_field", field: "guestDisplayName" }
      : part === "{{requestedArrivalTime}}"
        ? { kind: "case_field", field: "requestedArrivalTime" }
        : { kind: "literal", value: part },
  );
}
export function issueText(issue: Issue, t: Translate): string {
  const request =
    (
      {
        hasNewDietaryRequest: "新しい食事制限",
        requestsTaxi: "タクシー",
        requestsCompensation: "補償",
        requestsCancellation: "キャンセル",
        requestsPaymentChange: "支払変更",
      } as Record<string, string>
    )[issue.path] ?? "追加";
  const known: Record<string, string> = {
    ARRIVAL_AFTER_BOUNDARY:
      "到着時刻がこの手順の上限を超えています。担当者が個別に対応してください。",
    ARRIVAL_NOT_TODAY: "到着日が本日の予約だけに利用できます。",
    ARRIVAL_TIME_UNKNOWN: "希望到着時刻が不明です。担当者が確認してください。",
    BOUNDARY_TOO_WIDE:
      "施設の上限は22:00です。それ以前の時刻を指定してください。",
    INVALID_BOUNDARY:
      "到着時刻の上限を、正しい時刻で指定してください。固定の制約は変更できません。",
    REQUESTED_DATE_MISMATCH:
      "希望到着日が予約日と一致していません。日付を確認してください。",
    REQUEST_REQUIRES_PERSON: `${request}の依頼は、この手順では対応せず担当者に返します。`,
    SAFETY_INFORMATION_UNKNOWN: `${request}の依頼の有無が不明です。担当者が確認してください。`,
    CASE_ALREADY_HANDLED: "すでに対応済みの予約を再処理することはできません。",
    EXISTING_CONTENT_REQUIRES_PERSON:
      "既存の文面があります。無条件で上書きせず、担当者が確認してください。",
    MEAL_NOT_ELIGIBLE:
      "夕食付きで、通常の夕食が設定された予約だけに食事変更を利用できます。",
    RESERVATION_NOT_CONFIRMED:
      "確定済み・未チェックインの予約だけに利用できます。",
    SOURCE_VALUE_NOT_PARAMETERIZED:
      "元のお客さんの名前や時刻が固定されています。次の予約の値を使う変数に置き換えてください。",
    SOURCE_REPLAY_MISMATCH:
      "草案から元の対応を再現できません。記録した文面と操作を保って変数化してください。",
    SOURCE_REPLAY_FAILED:
      "元の対応を再現できません。操作の入力を確認してください。",
    MISSING_RECORDED_CHANGE:
      "記録の最終的な変更が草案から抜けています。すべての変更を含めてください。",
    ACTION_NOT_DEMONSTRATED:
      "この操作は元の記録にありません。追加したい場合は新しく実演してください。",
    FINAL_EVIDENCE_REQUIRED: "最終的な値を保存した操作を根拠に含めてください。",
    EVIDENCE_NOT_FOUND: "根拠として指定した操作が、この記録にありません。",
    EVIDENCE_ACTION_MISMATCH: "根拠の操作と、草案の操作の種類が一致しません。",
    UNRESOLVED_QUESTIONS:
      "未解決の確認事項があります。人が確認してから公開してください。",
    UNRESOLVED_CASE_FIELD:
      "参照する予約情報が不明です。担当者が確認してください。",
    INPUT_TOO_LARGE: "入力が大きすぎます。草案全体を16KiB以内にしてください。",
    INVALID_JSON_VALUE: "JSONとして扱えない入力が含まれています。",
    INVALID_ACTION_INPUT:
      "操作の入力・変数を、許可された形式で指定してください。",
    INVALID_EVIDENCE: "実在する記録の根拠IDを指定してください。",
    INVALID_QUESTIONS: "確認事項は500文字以内の文を配列で指定してください。",
    INVALID_RESOLVED_TEXT: "変数を置き換えた文面が長すぎるか空になっています。",
    INVALID_STEPS: "操作は1〜4種類で指定してください。",
    INVALID_STEP_ID: "手順のIDが無効か重複しています。",
    INVALID_TEXT: "入力が空か、文字数の上限を超えています。",
    UNKNOWN_OR_MISSING_FIELD:
      "不足している項目、または許可されていない項目があります。",
    UNSUPPORTED_OR_REPEATED_ACTION:
      "未対応の操作、または同じ種類の操作の重複があります。",
  };
  return t(known[issue.code] ?? issue.message, issue.message);
}
