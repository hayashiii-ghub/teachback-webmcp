import { describe, expect, it } from "vitest";
import {
  actorLabel,
  auditOperationLabel,
  auditSummaryLabel,
  caseLabel,
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
    expect(caseLabel("ja", "Recorded")).toBe("教えた例");
    expect(caseLabel("ja", "Needs review")).toBe("成功例 · 条件一致");
    expect(caseLabel("ja", "Human only")).toBe("停止例 · 条件不一致");
    expect(caseLabel("ja", "Resolved")).toBe("再利用済み");
    expect(statusLabel("ja", "confirmed")).toBe("確定");
    expect(fieldLabel("ja", "Guest message")).toBe(
      "ゲスト向け文面（英語・原文）",
    );
    expect(valueLabel("ja", "Meal", "Late meal box")).toBe(
      "遅い到着向けのお食事",
    );
    expect(copy.playbookFlow).toBe("Teachbackの流れ");
    expect(copy.criteriaPending).toBe("未判定");
    expect(copy.webMcpReady).toBe("利用可能 · 3ツール");
    expect(copy.approvalValidUntil).toBe("有効期限");
    expect(copy.demoDataNotice).toContain("合成データ");
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
    ).toBe("teachback_commit_approved");
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
