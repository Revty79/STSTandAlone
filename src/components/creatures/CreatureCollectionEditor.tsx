import type { ReactNode } from "react";

export type CreatureCollectionOption = { value: string; label: string };
export type CreatureCollectionField<Row> = {
  key: keyof Row & string;
  label: string;
  type?: "text" | "nullableText" | "number" | "textarea" | "select" | "nullableSelect";
  options?: readonly CreatureCollectionOption[];
  min?: number;
  max?: number;
  step?: number;
  wide?: boolean;
};

type Props<Row> = {
  eyebrow: string;
  title: string;
  description?: string;
  rows: Row[];
  fields: readonly CreatureCollectionField<Row>[];
  createRow: () => Row;
  onChange: (rows: Row[]) => void;
  emptyMessage: string;
  addLabel: string;
  rowHeading?: (row: Row, index: number) => ReactNode;
};

function nextValue(type: CreatureCollectionField<never>["type"], value: string): string | number | null {
  if (type === "number") return value === "" ? null : Number(value);
  if (type === "nullableText") return value === "" ? null : value;
  if (type === "nullableSelect") return value === "" ? null : value;
  return value;
}

export function CreatureCollectionEditor<Row extends object>({
  eyebrow, title, description, rows, fields, createRow, onChange, emptyMessage,
  addLabel, rowHeading,
}: Props<Row>) {
  function update(index: number, field: CreatureCollectionField<Row>, value: string) {
    onChange(rows.map((row, rowIndex) => rowIndex === index
      ? { ...row, [field.key]: nextValue(field.type, value) }
      : row));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <section className="creature-section">
      <div className="creature-section__heading">
        <div><p>{eyebrow}</p><h3>{title}</h3></div>
        <button type="button" onClick={() => onChange([...rows, createRow()])}>{addLabel}</button>
      </div>
      {description ? <p className="creature-section__description">{description}</p> : null}
      <div className="creature-repeat-list">
        {rows.length === 0 ? <p className="race-empty-row">{emptyMessage}</p> : rows.map((row, index) => (
          <article className="creature-repeat-row" key={index}>
            <header>
              <strong>{rowHeading?.(row, index) ?? `${title} ${index + 1}`}</strong>
              <div className="creature-repeat-row__actions">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${title} ${index + 1} up`}>↑</button>
                <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${title} ${index + 1} down`}>↓</button>
                <button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
              </div>
            </header>
            <div className="creature-repeat-row__fields">
              {fields.map((field) => {
                const value = row[field.key] as string | number | null | undefined;
                const className = field.wide ? "creature-field creature-field--wide" : "creature-field";
                if (field.type === "textarea") return (
                  <label className={className} key={field.key}><span>{field.label}</span><textarea value={String(value ?? "")} onChange={(event) => update(index, field, event.target.value)} /></label>
                );
                if (field.type === "select" || field.type === "nullableSelect") return (
                  <label className={className} key={field.key}><span>{field.label}</span><select value={String(value ?? "")} onChange={(event) => update(index, field, event.target.value)}>{field.options?.map((option) => <option key={option.value || "<blank>"} value={option.value}>{option.label}</option>)}</select></label>
                );
                return (
                  <label className={className} key={field.key}>
                    <span>{field.label}</span>
                    <input type={field.type === "number" ? "number" : "text"} min={field.min} max={field.max} step={field.step} value={value ?? ""} onChange={(event) => update(index, field, event.target.value)} />
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
