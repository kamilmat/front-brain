import { Suspense } from 'react';
import { DEMOS, SECTIONS } from '../demos/registry';
import { href } from '../router';

export function SectionPage({ sectionId, page }: { sectionId: string; page?: string }) {
  const section = SECTIONS.find((s) => s.id === sectionId)!;
  const demos = DEMOS.filter((d) => d.section === sectionId);
  const demo = demos.find((d) => d.id === page);
  return (
    <div className="section-layout">
      <nav className="subnav">
        <a href={href(section.id)} className={!demo ? 'active' : ''}>
          {section.icon} Overview
        </a>
        {demos.map((d) => (
          <a key={d.id} href={href(section.id, d.id)} className={d.id === page ? 'active' : ''}>
            {d.title}
            {d.mobile && <span title="Runs on phones"> 📱</span>}
          </a>
        ))}
      </nav>
      <div className="section-content">
        {demo ? (
          <>
            <div className="page-head">
              <div className="crumbs">
                <a href={href(section.id)}>{section.title}</a> /
              </div>
              <h2>{demo.title}</h2>
              <p>
                {demo.desc} <span className="badge">{demo.lib}</span>
              </p>
            </div>
            <Suspense fallback={<p className="hint">Loading demo…</p>}>
              <demo.component key={demo.id} />
            </Suspense>
          </>
        ) : (
          <>
            <div className="page-head">
              <h2>
                {section.icon} {section.title}
              </h2>
              <p>{section.desc}</p>
            </div>
            <div className="tiles">
              {demos.map((d) => (
                <a key={d.id} className="tile" href={href(section.id, d.id)}>
                  <b>
                    {d.title}
                    {d.mobile && ' 📱'}
                  </b>
                  <span>{d.desc}</span>
                  <small className="badge">{d.lib}</small>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
