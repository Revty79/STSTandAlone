import { useEffect, useState } from "react";
import type {
  RaceSkillCandidate,
  RaceSkillLinkDraft,
} from "../../types/race";
import { GRANTED_RACE_SKILL_CLASSIFICATION } from "../../data/raceOptions";

type Props = {
  links: RaceSkillLinkDraft[];
  onChange: (links: RaceSkillLinkDraft[]) => void;
  findSkills: (search: string, classification?: string) => Promise<RaceSkillCandidate[]>;
};

type SectionProps = {
  title: string;
  eyebrow: string;
  description: string;
  linkType: "bonus" | "granted";
  links: RaceSkillLinkDraft[];
  onChange: (links: RaceSkillLinkDraft[]) => void;
  findSkills: (search: string, classification?: string) => Promise<RaceSkillCandidate[]>;
};

function move<T>(items: T[], from: number, offset: number): T[] {
  const to = from + offset;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SkillLinkSection({
  title,
  eyebrow,
  description,
  linkType,
  links,
  onChange,
  findSkills,
}: SectionProps) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<RaceSkillCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      findSkills(
        search,
        linkType === "granted" ? GRANTED_RACE_SKILL_CLASSIFICATION : undefined,
      )
        .then((result) => { if (current) setCandidates(result); })
        .catch(() => { if (current) setCandidates([]); })
        .finally(() => { if (current) setLoading(false); });
    }, 180);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [findSkills, search]);

  const add = (skill: RaceSkillCandidate) => {
    if (links.some((link) => link.skillId === skill.id)) return;
    onChange([
      ...links,
      {
        skillId: skill.id,
        skillName: skill.name,
        skillClassification: skill.classification,
        linkType,
        value: linkType === "bonus" ? 0 : null,
        sortOrder: links.length,
      },
    ]);
  };

  return (
    <section className="race-editor-section race-skill-section">
      <div className="race-editor-section__heading">
        <div><p>{eyebrow}</p><h3>{title}</h3></div>
      </div>
      <p className="race-editor-section__note">{description}</p>
      <div className="race-skill-picker">
        <label>
          <span>Search existing Skills</span>
          <input type="search" value={search} placeholder="Type a Skill name" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="race-skill-picker__results" aria-live="polite">
          {loading ? <span>Searching the Skill Library…</span> : candidates.map((skill) => {
            const added = links.some((link) => link.skillId === skill.id);
            return (
              <button key={skill.id} type="button" disabled={added} onClick={() => add(skill)}>
                <strong>{skill.name}</strong>
                <span>{skill.classification}{skill.tier ? ` · Tier ${skill.tier}` : ""}</span>
                <b>{added ? "Added" : "Add"}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className="race-repeat-list race-skill-links">
        {links.length === 0 ? <p className="race-empty-row">No {title.toLocaleLowerCase()} assigned.</p> : null}
        {links.map((link, index) => (
          <div className="race-repeat-row race-repeat-row--skill" key={`${linkType}-${link.skillId}`}>
            <div className="race-linked-skill">
              <strong>{link.skillName}</strong>
              <span>{link.skillClassification}</span>
            </div>
            <label>
              <span>{linkType === "bonus" ? "Bonus" : "Point Value (optional)"}</span>
              <input
                type="number"
                value={link.value ?? ""}
                onChange={(event) => onChange(links.map((item, current) => current === index ? {
                  ...item,
                  value: event.target.value === "" ? null : Number(event.target.value),
                } : item))}
              />
            </label>
            <div className="race-repeat-row__actions">
              <button type="button" disabled={index === 0} onClick={() => onChange(move(links, index, -1))}>Up</button>
              <button type="button" disabled={index === links.length - 1} onClick={() => onChange(move(links, index, 1))}>Down</button>
              <button className="is-danger" type="button" onClick={() => onChange(links.filter((_, current) => current !== index))}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RaceSkillsEditor({ links, onChange, findSkills }: Props) {
  const bonuses = links.filter((link) => link.linkType.toLocaleLowerCase() === "bonus");
  const granted = links.filter((link) => link.linkType.toLocaleLowerCase() === "granted");
  const custom = links.filter((link) => !["bonus", "granted"].includes(link.linkType.toLocaleLowerCase()));
  const replace = (linkType: "bonus" | "granted", replacement: RaceSkillLinkDraft[]) =>
    onChange(linkType === "bonus" ? [...replacement, ...granted, ...custom] : [...bonuses, ...replacement, ...custom]);

  return (
    <div className="race-skills-editor">
      <SkillLinkSection
        title="Skill Bonuses"
        eyebrow="RACIAL MODIFIERS"
        description="These links modify existing Skill records; the Race stores only the bonus value."
        linkType="bonus"
        links={bonuses}
        onChange={(replacement) => replace("bonus", replacement)}
        findSkills={findSkills}
      />
      <SkillLinkSection
        title="Granted Skills / Racial Abilities"
        eyebrow="RACIAL ACCESS"
        description="Only existing Skills classified as Special Ability can be granted as racial abilities."
        linkType="granted"
        links={granted}
        onChange={(replacement) => replace("granted", replacement)}
        findSkills={findSkills}
      />
    </div>
  );
}
