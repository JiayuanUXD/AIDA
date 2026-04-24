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
  title?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  rect: { x: number; y: number; width: number; height: number };
  status: 'pending' | 'fixed' | 'ignored';
  imageUrl?: string;
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
