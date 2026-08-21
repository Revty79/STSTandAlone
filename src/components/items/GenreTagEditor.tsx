type Props = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function GenreTagEditor({ value, onChange }: Props) {
  return (
    <label className="item-form__wide">
      <span>Genre Tags</span>
      <input
        value={value.join(", ")}
        placeholder="Fantasy, Sci-Fi, Universal"
        onChange={(event) =>
          onChange(event.target.value.split(",").map((tag) => tag.trim()))
        }
      />
      <small>Separate flexible genre labels with commas.</small>
    </label>
  );
}
