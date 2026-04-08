import z from 'zod'

export const ValueObjectIdSymbol = Symbol('ValueObjectId')
export const RAW_SCHEMA_ACCESSOR_KEY = Symbol('RawSchemaKey')

export function instanceOrConstruct(klass: any, schema: z.ZodType<any>) {
  return z.any().transform((input, ctx) => {
    if (input instanceof klass) {
      return input
    }

    const result = schema.safeParse(input)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const currentPath =
          'path' in ctx && Array.isArray((ctx as any).path)
            ? (ctx as any).path
            : []

        ctx.addIssue({
          ...issue,
          path: [...currentPath, ...(issue.path ?? [])],
        })
      }
      return z.NEVER
    }

    try {
      return new klass(result.data)
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : 'Invalid input',
      })
      return z.NEVER
    }
  })
}

export function extractSchema<SCHEMA extends z.ZodAny>(
  valueObject: any,
): SCHEMA {
  /** This field is not exposed */
  const ctor = valueObject as any
  if (!ctor[RAW_SCHEMA_ACCESSOR_KEY]) {
    throw new Error(
      `ValueObject ${
        (valueObject as any)[ValueObjectIdSymbol]
      } does not have a raw schema defined.`,
    )
  }
  return ctor[RAW_SCHEMA_ACCESSOR_KEY] as SCHEMA
}

export function extractZodLiteralValueFromObjectSchema(
  schema: z.ZodSchema,
  key: string,
): string {
  const s = schema as any as z.ZodObject<any>

  if (!s.shape || typeof s.shape !== 'object') {
    throw new Error(
      `Cannot extract ZodLiteral value from non-object schema at ${key}.`,
    )
  }

  const field = s.shape[key]
  if (!field || !(field instanceof z.ZodLiteral)) {
    throw new Error(
      `Field "${key}" is not a ZodLiteral in the provided schema.`,
    )
  }

  const values = Array.from(field.values)

  if (values.length !== 1) {
    throw new Error(
      `ZodLiteral for field "${key}" must have exactly one value.`,
    )
  }

  const value = values[0]
  if (typeof value !== 'string') {
    throw new Error(`ZodLiteral value for field "${key}" must be a string.`)
  }

  return value
}

export function once<T extends (...args: any[]) => any>(fn: T): T {
  let called = false
  let result: ReturnType<T>

  return ((...args: Parameters<T>) => {
    if (!called) {
      result = fn(...args)
      called = true
    }
    return result
  }) as T
}

export type PrimitiveType = string | number | boolean | null | undefined

export function isPrimitive(value: any): value is PrimitiveType {
  if (value == null) {
    return true
  }
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
}

export type ToJSONOutput<T> = T extends PrimitiveType
  ? T
  : T extends Array<infer U>
  ? ToJSONOutput<U>[]
  : T extends { toJSON: () => infer JSON }
  ? JSON
  : T extends object
  ? {
      [K in keyof T]: ToJSONOutput<T[K]>
    }
  : never

/**
 * Deeply compares two arbitrary values, with semantics that match the
 * `equals()` method on `ValueObject` instances:
 *
 * - Identical references (and `Object.is`-equal primitives) compare equal.
 * - When either side is a value object instance (carries `ValueObjectIdSymbol`)
 *   the comparison is delegated to that instance's `equals()` method, so
 *   user-defined overrides are honoured.
 * - `Date` instances compare by their numeric time.
 * - Arrays must have the same length and equal elements *in order*.
 * - Plain objects are compared by their own enumerable keys, in any order.
 * - Anything else (Map, Set, RegExp, class instances, functions) falls back
 *   to reference equality. If you need richer semantics, override `equals`
 *   on the value object that owns the field.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  const aIsVO = ValueObjectIdSymbol in (a as object)
  const bIsVO = ValueObjectIdSymbol in (b as object)
  if (aIsVO !== bIsVO) return false
  if (aIsVO) {
    // Delegate fully to the VO's own `equals` method so user overrides win.
    // The default implementation handles the ID check internally.
    return (a as any).equals(b)
  }

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false
    }
    return true
  }

  const aKeys = Object.keys(a as object)
  const bKeys = Object.keys(b as object)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!deepEquals((a as any)[key], (b as any)[key])) return false
  }
  return true
}

export function recursivelyToJSON<T>(value: T): ToJSONOutput<T> {
  if (value === null || value === undefined) {
    return value as any
  }

  const v: any = value
  if (isPrimitive(value)) {
    return v
  }
  if (Array.isArray(v)) {
    return v.map(recursivelyToJSON) as any
  }

  if (typeof v === 'object') {
    if ('toJSON' in v && typeof v.toJSON === 'function') {
      return recursivelyToJSON(v.toJSON())
    }

    const result: any = {}
    for (const [key, nextValue] of Object.entries(v)) {
      result[key] = recursivelyToJSON(nextValue)
    }
    return result
  }
  return v
}
