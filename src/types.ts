export interface Project {
  id: string;
  name: string;
  thumbnail: string;
  lastEdited: string;
  category: string;
  members: string[];
}

export interface Category {
  id: string;
  name: string;
}

export interface Difference {
  id: string;
  type: 'content' | 'layout' | 'style';
  description: string;
  severity: 'low' | 'medium' | 'high';
  rect: { x: number; y: number; width: number; height: number };
  status: 'pending' | 'fixed' | 'ignored';
}

export interface Mark {
  id: string;
  x: number;
  y: number;
  comment: string;
  author: string;
  timestamp: string;
}

export interface Drawing {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface ReviewRound {
  id: string;
  projectId: string;
  roundNumber: number;
  status: 'pending' | 'in_review' | 'passed' | 'failed';
  designImage?: string;
  buildImage?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewItem {
  id: string;
  roundId: string;
  type: 'content' | 'layout' | 'style';
  description: string;
  rect?: { x: number; y: number; width: number; height: number };
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'fixed' | 'ignored';
  screenshot?: string;
  author?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface ReviewRoundWithItems extends ReviewRound {
  items: ReviewItem[];
  itemCount: number;
  pendingCount: number;
  fixedCount: number;
}
