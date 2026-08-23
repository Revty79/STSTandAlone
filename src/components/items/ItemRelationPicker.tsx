import { useEffect, useState } from "react";
import type { RelatedCreatureCandidate, RelatedItemCandidate } from "../../types/item";

type ItemModeProps = {
  kind: "item";
  label: string;
  selectedName: string | null;
  findItems: (search: string) => Promise<RelatedItemCandidate[]>;
  onSelect: (candidate: RelatedItemCandidate | null) => void;
};

type CreatureModeProps = {
  kind: "creature";
  label: string;
  selectedName: string | null;
  findCreatures: (search: string) => Promise<RelatedCreatureCandidate[]>;
  onSelect: (candidate: RelatedCreatureCandidate | null) => void;
};

type Props = ItemModeProps | CreatureModeProps;

export function ItemRelationPicker(props: Props) {
  const [search, setSearch] = useState("");
  const [itemResults, setItemResults] = useState<RelatedItemCandidate[]>([]);
  const [creatureResults, setCreatureResults] = useState<RelatedCreatureCandidate[]>([]);

  useEffect(() => {
    const query = search.trim();
    if (!query || props.selectedName) {
      setItemResults([]);
      setCreatureResults([]);
      return;
    }
    let current = true;
    const timeout = window.setTimeout(() => {
      const request = props.kind === "item" ? props.findItems(query) : props.findCreatures(query);
      void request
        .then((results) => {
          if (!current) return;
          if (props.kind === "item") setItemResults(results as RelatedItemCandidate[]);
          else setCreatureResults(results as RelatedCreatureCandidate[]);
        })
        .catch(() => {
          if (current) {
            setItemResults([]);
            setCreatureResults([]);
          }
        });
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [props, search]);

  return (
    <div className="item-relation-picker">
      <span>{props.label}</span>
      {props.selectedName ? (
        <div className="item-relation-picker__selected">
          <strong>{props.selectedName}</strong>
          <button type="button" onClick={() => props.onSelect(null)}>Clear</button>
        </div>
      ) : (
        <>
          <input
            value={search}
            placeholder={`Search canonical ${props.kind}s`}
            onChange={(event) => setSearch(event.target.value)}
          />
          {props.kind === "item" && itemResults.length > 0 ? (
            <div className="item-relation-picker__results">
              {itemResults.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => { props.onSelect(candidate); setSearch(""); }}>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.canonicalId} · {candidate.recordType}</span>
                </button>
              ))}
            </div>
          ) : null}
          {props.kind === "creature" && creatureResults.length > 0 ? (
            <div className="item-relation-picker__results">
              {creatureResults.map((candidate) => (
                <button key={candidate.canonicalId} type="button" onClick={() => { props.onSelect(candidate); setSearch(""); }}>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.canonicalId} · {candidate.creatureType}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
