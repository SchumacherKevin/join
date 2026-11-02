import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Error thrown for failed API requests; `status` and `code` mirror the backend response. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryParams = Record<string, string | number | boolean>;

/** Thin promise-based wrapper around HttpClient for the Django REST API. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl.replace(/\/+$/, '');

  get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path, {});
  }

  /** Sends a request and converts HTTP failures into an ApiError with a readable message. */
  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; params?: QueryParams },
  ): Promise<T> {
    const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const params = options.params ? new HttpParams({ fromObject: options.params }) : undefined;
    try {
      return await firstValueFrom(
        this.http.request<T>(method, url, { body: options.body, params }),
      );
    } catch (error) {
      throw toApiError(error);
    }
  }
}

/** Builds an ApiError from an HttpErrorResponse (or passes through other errors). */
function toApiError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) return error;

  const body = error.error;
  const code: string | undefined = typeof body?.code === 'string' ? body.code : undefined;
  const message =
    code ??
    (typeof body?.detail === 'string' ? body.detail : undefined) ??
    firstFieldError(body) ??
    (error.status === 0
      ? 'The server is not reachable. Please try again later.'
      : `Request failed (${error.status}).`);

  return new ApiError(message, error.status, code, body);
}

/** Returns the first validation message of a DRF error body like `{ email: ["…"] }`. */
function firstFieldError(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  for (const value of Object.values(body as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
