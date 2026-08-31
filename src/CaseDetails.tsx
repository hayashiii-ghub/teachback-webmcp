import type { Demonstration, PlaybookAction, PublishedPlaybook, Reservation } from "./domain";
import { copyFor, type UiLocale } from "./i18n";
import { NIGHT_ARRIVAL_PLAYBOOK } from "./teaching";

export function ReservationRequests({ locale, reservation }: { locale: UiLocale; reservation: Reservation }) {
  const copy = copyFor(locale);
  const requests = [
    reservation.hasNewDietaryRequest ? [copy.dietaryRequested, reservation.dietaryRequestHandled ? copy.requestHandled : copy.requestPending] : null,
    reservation.requestsTaxi ? [copy.taxiRequested, reservation.taxiArranged ? copy.requestHandled : copy.requestPending] : null,
    reservation.requestsCompensation ? [copy.compensationRequested, copy.requestPending] : null,
  ].filter(item => item !== null);
  return <div className="reservation-requests" aria-label={copy.requests}>
    <span>{copy.requests}</span>
    {requests.length ? <ul>{requests.map(([label, status]) => <li key={label}>{label}{" "}<span>{status}</span></li>)}</ul> : <p>{copy.noRequests}</p>}
  </div>;
}

export function RecordedResponse({ locale, reservation, demonstration }: {
  locale: UiLocale; reservation: Reservation; demonstration: Demonstration;
}) {
  const copy = copyFor(locale);
  const actionText = (action: PlaybookAction) => {
    switch (action.type) {
      case "set_estimated_arrival": return locale === "ja" ? `到着見込みを${reservation.estimatedArrivalTime}に設定` : `Estimated arrival set to ${reservation.estimatedArrivalTime}`;
      case "set_meal_service": return locale === "ja" ? "遅着用ミールボックスを用意" : "Late meal box prepared";
      case "handle_dietary_request": return locale === "ja" ? "食事制限に対応した食事を用意" : "Dietary-safe meal prepared";
      case "arrange_taxi": return locale === "ja" ? "依頼されたタクシーを手配" : "Requested taxi arranged";
      case "draft_guest_message": return locale === "ja" ? "ゲスト向け文面を作成" : "Guest message drafted";
      case "add_shift_handoff": return locale === "ja" ? "次のシフトへの引き継ぎを記録" : "Shift handoff recorded";
    }
  };
  return <section className="recorded-workspace" aria-labelledby="recorded-heading">
    <h2 id="recorded-heading">{copy.recordedResponse}</h2>
    <ol className="recorded-actions">{demonstration.actions.map((action, index) => <li key={action.type}><span>{index + 1}</span>{actionText(action)}</li>)}</ol>
    <details className="recorded-messages">
      <summary>{copy.recordedMessage}</summary>
      <dl>
        <div><dt>{locale === "ja" ? "ゲスト向け文面（原文）" : "Guest message (original)"}</dt><dd lang="en">{reservation.guestMessageDraft}</dd></div>
        <div><dt>{locale === "ja" ? "引き継ぎ（原文）" : "Handoff (original)"}</dt><dd lang="en">{reservation.shiftHandoff}</dd></div>
      </dl>
    </details>
  </section>;
}

export function RegisteredRule({ locale, playbook }: { locale: UiLocale; playbook: PublishedPlaybook }) {
  const copy = copyFor(locale);
  const boundary = playbook.boundary;
  return <section className="registered-rule" aria-labelledby="registered-rule-heading">
    <h3 id="registered-rule-heading">{copy.registeredRule}</h3>
    <p>{playbook.id === NIGHT_ARRIVAL_PLAYBOOK.id ? copy.nightPlaybookName : copy.playbookName}</p>
    <ul className="fixed-rules">{[copy.eligibility[0], copy.eligibility[1], copy.eligibility[2]].map(rule => <li key={rule}>{rule}</li>)}</ul>
    <dl className="rule-boundary-values">
      <div><dt>{copy.latestArrivalRule}</dt><dd>{boundary.latestArrivalLimit}</dd></div>
      <div><dt>{copy.dietaryRule}</dt><dd>{boundary.dietaryHandling === "allow" ? copy.handleInPlaybook : copy.taxiEscalate}</dd></div>
      <div><dt>{copy.taxiRule}</dt><dd>{boundary.taxiHandling === "allow" ? copy.handleInPlaybook : copy.taxiEscalate}</dd></div>
      <div><dt>{copy.compensationRule}</dt><dd>{copy.compensationEscalate}</dd></div>
      <div><dt>{copy.approvalScope}</dt><dd>{copy.playbookBoundarySummary}</dd></div>
    </dl>
  </section>;
}
