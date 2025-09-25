import z from 'zod'
import { ValueObjectConstructor, ValueObjectInstance } from './value-object'
import {
  extractSchema,
  extractZodLiteralValueFromObjectSchema,
  once,
} from './utils'
export type ValueObjectSchema<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? Z
  : T extends ValueObjectInstance<string, infer Z, any>
  ? Z
  : never
export type ValueObjectInst<T> = T extends ValueObjectConstructor<
  string,
  any,
  any
>
  ? InstanceType<T>
  : T extends ValueObjectInstance<string, any, any>
  ? T
  : never

export type UnionInput<
  T extends Record<string, ValueObjectConstructor<string, any, any>>,
> = {
  [K in keyof T]: z.input<ValueObjectSchema<T[K]>> | ValueObjectInst<T[K]>
}[keyof T]

export type UnionOutput<
  T extends Record<string, ValueObjectConstructor<string, any, any>>,
> = {
  [K in keyof T]: ValueObjectInst<T[K]>
}[keyof T]

export interface ValueObjectUnion<
  T extends Record<string, ValueObjectConstructor<string, any, any>>,
> {
  schema(): z.ZodCustom<UnionOutput<T>, UnionInput<T>>

  isInstance<K extends keyof T>(
    discriminator: K,
    value: unknown,
  ): value is ValueObjectInst<T[K]>

  fromJSON(input: UnionInput<T>): UnionOutput<T>
}

export function defineUnion<
  D extends string,
  T extends Record<string, ValueObjectConstructor<string, any, any>>,
>(discriminator: D, values: () => T): ValueObjectUnion<T> {
  const getValues = once(values)

  const validate = once(() => {
    Object.entries(getValues()).forEach(([discriminatorValue, ctor]) => {
      const schema = extractSchema(ctor)

      /** Ideally this would be enforced by the type system. */
      const instanceDiscriminator = extractZodLiteralValueFromObjectSchema(
        schema,
        discriminator,
      )
      if (instanceDiscriminator !== discriminatorValue) {
        throw new Error(
          `Discriminator value mismatch for ${ctor.name}: expected "${discriminatorValue}", got "${instanceDiscriminator}"`,
        )
      }
    })
  })

  const getTypeSchema = once(() => {
    validate()
    const types = Object.keys(getValues())

    return z
      .object({
        [discriminator]: z.literal(types),
      })
      .transform((value) => value[discriminator] as string)
  })

  const requireCtor = (key: string) => {
    validate()
    const values = getValues()
    const ctor = values[key]

    if (!ctor) {
      throw new Error(`No schema found for discriminator value "${key}"`)
    }

    return ctor
  }

  const getSchema = once(() => {
    const allSchemas = Object.values(getValues())
    validate()

    return z.preprocess((value, ctx) => {
      if (allSchemas.some((klass) => value instanceof klass)) {
        return value
      }

      const typeSchema = getTypeSchema()

      const type = typeSchema.safeParse(value)
      if (!type.success) {
        ctx.addIssue({
          code: 'custom',
          path: (ctx as any).path
            ? [...(ctx as any).path, ...[discriminator]]
            : [discriminator],
        })
        return z.NEVER
      }

      const ctor = requireCtor(type.data)
      const parsed = ctor.schema().safeParse(value)

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            ...issue,
            path: (ctx as any).path
              ? [...(ctx as any).path, ...(issue.path ?? [])]
              : issue.path,
          })
        }
        return z.NEVER
      }
      return parsed.data
    }, z.any())
  })

  return {
    isInstance(discriminator: string, value: unknown): boolean {
      return value instanceof requireCtor(discriminator)
    },

    schema() {
      return getSchema()
    },

    fromJSON(input: unknown): UnionOutput<T> {
      return getSchema().parse(input)
    },
  } as any
}
