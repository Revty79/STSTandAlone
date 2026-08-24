import { useState } from "react";
import type { CampaignRaceReference } from "../../types/campaign";
import type { CharacterMagicSystem } from "../../features/characters/characterRules";
import {
  RANDOM_CHARACTER_EQUIPMENT_OPTIONS,
  RANDOM_CHARACTER_FOCUS_OPTIONS,
  RANDOM_CHARACTER_TEMPERAMENT_OPTIONS,
  type GuidedRandomCharacterAnswers,
  type RandomCharacterEquipment,
  type RandomCharacterFocus,
  type RandomCharacterMagic,
  type RandomCharacterTemperament,
} from "../../features/characters/randomCharacter";

const STEPS = ["Identity", "Approach", "Magic", "Equipment", "Temperament"] as const;

function ChoiceButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "is-active" : ""} onClick={onClick}>
      <strong>{title}</strong>
      <small>{description}</small>
    </button>
  );
}

export function GuidedRandomCharacterDialog({
  races,
  magicSystems,
  generating,
  onGenerate,
  onCancel,
}: {
  races: CampaignRaceReference[];
  magicSystems: CharacterMagicSystem[];
  generating: boolean;
  onGenerate: (answers: GuidedRandomCharacterAnswers) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<GuidedRandomCharacterAnswers>({
    name: "",
    raceId: null,
    focus: "balanced",
    magic: "surprise",
    equipment: "mixed",
    temperament: "curious",
  });

  function update<K extends keyof GuidedRandomCharacterAnswers>(
    key: K,
    value: GuidedRandomCharacterAnswers[K],
  ) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="random-character-guide" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="random-character-guide-title">
        <header>
          <div>
            <p>GUIDED RANDOM · QUESTION {step + 1} OF {STEPS.length}</p>
            <h2 id="random-character-guide-title">{STEPS[step]}</h2>
          </div>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </header>
        <div className="random-character-guide__progress"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

        {step === 0 ? (
          <div className="random-character-guide__question">
            <h3>Who should the program begin with?</h3>
            <p>A name is optional. Leave it blank and the program will provide one.</p>
            <label><span>Character Name · Optional</span><input value={answers.name} onChange={(event) => update("name", event.target.value)} placeholder="Generate a name for me" /></label>
            <label><span>Race</span><select value={answers.raceId ?? ""} onChange={(event) => update("raceId", event.target.value ? Number(event.target.value) : null)}><option value="">Surprise Me</option>{races.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}</select></label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="random-character-guide__question">
            <h3>How do they tend to solve problems?</h3>
            <p>This guides Attributes and makes matching Skills more likely. The program still spends every legal point.</p>
            <div className="random-character-guide__choices">{RANDOM_CHARACTER_FOCUS_OPTIONS.map((option) => <ChoiceButton key={option.value} active={answers.focus === option.value} title={option.label} description={option.description} onClick={() => update("focus", option.value as RandomCharacterFocus)} />)}</div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="random-character-guide__question">
            <h3>Should magic shape this Character?</h3>
            <p>Only magic systems permitted by this Campaign are offered.</p>
            <div className="random-character-guide__choices">
              <ChoiceButton active={answers.magic === "none"} title="No Magical Focus" description="Favor ordinary Skills and physical or social training." onClick={() => update("magic", "none")} />
              <ChoiceButton active={answers.magic === "surprise"} title="Surprise Me" description="The program may choose any permitted magical direction." onClick={() => update("magic", "surprise")} />
              {magicSystems.map((system) => <ChoiceButton key={system} active={answers.magic === system} title={system} description={`Favor ${system} access, its Mana skill, and legal branches.`} onClick={() => update("magic", system as RandomCharacterMagic)} />)}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="random-character-guide__question">
            <h3>What should their starting gear favor?</h3>
            <p>The program buys only priced Equipment authorized by this Campaign.</p>
            <div className="random-character-guide__choices">{RANDOM_CHARACTER_EQUIPMENT_OPTIONS.map((option) => <ChoiceButton key={option.value} active={answers.equipment === option.value} title={option.label} description={option.description} onClick={() => update("equipment", option.value as RandomCharacterEquipment)} />)}</div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="random-character-guide__question">
            <h3>What is at the heart of their personality?</h3>
            <p>This shapes the generated personality, goals, secret, backstory, and motivation.</p>
            <div className="random-character-guide__choices">{RANDOM_CHARACTER_TEMPERAMENT_OPTIONS.map((option) => <ChoiceButton key={option.value} active={answers.temperament === option.value} title={option.label} description={option.description} onClick={() => update("temperament", option.value as RandomCharacterTemperament)} />)}</div>
          </div>
        ) : null}

        <footer>
          <button type="button" disabled={generating} onClick={step === 0 ? onCancel : () => setStep((current) => current - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
          {step < STEPS.length - 1
            ? <button className="is-primary" type="button" onClick={() => setStep((current) => current + 1)}>Next Question</button>
            : <button className="is-primary" type="button" disabled={generating || races.length === 0} onClick={() => onGenerate(answers)}>{generating ? "Creating Character…" : "Generate Character"}</button>}
        </footer>
      </section>
    </div>
  );
}
