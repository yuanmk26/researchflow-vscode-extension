export interface Project {
  name: string;
  rootPath: string;
  createdAt: string;
}

export interface Reference {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
}

export interface Artifact {
  id: string;
  type: "paper" | "figure";
  name: string;
  path?: string;
}