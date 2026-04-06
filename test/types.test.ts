import {describe, it, expectTypeOf} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'

describe('Type Inference Tests', () => {
  describe('inferJSON type helper', () => {
    it('should infer JSON type from value object constructor', () => {
      class SimpleVO extends ValueObject.define({
        id: 'SimpleVO',
        schema: () => z.string()
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof SimpleVO>>().toEqualTypeOf<string>()
    })

    it('should infer JSON type from value object instance', () => {
      class SimpleVO extends ValueObject.define({
        id: 'SimpleVO',
        schema: () => z.string()
      }) {}

      const instance = new SimpleVO('test')
      expectTypeOf<ValueObject.inferJSON<typeof instance>>().toEqualTypeOf<string>()
    })

    it('should infer custom JSON type from toJSON transformer', () => {
      class CustomJSONVO extends ValueObject.define({
        id: 'CustomJSONVO',
        schema: () => z.object({name: z.string(), age: z.number()}),
        toJSON: (props) => `${props.name}-${props.age}`
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof CustomJSONVO>>().toEqualTypeOf<string>()
    })

    it('should infer complex object JSON types', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          id: z.string(),
          metadata: z.object({
            tags: z.array(z.string()),
            score: z.number().optional()
          })
        })
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof ComplexVO>>().toEqualTypeOf<{
        id: string
        metadata: {
          tags: string[]
          score?: number
        }
      }>()
    })

    it('should handle nested value objects in JSON inference', () => {
      class NestedVO extends ValueObject.define({
        id: 'NestedVO',
        schema: () => z.object({value: z.string()})
      }) {}

      class ParentVO extends ValueObject.define({
        id: 'ParentVO',
        schema: () => z.object({
          nested: NestedVO.schema(),
          list: z.array(NestedVO.schema())
        })
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof ParentVO>>().toEqualTypeOf<{
        nested: {value: string}
        list: {value: string}[]
      }>()
      expectTypeOf<ValueObject.inferInput<typeof ParentVO>>().toEqualTypeOf<{
        nested: NestedVO | {value: string}
        list: (NestedVO | {value: string})[]
      } | ParentVO>()

      expectTypeOf<ValueObject.inferProps<typeof ParentVO>>().toEqualTypeOf<{
        nested: NestedVO
        list: NestedVO[]
      }>()
    })
  })

  describe('inferProps type helper', () => {
    it('should infer props type from value object constructor', () => {
      class SimpleVO extends ValueObject.define({
        id: 'SimpleVO',
        schema: () => z.string()
      }) {}

      expectTypeOf<ValueObject.inferProps<typeof SimpleVO>>().toEqualTypeOf<string>()
      expectTypeOf<ValueObject.inferInput<typeof SimpleVO>>().toEqualTypeOf<string | SimpleVO>()
      expectTypeOf<ValueObject.inferJSON<typeof SimpleVO>>().toEqualTypeOf<string>()
    })

    it('should infer complex object props types', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          id: z.string(),
          metadata: z.object({
            tags: z.array(z.string()).optional(),
            score: z.number().optional()
          })
        })
      }) {}

      expectTypeOf<ValueObject.inferProps<typeof ComplexVO>>().toEqualTypeOf<{
        id: string
        metadata: {
          tags?: string[]
          score?: number
        }
      }>()
    })

    it('should handle nested value objects in props', () => {
      class NestedVO extends ValueObject.define({
        id: 'NestedVO',
        schema: () => z.object({value: z.string()})
      }) {}

      class ParentVO extends ValueObject.define({
        id: 'ParentVO',
        schema: () => z.object({
          nested: NestedVO.schema(),
          list: z.array(NestedVO.schema())
        })
      }) {}

      expectTypeOf<ValueObject.inferProps<typeof ParentVO>>().toEqualTypeOf<{
        nested: NestedVO
        list: NestedVO[]
      }>()
      expectTypeOf<ValueObject.inferInput<typeof ParentVO>>().toEqualTypeOf<{
        nested: NestedVO | {value: string}
        list: (NestedVO | {value: string})[]
      } | ParentVO>()
      expectTypeOf<ValueObject.inferJSON<typeof ParentVO>>().toEqualTypeOf<{
        nested: {value: string}
        list: {value: string}[]
      }>()
    })
  })

  describe('inferInput type helper', () => {
    it('should infer input type from value object constructor', () => {
      class SimpleVO extends ValueObject.define({
        id: 'SimpleVO',
        schema: () => z.string()
      }) {}

      expectTypeOf<ValueObject.inferInput<typeof SimpleVO>>().toEqualTypeOf<string | SimpleVO>()
    })

    it('should infer input type from value object instance', () => {
      class SimpleVO extends ValueObject.define({
        id: 'SimpleVO',
        schema: () => z.string()
      }) {}

      const instance = new SimpleVO('test')
      expectTypeOf<ValueObject.inferInput<typeof instance>>().toEqualTypeOf<string | typeof instance>()
      // @ts-expect-error typeof instance and SimpleV0 are "the same" type structurally, but not nominally
      expectTypeOf<typeof instance>().toEqualTypeOf<string | SimpleVO>()
      expectTypeOf<typeof instance>().toEqualTypeOf<SimpleVO>()
    })

    it('should infer input type with transforms', () => {
      class TransformVO extends ValueObject.define({
        id: 'TransformVO',
        schema: () => z.object({
          name: z.string(),
          age: z.number()
        }).or(z.string().transform((str) => {
          const [name, ageStr] = str.split('-')
          return {age: parseInt(ageStr), name}
        }))
      }) {}

      expectTypeOf<ValueObject.inferInput<typeof TransformVO>>().toEqualTypeOf<
        {name: string; age: number} | string | TransformVO
      >()
      type a = ValueObject.inferJSON<typeof TransformVO>
      expectTypeOf<ValueObject.inferJSON<typeof TransformVO>>().toEqualTypeOf<{name: string; age: number}>()
      expectTypeOf<ValueObject.inferProps<typeof TransformVO>>().toEqualTypeOf<{
        name: string
        age: number
      }>()
    })

    it('should handle nested value objects in input', () => {
      class NestedVO extends ValueObject.define({
        id: 'NestedVO',
        schema: () => z.object({value: z.string()})
      }) {}

      class ParentVO extends ValueObject.define({
        id: 'ParentVO',
        schema: () => z.object({
          nested: NestedVO.schema(),
          list: z.array(NestedVO.schema())
        })
      }) {}

      expectTypeOf<ValueObject.inferInput<typeof ParentVO>>().toEqualTypeOf<{
        nested: NestedVO | {value: string}
        list: (NestedVO | {value: string})[]
      } | ParentVO>()
    })
  })

  describe('Complex nested scenarios', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email()
    }) {}

    class Address extends ValueObject.define({
      id: 'Address',
      schema: () => z.object({
        street: z.string(),
        city: z.string(),
        country: z.string().optional()
      })
    }) {}

    class Person extends ValueObject.define({
      id: 'Person',
      schema: () => z.object({
        email: Email.schema(),
        addresses: z.array(Address.schema().optional()).optional(),
        metadata: z.object({
          preferences: z.record(z.string(), z.boolean()).optional(),
          tags: z.array(z.string()).default([])
        }).optional()
      })
    }) {}

    it('should handle deeply nested value objects with optionals and defaults', () => {
      expectTypeOf<ValueObject.inferJSON<typeof Person>>().toEqualTypeOf<{
        email: string
        addresses?: ({
          street: string
          city: string
          country?: string
        } | undefined)[]
        metadata?: {
          preferences?: Record<string, boolean>
          tags: string[]
        }
      }>()
    })

    it('should handle deeply nested props with value object instances', () => {
      expectTypeOf<ValueObject.inferProps<typeof Person>>().toEqualTypeOf<{
        email: Email
        addresses?: (Address | undefined)[]
        metadata?: {
          preferences?: Record<string, boolean>
          tags: string[]
        }
      }>()
    })

    it('should handle deeply nested input with mixed types', () => {
      expectTypeOf<ValueObject.inferInput<typeof Person>>().toEqualTypeOf<{
        email: string | Email
        addresses?: (undefined | Address | {
          street: string
          city: string
          country?: string
        })[]
        metadata?: {
          preferences?: Record<string, boolean>
          tags?: string[]
        }
      } | Person>()
    })
  })

  describe('Union type inference', () => {
    class Dog extends ValueObject.define({
      id: 'Dog',
      schema: () => z.object({
        type: z.literal('dog'),
        woofs: z.boolean()
      })
    }) {}

    class Cat extends ValueObject.define({
      id: 'Cat',
      schema: () => z.object({
        type: z.literal('cat'),
        meows: z.boolean()
      })
    }) {}

    const Pets = ValueObject.defineUnion('type', () => ({
      dog: Dog,
      cat: Cat
    }))

    it('should infer union output types', () => {
      const pet = Pets.fromJSON({type: 'dog', woofs: true})

      expectTypeOf(pet).toEqualTypeOf<Dog | Cat>()
      expectTypeOf<ValueObject.UnionOutput<{dog: typeof Dog, cat: typeof Cat}>>()
        .toEqualTypeOf<Dog | Cat>()
    })

    it('should infer union input types', () => {
      expectTypeOf<ValueObject.UnionInput<{dog: typeof Dog, cat: typeof Cat}>>()
        .toEqualTypeOf<
          {type: 'dog', woofs: boolean} | Dog |
          {type: 'cat', meows: boolean} | Cat
        >()
    })

    it('should infer schema types for unions', () => {
      expectTypeOf<z.output<ReturnType<typeof Pets.schema>>>().toEqualTypeOf<Dog | Cat>()
      expectTypeOf<z.input<ReturnType<typeof Pets.schema>>>().toEqualTypeOf<
        {type: 'dog', woofs: boolean} | Dog |
        {type: 'cat', meows: boolean} | Cat
      >()
    })
  })

  describe('Edge case schemas', () => {
    it('should handle empty object schemas', () => {
      class EmptyVO extends ValueObject.define({
        id: 'EmptyVO',
        schema: () => z.object({})
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof EmptyVO>>().toEqualTypeOf<Record<string, never>>()
      expectTypeOf<ValueObject.inferProps<typeof EmptyVO>>().toEqualTypeOf<Record<string, never>>()
      expectTypeOf<ValueObject.inferInput<typeof EmptyVO>>().toEqualTypeOf<Record<string, never> | EmptyVO>()
    })

    it('should handle schemas with complex Zod transforms', () => {
      class TransformVO extends ValueObject.define({
        id: 'TransformVO',
        schema: () => z.string()
          .transform(str => str.split(','))
          .pipe(z.array(z.string()))
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof TransformVO>>().toEqualTypeOf<string[]>()
      expectTypeOf<ValueObject.inferProps<typeof TransformVO>>().toEqualTypeOf<string[]>()
      expectTypeOf<ValueObject.inferInput<typeof TransformVO>>().toEqualTypeOf<string | TransformVO>()
    })

    it('should handle schemas with refinements', () => {
      class RefinedVO extends ValueObject.define({
        id: 'RefinedVO',
        schema: () => z.string()
          .min(5)
          .refine(val => val.includes('@'), {message: 'Must contain @'})
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof RefinedVO>>().toEqualTypeOf<string>()
      expectTypeOf<ValueObject.inferProps<typeof RefinedVO>>().toEqualTypeOf<string>()
      expectTypeOf<ValueObject.inferInput<typeof RefinedVO>>().toEqualTypeOf<string | RefinedVO>()
    })

    it('should handle nullable and optional combinations', () => {
      class OptionalVO extends ValueObject.define({
        id: 'OptionalVO',
        schema: () => z.object({
          required: z.string(),
          optional: z.string().optional(),
          nullable: z.string().nullable(),
          optionalNullable: z.string().optional().nullable()
        })
      }) {}

      expectTypeOf<ValueObject.inferJSON<typeof OptionalVO>>().toEqualTypeOf<{
        required: string
        optional?: string
        nullable: string | null
        optionalNullable?: string | null
      }>()
    })
  })
})
