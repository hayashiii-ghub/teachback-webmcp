import { Fragment } from "react";
import type { PlaybookBoundary } from "./domain";
import { copyFor, type UiLocale } from "./i18n";
import { NIGHT_ARRIVAL_PLAYBOOK, type PlaybookDefinition } from "./teaching";

export function BoundaryEditor({ locale, boundary, definition, onChange, publishable }: {
  locale: UiLocale;
  boundary: PlaybookBoundary;
  definition: PlaybookDefinition;
  onChange(patch: Partial<PlaybookBoundary>): void;
  publishable: boolean;
}) {
  const copy = copyFor(locale);
  const isNight = definition.id === NIGHT_ARRIVAL_PLAYBOOK.id;
  const fields = ["latestArrivalLimit", "dietaryHandling", "taxiHandling", "compensationHandling"] as const;
  const labels = { latestArrivalLimit: copy.latestArrivalRule, dietaryHandling: copy.dietaryRule, taxiHandling: copy.taxiRule, compensationHandling: copy.compensationRule };
  const editable = fields.filter(field => (isNight ? field === "compensationHandling" : field === "latestArrivalLimit" || field === "taxiHandling") || boundary[field] !== definition.boundary[field]);
  const fixed = fields.filter(field => !editable.includes(field));
  const mismatches = fields.filter(field => boundary[field] !== definition.boundary[field]);
  const value = (field: typeof fields[number], source: PlaybookBoundary = boundary) => field === "latestArrivalLimit" ? source[field] : source[field] === "allow" ? copy.handleInPlaybook : copy.taxiEscalate;
  return <>
    <details className="fixed-boundary-details">
      <summary>{copy.fixedResponseBoundary}</summary>
      <ul className="fixed-rules">{[copy.eligibility[0], copy.eligibility[1], copy.eligibility[2], locale === "ja" ? "実行ごとに人が承認" : "Human approval every run"].map(rule => <li key={rule}>{rule}</li>)}</ul>
      <dl className="rule-boundary-values">{fixed.map(field => <div key={field}><dt>{labels[field]}</dt><dd>{value(field)}</dd></div>)}</dl>
    </details>
    <div className="boundary-section-heading"><strong>{copy.editableBoundary}</strong><span>{publishable ? copy.humanBoundary : copy.agentProposal}</span></div>
    {editable.map(field => {
      const safe = boundary[field] === definition.boundary[field];
      const id = field === "latestArrivalLimit" ? "latest-arrival-boundary" : field === "taxiHandling" ? "taxi-boundary" : field === "compensationHandling" ? "compensation-boundary" : "dietary-boundary";
      return <div className={`boundary-control ${safe ? "is-safe" : "is-risky"}`} key={field}>
        <label htmlFor={id}>{labels[field]}</label>
        <select id={id} value={boundary[field]} aria-describedby={!safe ? "boundary-correction" : undefined} onChange={event => onChange({ [field]: event.target.value })}>
          {field === "latestArrivalLimit" ? ["22:00", "23:00", "23:59"].map(time => <option key={time} value={time}>{time}</option>) : <>
            <option value="allow">{field === "compensationHandling" ? copy.compensationAllow : copy.handleInPlaybook}</option>
            <option value="escalate">{copy.taxiEscalate}</option>
          </>}
        </select>
      </div>;
    })}
    <p id="boundary-correction" className={`publish-note${publishable ? " is-ready" : ""}`} role="status">
      {publishable ? copy.publishReady : <>
        {locale === "ja" ? "公開するには、次の条件を変更してください。" : "To publish, change the following conditions:"}
        {mismatches.map(field => <Fragment key={field}><br />{labels[field]}: {value(field, definition.boundary)}</Fragment>)}
      </>}
    </p>
  </>;
}
