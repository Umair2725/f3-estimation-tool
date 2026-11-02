"use client";

import { ui } from "@/components/ui";

// Who did the work, asked when saving actuals for AI-era projects (specs/actual-hours "Team level
// feeds benchmarks"). Sub tasks taken from a benchmark then add observations at this level.
export type TeamLevelChoice = "" | "EXPERIENCED" | "JUNIOR" | "MIXED";

export function TeamLevelSelect(props: {
  value: TeamLevelChoice;
  onChange: (value: TeamLevelChoice) => void;
}) {
  return (
    <label className={ui.label}>
      Team level
      <select
        className={`${ui.input} min-h-10 w-56`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as TeamLevelChoice)}
      >
        <option value="">Choose who did the work</option>
        <option value="EXPERIENCED">Experienced developers</option>
        <option value="JUNIOR">Junior developers</option>
        <option value="MIXED">Mixed (not used for benchmarks)</option>
      </select>
    </label>
  );
}
