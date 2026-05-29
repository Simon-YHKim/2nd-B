import React from 'react';

export type PremiumIslandKey =
  | 'core_center'
  | 'work_growth'
  | 'relationship'
  | 'knowledge'
  | 'records'
  | 'imagine'
  | 'inspiration';

const islandMap: Record<PremiumIslandKey, string> = {
  core_center: '/assets/premium-closing/islands/png/core_center_island.png',
  work_growth: '/assets/premium-closing/islands/png/domain_work_growth_island.png',
  relationship: '/assets/premium-closing/islands/png/domain_relationship_island.png',
  knowledge: '/assets/premium-closing/islands/png/domain_knowledge_island.png',
  records: '/assets/premium-closing/islands/png/domain_records_island.png',
  imagine: '/assets/premium-closing/islands/png/domain_imagine_island.png',
  inspiration: '/assets/premium-closing/islands/png/domain_inspiration_island.png',
};

export function PremiumGraphIsland({ type, selected = false, label }: { type: PremiumIslandKey; selected?: boolean; label?: string }) {
  return (
    <figure className="premium-graph-island" aria-label={label}>
      <img className="graph-island-sprite" data-selected={selected} src={islandMap[type]} alt="" aria-hidden="true" />
      {label ? <figcaption className="premium-graph-island__label">{label}</figcaption> : null}
    </figure>
  );
}

export function PremiumCard({ title, subtitle, children, tone = 'violet' }: { title: string; subtitle?: string; children: React.ReactNode; tone?: 'violet' | 'mint' | 'gold' }) {
  return (
    <section className={`premium-card premium-card--${tone}`}>
      <header className="premium-card__header">
        <div>
          <h2 className="premium-card__title">{title}</h2>
          {subtitle ? <p className="premium-card__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      <div className="premium-card__body">{children}</div>
    </section>
  );
}

export function PremiumQuestionnaireCard({ current, total, title, prompt, children }: { current: number; total: number; title: string; prompt: string; children: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  return (
    <section className="premium-questionnaire-card">
      <div className="premium-progress-rail" aria-label={`진행률 ${pct}%`}>
        <div className="premium-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="premium-card__subtitle">{current} / {total}</p>
      <h2 className="premium-card__title">{title}</h2>
      <p className="premium-card__subtitle">{prompt}</p>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>{children}</div>
    </section>
  );
}
