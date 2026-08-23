import { useEffect, useState } from "react";
import type { CreatureSkillCandidate, CreatureSkillLinkDraft } from "../../types/creature";

type Props = {
  links: CreatureSkillLinkDraft[];
  onChange: (links: CreatureSkillLinkDraft[]) => void;
  findSkills: (search: string) => Promise<CreatureSkillCandidate[]>;
};

export function CreatureSkillsEditor({ links, onChange, findSkills }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CreatureSkillCandidate[]>([]);
  useEffect(() => {
    let current = true;
    const timeout = window.setTimeout(() => {
      void findSkills(search).then((items) => { if (current) setResults(items); }).catch(() => { if (current) setResults([]); });
    }, 180);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [findSkills, search]);

  function add(candidate: CreatureSkillCandidate) {
    if (links.some((link) => link.skillId === candidate.id)) return;
    onChange([...links, { skillId: candidate.id, skillName: candidate.name, skillClassification: candidate.classification, rank: null, notes: "", sortOrder: links.length }]);
  }

  return (
    <section className="creature-section">
      <div className="creature-section__heading"><div><p>CANONICAL REFERENCES</p><h3>Creature Skills</h3></div></div>
      <p className="creature-section__description">Only existing canonical Serrian Tide Skills can be linked here. Natural attacks remain independent.</p>
      <label className="creature-skill-search"><span>Find canonical Skill</span><input value={search} placeholder="Search Skills" onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="creature-skill-results">
        {results.map((candidate) => <button type="button" key={candidate.id} onClick={() => add(candidate)}><strong>{candidate.name}</strong><span>{candidate.classification}{candidate.tier ? ` · Tier ${candidate.tier}` : ""}</span><b>Add</b></button>)}
      </div>
      <div className="creature-repeat-list creature-skill-links">
        {links.length === 0 ? <p className="race-empty-row">No canonical Skills are assigned. That is valid for a Creature.</p> : links.map((link, index) => (
          <article className="creature-repeat-row" key={`${link.skillId}-${index}`}>
            <header><strong>{link.skillName}</strong><button type="button" onClick={() => onChange(links.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></header>
            <div className="creature-repeat-row__fields">
              <label><span>Rank</span><input value={link.rank ?? ""} onChange={(event) => onChange(links.map((row, rowIndex) => rowIndex === index ? { ...row, rank: event.target.value || null } : row))} /></label>
              <label className="creature-field--wide"><span>Notes</span><textarea value={link.notes} onChange={(event) => onChange(links.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row))} /></label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
