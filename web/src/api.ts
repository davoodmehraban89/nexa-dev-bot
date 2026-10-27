export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function createApi(initData: string, fetcher: typeof fetch) {
  return async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!initData)
      throw new ApiError(403, 'Nexa Studio را از داخل تلگرام باز کن.');
    const response = await fetcher(`/api/v1/studio${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'x-telegram-init-data': initData,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers
      }
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        response.status,
        'پاسخ سرویس قابل خواندن نیست. دوباره تلاش کن.'
      );
    }
    if (!response.ok || body.ok === false) {
      const message =
        typeof body.error === 'string' && /[\u0600-\u06FF]/.test(body.error)
          ? body.error
          : response.status === 403
            ? 'دسترسی تأیید نشد. برنامه را دوباره از تلگرام باز کن.'
            : 'درخواست انجام نشد. دوباره تلاش کن.';
      throw new ApiError(response.status, message);
    }
    return body as T;
  };
}
