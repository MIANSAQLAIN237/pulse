import type { Response } from "express";
import type { ApiErrorBody } from "@pulse/shared";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  toBody(): ApiErrorBody {
    return jsonError(this.code, this.message);
  }
}

export function jsonError(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function sendHttpError(res: Response, err: HttpError): void {
  res.status(err.status).json(err.toBody());
}
