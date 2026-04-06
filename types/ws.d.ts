declare module "ws" {
  type HeadersInit = Record<string, string>;

  class WebSocket {
    static readonly OPEN: number;
    static readonly CLOSED: number;

    readonly readyState: number;

    constructor(url: string, options?: { headers?: HeadersInit });

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: string | Buffer) => void): this;
    on(
      event: "unexpected-response",
      listener: (
        request: { destroy: () => void },
        response: {
          statusCode?: number;
          statusMessage?: string;
          on: (event: "data" | "end", listener: (chunk?: Buffer) => void) => void;
        }
      ) => void
    ): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;

    send(data: string): void;
    close(): void;
  }

  export default WebSocket;
}
