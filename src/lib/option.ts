export type Option<T> = { readonly kind: "some"; readonly value: T } | { readonly kind: "none" };

export const some = <T>(value: T): Option<T> => ({ kind: "some", value });

export const none: Option<never> = { kind: "none" };

export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none : some(value);

export const isSome = <T>(opt: Option<T>): opt is { readonly kind: "some"; readonly value: T } =>
  opt.kind === "some";

export const isNone = <T>(opt: Option<T>): opt is { readonly kind: "none" } => opt.kind === "none";

export const map = <T, U>(opt: Option<T>, fn: (value: T) => U): Option<U> =>
  opt.kind === "some" ? some(fn(opt.value)) : opt;

export const flatMap = <T, U>(opt: Option<T>, fn: (value: T) => Option<U>): Option<U> =>
  opt.kind === "some" ? fn(opt.value) : opt;

export const filter = <T>(opt: Option<T>, predicate: (value: T) => boolean): Option<T> =>
  opt.kind === "some" && predicate(opt.value) ? opt : none;

export const orElse = <T>(opt: Option<T>, fn: () => Option<T>): Option<T> =>
  opt.kind === "some" ? opt : fn();

export const getOrElse = <T>(opt: Option<T>, fn: () => T): T =>
  opt.kind === "some" ? opt.value : fn();

export const match = <T, U>(
  opt: Option<T>,
  handlers: { some: (value: T) => U; none: () => U },
): U => (opt.kind === "some" ? handlers.some(opt.value) : handlers.none());

export const toNullable = <T>(opt: Option<T>): T | null => (opt.kind === "some" ? opt.value : null);
