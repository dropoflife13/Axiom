import AxiomAnatomy from './AxiomAnatomy';

const parts = [
  ['Task generator', 'Seeded tasks: 40 train, 40 dev, and 120 test tasks.'],
  ['Executor', 'An LLM behind an OpenAI-compatible client at temperature 0.'],
  ['Oracle', 'PostgreSQL 16 in a container with fresh databases and role-separated checks.'],
  ['Verdict', 'Reports each failure as a fact ID and one-line statement, never corrected SQL.'],
  ['Advisor', 'Writes one lesson from a failed verdict only when the retry passes.'],
  ['Memory', 'Stores the lessons that have earned their place.'],
  ['Retrieval', 'Picks the top k=6 lessons by feature-flag overlap before attempt 1.'],
  ['Guardrails', 'Fails closed on daily budget limits, backs off rate limits, and caches responses.'],
  ['Quarantine and promotion gate', 'Keeps generated rules as candidates until a human promotes them.'],
];

export function AnatomySection() {
  return (
    <section className="anatomy-section" aria-labelledby="anatomy-title">
      <div className="anatomy-section__intro">
        <p className="anatomy-section__eyebrow">The system behind the signal</p>
        <h2 id="anatomy-title">Anatomy of Axiom</h2>
        <p>Axiom is a machine for testing generated migrations against rules that are not visible to the model.</p>
        <p>Every failure becomes evidence, and only evidence that survives a retry can become memory.</p>
      </div>
      <div className="anatomy-frame">
        <AxiomAnatomy />
      </div>
      <dl className="anatomy-parts">
        {parts.map(([term, role]) => (
          <div className="anatomy-part" key={term}>
            <dt>{term}</dt>
            <dd>{role}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
