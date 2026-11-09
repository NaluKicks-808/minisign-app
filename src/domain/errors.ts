export class NotImplemented extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = 'NotImplemented';
  }
}
/** The user may not see this document. */
export class NotVisibleError extends Error {
  constructor(message = 'You do not have access to this document.') {
    super(message);
    this.name = 'NotVisibleError';
  }
}
/** A guard refused the command. `reasons` are shown to the user. */
export class GuardError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(reasons.join(' '));
    this.name = 'GuardError';
    this.reasons = reasons;
  }
}
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = 'NotFoundError';
  }
}
