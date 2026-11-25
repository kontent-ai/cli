type UndiciTimeoutCode = "UND_ERR_HEADERS_TIMEOUT" | "UND_ERR_BODY_TIMEOUT";

// What Node's fetch (undici) rejects with when its own timeouts fire: the headers timeout
// fails fetch itself, the body timeout aborts the body read. undici's errors carry a `code`.
export const nodeFetchTimeoutError = (code: UndiciTimeoutCode): TypeError =>
  new TypeError(code === "UND_ERR_HEADERS_TIMEOUT" ? "fetch failed" : "terminated", {
    cause: Object.assign(new Error("Timeout Error"), { code }),
  });
