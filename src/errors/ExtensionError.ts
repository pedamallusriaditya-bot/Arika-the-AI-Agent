export enum ExtensionErrorCode {
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
    AUTH_ERROR = 'AUTH_ERROR',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    NETWORK_FAILURE = 'NETWORK_FAILURE',
    WORKSPACE_ERROR = 'WORKSPACE_ERROR',
    INVALID_CONTEXT = 'INVALID_CONTEXT'
}

/**
 * Base custom error class for CodeTitan enterprise exceptions.
 */
export class ExtensionError extends Error {
    public readonly code: ExtensionErrorCode;
    public readonly details?: unknown;

    constructor(message: string, code: ExtensionErrorCode = ExtensionErrorCode.UNKNOWN_ERROR, details?: unknown) {
        super(message);
        this.name = 'ExtensionError';
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class AuthenticationError extends ExtensionError {
    constructor(message: string = 'Invalid or missing OpenAI API Key.', details?: unknown) {
        super(message, ExtensionErrorCode.AUTH_ERROR, details);
        this.name = 'AuthenticationError';
    }
}

export class RateLimitError extends ExtensionError {
    constructor(message: string = 'OpenAI API rate limit or quota exceeded.', details?: unknown) {
        super(message, ExtensionErrorCode.RATE_LIMIT_EXCEEDED, details);
        this.name = 'RateLimitError';
    }
}

export class NetworkError extends ExtensionError {
    constructor(message: string = 'Network connectivity error reaching AI services.', details?: unknown) {
        super(message, ExtensionErrorCode.NETWORK_FAILURE, details);
        this.name = 'NetworkError';
    }
}

export class WorkspaceError extends ExtensionError {
    constructor(message: string = 'Error performing workspace scan or file query.', details?: unknown) {
        super(message, ExtensionErrorCode.WORKSPACE_ERROR, details);
        this.name = 'WorkspaceError';
    }
}
