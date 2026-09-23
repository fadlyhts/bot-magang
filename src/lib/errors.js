export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class WahaError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = "WahaError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

