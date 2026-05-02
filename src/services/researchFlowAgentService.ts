export interface ResearchFlowAgentReply {
  text: string;
}

export class ResearchFlowAgentService {
  public async sendMessage(text: string): Promise<ResearchFlowAgentReply> {
    return {
      text: `ResearchFlow Agent is not connected to a backend yet.\n\nYou asked:\n${text}`
    };
  }
}
