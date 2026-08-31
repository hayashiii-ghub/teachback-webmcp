import type { PublishedPlaybook } from "./domain";
import { commandLabel, templateText, type Translate } from "./ui-copy";
export function PlaybookDetails({
  playbook: p,
  t,
}: {
  playbook: PublishedPlaybook;
  t: Translate;
}) {
  return (
    <section className="core-section">
      <p className="core-eyebrow">
        {t("人が確認・公開", "Reviewed and published by a person")} · v
        {p.version}
      </p>
      <h2>{p.name}</h2>
      <p>{p.purpose}</p>
      <ol className="core-records">
        {p.steps.map((step) => (
          <li key={step.id}>
            <span>{commandLabel(step.type, t)}</span>
            {"template" in step.input && (
              <small>{templateText(step.input.template)}</small>
            )}
          </li>
        ))}
      </ol>
      <dl className="core-meta">
        <div>
          <dt>{t("最終到着時刻", "Latest arrival")}</dt>
          <dd>{p.boundary.latestArrivalTime}</dd>
        </div>
        <div>
          <dt>{t("承認", "Approval")}</dt>
          <dd>
            {t(
              "変更案ごと・1回限り・5分間",
              "Per proposal · once · five minutes",
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
