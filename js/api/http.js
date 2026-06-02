import {
  ApiDiagnosticError,
  classifyHttpFailure,
} from "../core/errors.js";

export async function fetchJson(
  url,
  { exchange, operation, timeoutMs = 10000 } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw classifyHttpFailure({ exchange, operation, status: response.status });
    }

    try {
      return await response.json();
    } catch {
      throw new ApiDiagnosticError("response-format", "거래소 응답 형식이 올바르지 않습니다.", {
        exchange,
        operation,
      });
    }
  } catch (error) {
    if (error instanceof ApiDiagnosticError) {
      throw error;
    }

    throw new ApiDiagnosticError(
      "network",
      "네트워크 또는 CORS 오류가 발생했습니다.",
      { exchange, operation },
    );
  } finally {
    clearTimeout(timeout);
  }
}
