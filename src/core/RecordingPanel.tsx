import { useEffect, useId, useState } from "react";
import type {
  Command,
  Demonstration,
  Operation,
  Reservation,
  Result,
} from "./domain";
import {
  cancelRecording,
  finishRecording,
  recordCommand,
  startRecording,
} from "./recording";
import { commandLabel, type Translate } from "./ui-copy";
import { normalizedText } from "./commands";
export function RecordingPanel({
  reservation: c,
  recording,
  busy,
  act,
  t,
  onDirtyChange,
}: {
  reservation: Reservation;
  recording?: Demonstration;
  busy: boolean;
  act: (op: Operation) => Promise<Result>;
  t: Translate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const unsavedHintId = useId();
  const [arrivalDate, setArrivalDate] = useState(
    c.estimatedArrivalDate ?? c.requestedArrivalDate ?? c.arrivalDate,
  );
  const [arrivalTime, setArrivalTime] = useState(
    c.estimatedArrivalTime ?? c.plannedArrivalTime,
  );
  const [message, setMessage] = useState(c.guestMessageDraft ?? "");
  const [handoff, setHandoff] = useState(c.shiftHandoff ?? "");
  const [cancelOpen, setCancelOpen] = useState(false);
  const dirty = Boolean(recording) && (
    arrivalDate !== (c.estimatedArrivalDate ?? c.requestedArrivalDate ?? c.arrivalDate) ||
    arrivalTime !== (c.estimatedArrivalTime ?? c.plannedArrivalTime) ||
    normalizedText(message) !== (c.guestMessageDraft ?? "") ||
    normalizedText(handoff) !== (c.shiftHandoff ?? "")
  );
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  const save = (command: Command) =>
    void act((s) => recordCommand(s, c.id, c.version, command));
  if (!recording)
    return (
      <section className="core-section">
        <p className="core-eyebrow">{t("01 / 人の対応", "01 / Human work")}</p>
        <h2>
          {t("この予約への対応を記録する", "Record how you handle this case")}
        </h2>
        <p>
          {t(
            "保存した変更だけが記録されます。記録を完了すると、草案の元として使えます。",
            "Only saved changes become evidence. Complete the recording to use it as the source for a draft.",
          )}
        </p>
        <button
          className="core-primary"
          disabled={busy || c.handled}
          onClick={() => void act((s) => startRecording(s, c.id))}
        >
          {t("対応の記録を始める", "Start recording")}
        </button>
        {c.handled && (
          <p>
            {t(
              "この予約は対応済みです。未対応の予約を選んでください。",
              "This case is handled. Select an unhandled case to record.",
            )}
          </p>
        )}
      </section>
    );
  return (
    <section className="core-section">
      <div className="core-section-head">
        <h2>{t("対応を記録中", "Recording your work")}</h2>
        <span className="core-eyebrow">
          {recording.commands.length} {t("操作を保存", "saved actions")}
        </span>
      </div>
      <p>
        {t(
          "予約を実際に変更します。案内文は送信せず、下書きとして保存します。",
          "These controls update the synthetic reservation. Messages are saved as drafts, not sent.",
        )}
      </p>
      <fieldset disabled={busy} className="core-fields">
        <legend>{t("到着予定", "Estimated arrival")}</legend>
        <div className="core-inline">
          <label>
            {t("日付", "Date")}
            <input
              type="date"
              value={arrivalDate}
              onInput={(e) => setArrivalDate(e.currentTarget.value)}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
          </label>
          <label>
            {t("時刻", "Time")}
            <input
              type="time"
              value={arrivalTime}
              onInput={(e) => setArrivalTime(e.currentTarget.value)}
              onChange={(e) => setArrivalTime(e.target.value)}
            />
          </label>
        </div>
        <button
          className="core-secondary"
          onClick={() =>
            save({
              type: "set_estimated_arrival",
              input: { date: arrivalDate, time: arrivalTime },
            })
          }
        >
          {t("到着予定を保存", "Save arrival")}
        </button>
      </fieldset>
      <fieldset disabled={busy} className="core-fields">
        <legend>{t("夕食", "Dinner")}</legend>
        <p>
          {c.mealPlan !== "dinner_included" ? t(
            "この予約に夕食は含まれていません。",
            "Dinner is not included in this reservation.",
          ) : t(
            "通常の夕食から、遅い到着のための軽食へ。",
            "Change regular dinner to a meal box for late arrival.",
          )}
        </p>
        <button
          className="core-secondary"
          disabled={
            c.mealPlan !== "dinner_included" ||
            c.mealService === "late_meal_box"
          }
          onClick={() =>
            save({
              type: "set_meal_service",
              input: { value: "late_meal_box" },
            })
          }
        >
          {c.mealService === "late_meal_box"
            ? t("軽食ボックスに変更済み", "Meal box saved")
            : t("軽食ボックスに変更して保存", "Save meal box")}
        </button>
      </fieldset>
      <fieldset disabled={busy} className="core-fields">
        <legend>{t("英語案内の下書き", "Guest message draft")}</legend>
        <label>
          {t("ゲストへの案内文", "Message to the guest")}
          <textarea
            aria-label={t("ゲストへの案内文", "Message to the guest")}
            value={message}
            maxLength={1000}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(
              "この予約の名前・時刻を使って、実際の案内文を入力",
              "Write the actual message using this guest’s name and time",
            )}
          />
        </label>
        <button
          className="core-secondary"
          disabled={!message.trim()}
          onClick={() =>
            save({ type: "draft_guest_message", input: { text: message } })
          }
        >
          {t("案内文の下書きを保存", "Save message draft")}
        </button>
      </fieldset>
      <fieldset disabled={busy} className="core-fields">
        <legend>{t("スタッフへの引き継ぎ", "Shift handoff")}</legend>
        <label>
          {t("引き継ぎ内容", "Handoff text")}
          <textarea
            aria-label={t("引き継ぎ内容", "Handoff text")}
            value={handoff}
            maxLength={1000}
            rows={3}
            onChange={(e) => setHandoff(e.target.value)}
          />
        </label>
        <button
          className="core-secondary"
          disabled={!handoff.trim()}
          onClick={() =>
            save({ type: "add_shift_handoff", input: { text: handoff } })
          }
        >
          {t("引き継ぎを保存", "Save handoff")}
        </button>
      </fieldset>
      <div className="core-section">
        <h3>{t("記録した操作", "Saved operations")}</h3>
        <ol className="core-records">
          {recording.commands.map((record) => (
            <li key={record.id}>
              <span>{commandLabel(record.command.type, t)}</span>
              <small>
                {"text" in record.command.input
                  ? record.command.input.text
                  : "time" in record.command.input
                    ? `${record.command.input.date} ${record.command.input.time}`
                    : t("軽食ボックス", "Late meal box")}
              </small>
            </li>
          ))}
        </ol>
        {dirty && (
          <p id={unsavedHintId} role="status">
            {t(
              "入力中の変更が残っています。各項目を保存してから記録を完了してください。",
              "You have unsaved edits. Save each changed field before finishing the recording.",
            )}
          </p>
        )}
        <div className="core-actions">
          <button
            className="core-primary"
            disabled={busy || dirty || !recording.commands.length}
            aria-describedby={dirty ? unsavedHintId : undefined}
            onClick={() => void act((s) => finishRecording(s))}
          >
            {t("記録を完了する", "Finish recording")}
          </button>
          <button
            className="core-text"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
          >
            {t("記録を中止", "Cancel recording")}
          </button>
        </div>
        {cancelOpen && (
          <div role="alert" className="core-notice">
            <p>
              {t(
                "記録を中止しても、ここまでに保存した予約の変更は残ります。",
                "Cancelling the recording keeps the reservation changes you already saved.",
              )}
              {dirty && t(
                " 入力中の未保存の変更は破棄されます。",
                " Unsaved edits will be discarded.",
              )}
            </p>
            <button
              className="core-secondary"
              onClick={() => void act((s) => cancelRecording(s))}
            >
              {t("保存済みの対応を残して中止", "Keep saved work and cancel")}
            </button>
            <button className="core-text" onClick={() => setCancelOpen(false)}>
              {t("記録を続ける", "Continue recording")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
