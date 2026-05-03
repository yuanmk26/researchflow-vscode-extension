export interface ResearchFlowAgentReply {
  text: string;
}

export interface ResearchFlowAgentContextItem {
  label: string;
  path: string;
  kind: "file";
}

export class ResearchFlowAgentService {
  public async sendMessage(text: string, contextItems: readonly ResearchFlowAgentContextItem[] = []): Promise<ResearchFlowAgentReply> {
    const contextSummary =
      contextItems.length > 0
        ? `\n\nContext files:\n${contextItems.map((item) => `- ${item.label}`).join("\n")}`
        : "";

    return {
      text: `ResearchFlow Agent is not connected to a backend yet.\n\nYou asked:\n${text}${contextSummary}`
    };
  }
}
