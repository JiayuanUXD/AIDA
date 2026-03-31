export type JsonValue = any;

export interface Project {
  id: string;
  name: string;
  thumbnail?: string | null;
  updatedAt: number;
  category: string;
  isStarred: boolean;
  members?: string[];
  analysisData?: {
    image?: string | null;
    liveImage?: string | null;
    differences?: any[];
    url?: string;
    figmaUrl?: string;
    opacity?: number;
    scale?: number;
    position?: { x: number; y: number };
    timestamp?: number;
  };
}

export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

export interface AnalysisResult {
  id: string;
  name: string;
  designImage: string;
  buildImage: string;
  differences: any[];
  url?: string;
  figmaUrl?: string;
  opacity?: number;
  scale?: number;
  position?: { x: number; y: number };
  timestamp: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function listProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function getProject(projectId: string): Promise<Project> {
  return await request<Project>(`/api/projects/${projectId}`);
}

export async function createProject(payload: Partial<Project> & { name: string }): Promise<{ id: string }> {
  return await request<{ id: string }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      thumbnail: payload.thumbnail ?? null,
      updatedAt: payload.updatedAt ?? Date.now(),
      category: payload.category ?? "All projects",
      isStarred: payload.isStarred ?? false,
      members: payload.members ?? [],
    }),
  });
}

export async function patchProject(projectId: string, patch: Partial<Project> & { analysisData?: any }): Promise<void> {
  await request(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function listCategories(): Promise<Category[]> {
  const data = await request<{ categories: Category[] }>("/api/categories");
  return data.categories;
}

export async function createCategory(name: string): Promise<{ id: string }> {
  return await request<{ id: string }>("/api/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function patchCategory(categoryId: string, patch: Partial<Category>): Promise<void> {
  await request(`/api/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await request(`/api/categories/${categoryId}`, { method: "DELETE" });
}

export async function listAnalysisResults(): Promise<AnalysisResult[]> {
  const data = await request<{ results: AnalysisResult[] }>("/api/analysis-results");
  return data.results;
}

export async function createAnalysisResult(payload: Partial<AnalysisResult> & {
  name: string;
  designImage: string;
  buildImage: string;
  differences: any[];
  timestamp: number;
}): Promise<{ id: string }> {
  return await request<{ id: string }>("/api/analysis-results", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      designImage: payload.designImage,
      buildImage: payload.buildImage,
      differences: payload.differences ?? [],
      url: payload.url ?? "",
      figmaUrl: payload.figmaUrl ?? "",
      opacity: payload.opacity ?? null,
      scale: payload.scale ?? null,
      position: payload.position ?? { x: 0, y: 0 },
      timestamp: payload.timestamp,
    }),
  });
}

export async function deleteAnalysisResult(id: string): Promise<void> {
  await request(`/api/analysis-results/${id}`, { method: "DELETE" });
}

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (!dataUrl.startsWith("data:")) return null;
  // data:mime/type;base64,xxxx
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export async function uploadImageBase64(opts: { base64: string; mimeType: string; kind?: "design" | "build" }) {
  const { base64, mimeType, kind } = opts;
  const data = await request<{ url: string }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      base64,
      mimeType,
      kind: kind ?? "design",
    }),
  });
  return data.url;
}

