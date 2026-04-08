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

export type UnionMembers = readonly ValueObjectConstructor<string, any, any>[]

export type UnionInput<Members extends UnionMembers> =
  | {
      [K in keyof Members]: z.input<ValueObjectSchema<Members[K]>>
    }[number]
  | {
      [K in keyof Members]: ValueObjectInst<Members[K]>
    }[number]

export type UnionOutput<Members extends UnionMembers> = {
  [K in keyof Members]: ValueObjectInst<Members[K]>
}[number]

export interface ValueObjectUnion<Members extends UnionMembers> {
  /**
   * Zod schema for the union; accepts any member's input or instance and returns the matching instance.
   *
   * @example
   * z.object({ pet: Pets.schema() }).parse({ pet: { type: 'dog', woofs: true } })
   */
  schema(): z.ZodCustom<UnionOutput<Members>, UnionInput<Members>>

  /**
   * Type guard for a specific member of the union, narrowed by the constructor reference.
   *
   * @example
   * if (Pets.isInstance(Dog, pet)) pet.props.woofs
   */
  isInstance<C extends Members[number]>(
    ctor: C,
    value: unknown,
  ): value is InstanceType<C>

  /**
   * Parses raw input into the matching member instance.
   *
   * @example
   * const pet = Pets.fromJSON({ type: 'cat', sharpClaws: false }) // Cat
   */
  fromJSON(input: UnionInput<Members>): UnionOutput<Members>
}

/**
 * Creates a discriminated union of value objects. Each member must use a
 * `z.literal()` for the discriminator field; the literal value is read directly
 * from the schema, so members are passed as a plain array.
 *
 * @example
 * class Dog extends ValueObject.define({
 *   id: 'Dog',
 *   schema: () => z.object({ type: z.literal('dog'), woofs: z.boolean() }),
 * }) {}
 *
 * class Cat extends ValueObject.define({
 *   id: 'Cat',
 *   schema: () => z.object({ type: z.literal('cat'), sharpClaws: z.boolean() }),
 * }) {}
 *
 * const Pets = ValueObject.defineUnion('type', [Dog, Cat])
 *
 * const pet = Pets.fromJSON({ type: 'dog', woofs: true }) // Dog | Cat
 * if (Pets.isInstance(Dog, pet)) pet.props.woofs
 */
export function defineUnion<D extends string, Members extends UnionMembers>(
  discriminator: D,
  members: Members,
): ValueObjectUnion<Members> {
  const buildIndex = once(() => {
    const map = new Map<string, ValueObjectConstructor<string, any, any>>()
    for (const ctor of members) {
      const schema = extractSchema(ctor)
      const literal = extractZodLiteralValueFromObjectSchema(
        schema,
        discriminator,
      )
      if (map.has(literal)) {
        throw new Error(
          `Duplicate discriminator value "${literal}" in union for "${discriminator}"`,
        )
      }
      map.set(literal, ctor)
    }
    return map
  })

  const getTypeSchema = once(() => {
    const map = buildIndex()
    const types = Array.from(map.keys())

    if (types.length === 0) {
      throw new Error('Union must have at least one type')
    }

    const literalUnion =
      types.length === 1
        ? z.literal(types[0])
        : z.union(
            types.map((type) => z.literal(type)) as [
              z.ZodLiteral<string>,
              ...z.ZodLiteral<string>[],
            ],
          )

    return z
      .object({
        [discriminator]: literalUnion,
      })
      .transform((value) => value[discriminator] as string)
  })

  const getSchema = once(() => {
    const map = buildIndex()

    return z.preprocess((value, ctx) => {
      for (const ctor of members) {
        if (value instanceof ctor) return value
      }

      const typeSchema = getTypeSchema()

      const type = typeSchema.safeParse(value)
      if (!type.success) {
        ctx.addIssue({
          code: 'custom',
          path: [discriminator],
        })
        return z.NEVER
      }

      const ctor = map.get(type.data)!
      const parsed = ctor.schema().safeParse(value)

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ ...issue })
        }
        return z.NEVER
      }
      return parsed.data
    }, z.any())
  })

  return {
    isInstance(ctor: ValueObjectConstructor<string, any, any>, value: unknown) {
      buildIndex()
      return value instanceof ctor
    },

    schema() {
      return getSchema()
    },

    fromJSON(input: unknown): UnionOutput<Members> {
      return getSchema().parse(input)
    },
  } as any
}
