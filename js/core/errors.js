export class ApiDiagnosticError extends Error {
  constructor(kind, userMessage, detail = {}) {
    super(userMessage);
    this.name = "ApiDiagnosticError";
    this.kind = kind;
    this.userMessage = userMessage;

    const safeDetail = {};

    for (const key of ["exchange", "operation", "symbol"]) {
      if (typeof detail[key] === "string") {
        safeDetail[key] = detail[key];
      }
    }

    if (
      Number.isInteger(detail.status) ||
      typeof detail.status === "string"
    ) {
      safeDetail.status = detail.status;
    }

    this.detail = {
      ...safeDetail,
      occurredAt: new Date().toISOString(),
    };
  }
}

export function classifyHttpFailure({ exchange, operation, status }) {
  if (status === 429) {
    return new ApiDiagnosticError(
      "rate-limit",
      "호출 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      { exchange, operation, status },
    );
  }

  return new ApiDiagnosticError("http", "거래소 요청이 실패했습니다.", {
    exchange,
    operation,
    status,
  });
}
