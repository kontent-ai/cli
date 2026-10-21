export type Result<T, E> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "err"; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ kind: "ok", value });

export const err = <E>(error: E): Result<never, E> => ({ kind: "err", error });

export const fromThrowable = <T, E>(fn: () => T, onError: (cause: unknown) => E): Result<T, E> => {
  try {
    return ok(fn());
  } catch (cause) {
    return err(onError(cause));
  }
};

export const tryAsync = async <T, E>(
  fn: () => Promise<T>,
  onError: (cause: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(onError(cause));
  }
};

export const isOk = <T, E>(res: Result<T, E>): res is { readonly kind: "ok"; readonly value: T } =>
  res.kind === "ok";

export const isErr = <T, E>(
  res: Result<T, E>,
): res is { readonly kind: "err"; readonly error: E } => res.kind === "err";

export const map = <T, U, E>(res: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  res.kind === "ok" ? ok(fn(res.value)) : res;

export const mapErr = <T, E, F>(res: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
  res.kind === "err" ? err(fn(res.error)) : res;

export const flatMap = <T, U, E>(
  res: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (res.kind === "ok" ? fn(res.value) : res);

export const filter = <T, E>(
  res: Result<T, E>,
  predicate: (value: T) => boolean,
  onFalse: (value: T) => E,
): Result<T, E> => flatMap(res, (value) => (predicate(value) ? ok(value) : err(onFalse(value))));

export const orElse = <T, E, F>(res: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> =>
  res.kind === "ok" ? res : fn(res.error);

export const getOrElse = <T, E>(res: Result<T, E>, fn: (error: E) => T): T =>
  res.kind === "ok" ? res.value : fn(res.error);

export const partition = <T, E>(
  results: ReadonlyArray<Result<T, E>>,
): { values: T[]; errors: E[] } => ({
  values: results.flatMap((res) => (res.kind === "ok" ? [res.value] : [])),
  errors: results.flatMap((res) => (res.kind === "err" ? [res.error] : [])),
});

export const combine = <T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E[]> => {
  const { values, errors } = partition(results);
  return errors.length === 0 ? ok(values) : err(errors);
};
