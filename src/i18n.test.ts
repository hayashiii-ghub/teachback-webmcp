import { describe, expect, it } from "vitest";
import {
  actorLabel,
  auditOperationLabel,
  auditSummaryLabel,
  copyFor,
  fieldLabel,
  reasonLabel,
  statusLabel,
  systemMessageLabel,
  valueLabel,
} from "./i18n";

describe("Teachback UI localization", () => {
  it("provides a complete Japanese operator vocabulary", () => {
    const copy = copyFor("ja");

    expect(copy.eligibility).toHaveLength(7);
    expect(statusLabel("ja", "confirmed")).toBe("確定");
    expect(fieldLabel("ja", "Guest message")).toBe("ゲスト向け文面");
    expect(valueLabel("ja", "Meal", "Late meal box")).toBe(
      "遅い到着向けのお食事",
    );
    expect(copy.playbookFlow).toBe("対応ルール");
    expect(copy.caseUnhandled).toBe("未対応");
    expect(copy.caseAwaitingReview).toBe("確認待ち");
    expect(copy.caseHandled).toBe("対応済み");
    expect(copy.nextAction).toBe("次の操作");
    expect(copy.criteriaPending).toBe("未判定");
    expect(copy.webMcpReady).toBe("反映できます");
    expect(copy.approvalValidUntil).toBe("有効期限");
    expect(copy.approvalExactOnly).toBe(
      "この画面で承認した変更案だけを、このあと一度だけ反映できます。",
    );
    expect(copy.demoDataNotice).toContain("架空");
    expect(copy.teachingHeadline).toContain("再利用ルール");
    expect(copy.demonstrationActionLabels).toHaveLength(4);
  });

  it("keeps exact guest-facing and handoff content unchanged", () => {
    const guestMessage =
      "We have noted your late arrival. Your meal box will be ready at reception.";
    const handoff =
      "Late arrival expected at 20:45. Meal box and English guest message prepared.";

    expect(valueLabel("ja", "Guest message", guestMessage)).toBe(guestMessage);
    expect(valueLabel("ja", "Handoff", handoff)).toBe(handoff);
    expect(valueLabel("ja", "Guest message", "Late meal box")).toBe(
      "Late meal box",
    );
  });

  it("localizes refusal reasons and audit events at render time", () => {
    expect(
      reasonLabel("ja", "Arrival is later than 22:00."),
    ).toBe("到着予定が22:00を過ぎています。");
    expect(actorLabel("ja", "Human")).toBe("担当者");
    expect(
      auditSummaryLabel(
        "ja",
        "Prepared Late Arrival Care for R-2048.",
      ),
    ).toBe("R-2048の変更案を準備しました。");
    expect(
      auditOperationLabel(
        "ja",
        "Committed approved run run-1 to R-2048.",
      ),
    ).toBe("変更を反映");
    expect(
      auditSummaryLabel(
        "ja",
        "Drafted 7 rules from R-2050 as internal-draft-id.",
      ),
    ).toBe("R-2050から7つの条件を提案しました。");
  });

  it("localizes live announcements without changing unknown messages", () => {
    expect(systemMessageLabel("ja", "Selected reservation R-2052.")).toBe(
      "予約 R-2052 を選択しました。",
    );
    expect(systemMessageLabel("ja", "Unknown diagnostic")).toBe(
      "Unknown diagnostic",
    );
  });
});
