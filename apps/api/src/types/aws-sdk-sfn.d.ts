declare module '@aws-sdk/client-sfn' {
  export class SFNClient {
    constructor(options?: Record<string, unknown>);
    send<TInput extends object, TOutput>(command: {
      input: TInput;
    }): Promise<TOutput>;
    destroy(): void;
  }

  export class StartExecutionCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>);
  }

  export class StopExecutionCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>);
  }
}
