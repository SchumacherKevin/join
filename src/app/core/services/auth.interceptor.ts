import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getToken, sessionExpired$ } from './auth-token';

/**
 * Adds the token to every API request and reports rejected tokens (HTTP 401)
 * so the app can return to the login page.
 *
 * The token is sent twice: as `Authorization: Token <token>` and as
 * `X-Auth-Token`, because some shared hosting setups (PHP via FastCGI) drop
 * the Authorization header before it reaches the API.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const token = getToken();

  const request =
    isApiRequest && token
      ? req.clone({ setHeaders: { Authorization: `Token ${token}`, 'X-Auth-Token': token } })
      : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isApiRequest && token && error instanceof HttpErrorResponse && error.status === 401) {
        sessionExpired$.next();
      }
      return throwError(() => error);
    }),
  );
};
