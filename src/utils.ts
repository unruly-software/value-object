import z from 'zod'

export const ValueObjectIdSymbol = Symbol('ValueObjectId')
export const RAW_SCHEMA_ACCESSOR_KEY = Symbol('RawSchemaKey')
/**
 * Marker placed on the default `ValueObject#equals` (avoiding infinite
 * recursion between `equals` and `deepEquals`).
 */
export const DEFAULT_EQUALS_SYMBOL = Symbol('defaultEquals')

export function instanceOrConstruct(klass: any, schema: z.ZodType<any>) {
  return z.any().transform((input, ctx) => {
    if (input instanceof klass) {
      return input
    }

    const result = schema.safeParse(input)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({...issue})
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
 * Deeply compares two values with the same semantics as `ValueObject#equals`.
 * Handles primitives, plain objects, arrays, dates, and value objects.
 *
 * For two value objects this checks that the IDs match and then deeply
 * compares their `props`. If either side has overridden `equals` (i.e. the
 * function is not the default marker-tagged implementation) the override is
 * called instead so domain-specific identity is honoured even when the value
 * object is nested inside another structure.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  const aIsVO = ValueObjectIdSymbol in (a as object)
  const bIsVO = ValueObjectIdSymbol in (b as object)
  if (aIsVO !== bIsVO) return false
  if (aIsVO) {
    if ((a as any)[ValueObjectIdSymbol] !== (b as any)[ValueObjectIdSymbol]) {
      return false
    }
    const aEquals = (a as any).equals
    if (
      typeof aEquals === 'function' &&
      !(aEquals as any)[DEFAULT_EQUALS_SYMBOL]
    ) {
      return aEquals.call(a, b)
    }
    const bEquals = (b as any).equals
    if (
      typeof bEquals === 'function' &&
      !(bEquals as any)[DEFAULT_EQUALS_SYMBOL]
    ) {
      return bEquals.call(b, a)
    }
    return deepEquals((a as any).props, (b as any).props)
  }

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray) return false
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
