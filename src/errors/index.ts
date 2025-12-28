/** Base error for all bot errors */
export class BotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotError';
  }
}

/** Error when solver communication fails */
export class SolverError extends BotError {
  constructor(
    message: string,
    public readonly castleName?: string,
  ) {
    super(castleName ? `[${castleName}] ${message}` : message);
    this.name = 'SolverError';
  }
}

/** Error when navigation fails */
export class NavigationError extends BotError {
  constructor(public readonly view: string) {
    super(`Failed to navigate to ${view} view`);
    this.name = 'NavigationError';
  }
}

/** Error when login fails */
export class LoginError extends BotError {
  constructor() {
    super('Failed to login');
    this.name = 'LoginError';
  }
}

/** Error when action fails (upgrade, recruit, trade) */
export class ActionError extends BotError {
  constructor(
    public readonly action: 'upgrade' | 'recruit' | 'trade',
    public readonly details: string,
  ) {
    super(`Failed to ${action}: ${details}`);
    this.name = 'ActionError';
  }
}
