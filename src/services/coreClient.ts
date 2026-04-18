import { Reference } from "../types";

interface CaptionResponse {
  caption: string;
}

export class CoreClient {
  private readonly baseUrl: string;

  public constructor(baseUrl = "http://127.0.0.1:27182") {
    this.baseUrl = baseUrl;
  }

  public async recommendCitations(text: string): Promise<Reference[]> {
    return this.post<Reference[]>("/recommend-citations", { text });
  }

  public async generateCaption(filePath: string): Promise<string> {
    const response = await this.post<CaptionResponse>("/generate-caption", { filePath });
    return response.caption;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`ResearchFlow Core request failed (${response.status})`);
    }

    // TODO: Add retry policy, timeout, and circuit-breaker behavior.
    // TODO: Add auth/session headers once backend contract is finalized.
    return (await response.json()) as T;
  }
}