export type AnalyzeModel = 'gemini' | 'kimi' | 'doubao';

export type DifferenceType = 'CONTENT' | 'LAYOUT' | 'STYLE';

export type DifferenceStatus = 'pending' | 'fixed' | 'ignored';
export type DifferenceSeverity = 'low' | 'medium' | 'high';

export interface DifferenceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Difference {
  id: string;
  title: string;
  type: DifferenceType;
  severity?: DifferenceSeverity;
  description: string;
  rect: DifferenceRect;
  rectDesign?: DifferenceRect;
  rectBuild?: DifferenceRect;
  status: DifferenceStatus;
  imageUrl?: string;
}
