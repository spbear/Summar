export interface SummarAIResponse {
  status: number;
  json: any;
  text: string;
  statsId: string;
}

export enum SummarAIParamType {
  CONVERSATION = 'conversation',
  OUTPUT = 'output',
  NOTESYNC = 'notesync'
}

export class SummarAIParam {
  role: string;
  type: SummarAIParamType;
  text: string;

  constructor(role: string = '', text: string = '', type: SummarAIParamType = SummarAIParamType.OUTPUT) {
    this.role = role;
    this.type = type;
    this.text = text;
  }

  // Helper methods for type checking
  isConversation(): boolean {
    return this.type === SummarAIParamType.CONVERSATION;
  }

  isOutput(): boolean {
    return this.type === SummarAIParamType.OUTPUT;
  }

  // Static factory methods for better backward compatibility
  static conversation(role: string, text: string): SummarAIParam {
    return new SummarAIParam(role, text, SummarAIParamType.CONVERSATION);
  }

  static output(role: string, text: string): SummarAIParam {
    return new SummarAIParam(role, text, SummarAIParamType.OUTPUT);
  }

  // Static method to convert plain objects to SummarAIParam instances
  static from(obj: {role: string, text: string}): SummarAIParam {
    return new SummarAIParam(obj.role, obj.text, SummarAIParamType.CONVERSATION);
  }
}
