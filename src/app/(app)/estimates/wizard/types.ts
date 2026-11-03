import type { NfrKey, Part, Step } from "@/lib/estimation/options";

// Client-side state of the wizard: one object per step, exactly what each save action sends.

export type Step1State = {
  projectName: string;
  clientName: string;
  projectManager: string;
  projectDate: string;
};

export type Step2State = {
  applicationTypes: string[];
  operatingSystems: string[];
  browsers: string[];
  parts: { part: Part; technologyIds: string[] }[];
};

export type Step3State = {
  hosting: string[];
  environments: string[];
  appStores: string[];
  compliance: string[];
  nfr: Partial<Record<NfrKey, { enabled: boolean; note: string }>>;
  other: string;
};

export type FeatureState = { key: string; name: string; description: string; parts: Part[] };
export type Step4State = { features: FeatureState[] };

export type WizardState = { 1: Step1State; 2: Step2State; 3: Step3State; 4: Step4State };

export type TechnologyOption = { id: string; name: string; parts: Part[]; retired: boolean };

export type WizardProps = {
  id: string | null;
  initialStep: Step;
  lastStep: Step;
  savedAt: string | null;
  initial: WizardState;
  technologies: TechnologyOption[];
  clientNames: string[];
  /** The requirement documents panel for step 4 (specs/requirement-documents); none for a new request. */
  documentsPanel?: React.ReactNode;
};

export type Errors = Record<string, string>;
