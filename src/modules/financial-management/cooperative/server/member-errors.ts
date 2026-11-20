import "server-only";

export class MemberError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly field?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
