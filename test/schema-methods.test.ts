import {describe, it, expect, vi, expectTypeOf} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'

describe('Schema Methods', () => {
  describe('schema() method', () => {
    class SimpleVO extends ValueObject.define({
      id: 'SimpleVO',
      schema: () => z.string().min(1)
    }) {}

    it('should return a union schema that accepts both primitives and instances', () => {
      const schema = SimpleVO.schema()

      const fromPrimitive = schema.parse('test')
      expect(fromPrimitive).toBeInstanceOf(SimpleVO)
      expect(fromPrimitive.props).toBe('test')

      const instance = new SimpleVO('existing')
      const fromInstance = schema.parse(instance)
      expect(fromInstance).toBe(instance)
    })

    it('should validate primitive inputs according to underlying schema', () => {
      const schema = SimpleVO.schema()

      expect(() => schema.parse('')).toThrow()
      expect(() => schema.parse(123)).toThrow()
      expect(schema.parse('valid')).toBeInstanceOf(SimpleVO)
    })

    it('should preserve error paths in nested contexts', () => {
      const nestedSchema = z.object({
        items: z.array(SimpleVO.schema())
      })

      const result = nestedSchema.safeParse({
        items: ['valid', '', 'also-valid']
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const error = result.error.issues.find(issue =>
          issue.path.includes('items') && issue.path.includes(1)
        )
        expect(error).toBeDefined()
        expect(error?.path).toEqual(['items', 1])
      }
    })

    it('should handle complex schemas with transforms', () => {
      class TransformVO extends ValueObject.define({
        id: 'TransformVO',
        schema: () => z.string().transform(s => s.toUpperCase())
      }) {}

      const schema = TransformVO.schema()
      const result = schema.parse('lowercase')

      expect(result).toBeInstanceOf(TransformVO)
      expect(result.props).toBe('LOWERCASE')
    })

    it('should be memoized and return same instance on multiple calls', () => {
      const schema1 = SimpleVO.schema()
      const schema2 = SimpleVO.schema()

      expect(schema1).toBe(schema2)
    })

    it('should have correct TypeScript types', () => {
      const schema = SimpleVO.schema()

      expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<SimpleVO>()
      expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string | SimpleVO>()
    })
  })

  describe('schemaPrimitive() method', () => {
    class SimpleVO extends ValueObject.define({
      id: 'SimpleVO',
      schema: () => z.string().email()
    }) {}

    it('should create schema that only accepts primitives and transforms to instances', () => {
      const schema = SimpleVO.schemaPrimitive()

      const result = schema.parse('test@example.com')
      expect(result).toBeInstanceOf(SimpleVO)
      expect(result.props).toBe('test@example.com')
    })

    it('should not accept existing instances directly', () => {
      const schema = SimpleVO.schemaPrimitive()
      const instance = new SimpleVO('test@example.com')

      // This should fail because schemaPrimitive only accepts primitives
      expect(() => schema.parse(instance)).toThrowErrorMatchingInlineSnapshot(`
        "[
          {
            \\"expected\\": \\"string\\",
            \\"code\\": \\"invalid_type\\",
            \\"path\\": [],
            \\"message\\": \\"Invalid input: expected string, received SimpleVO\\"
          }
        ]"
      `)
    })

    it('should validate according to underlying schema rules', () => {
      const schema = SimpleVO.schemaPrimitive()

      expect(() => schema.parse('invalid-email')).toThrow()
      expect(() => schema.parse(123)).toThrow()
      expect(schema.parse('valid@example.com')).toBeInstanceOf(SimpleVO)
    })

    it('should preserve validation error messages', () => {
      const schema = SimpleVO.schemaPrimitive()

      const result = schema.safeParse('not-an-email')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid email')
      }
    })

    it('should work with complex object schemas', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          name: z.string().min(2),
          age: z.number().int().min(0)
        })
      }) {}

      const schema = ComplexVO.schemaPrimitive()

      const result = schema.parse({name: 'John', age: 30})
      expect(result).toBeInstanceOf(ComplexVO)
      expect(result.props).toEqual({name: 'John', age: 30})

      expect(() => schema.parse({name: 'J', age: 30})).toThrowErrorMatchingInlineSnapshot(`
        "[
          {
            \\"origin\\": \\"string\\",
            \\"code\\": \\"too_small\\",
            \\"minimum\\": 2,
            \\"inclusive\\": true,
            \\"path\\": [
              \\"name\\"
            ],
            \\"message\\": \\"Too small: expected string to have >=2 characters\\"
          }
        ]"
      `)
      expect(() => schema.parse({name: 'John', age: -1})).toThrowErrorMatchingInlineSnapshot(`
        "[
          {
            \\"origin\\": \\"number\\",
            \\"code\\": \\"too_small\\",
            \\"minimum\\": 0,
            \\"inclusive\\": true,
            \\"path\\": [
              \\"age\\"
            ],
            \\"message\\": \\"Too small: expected number to be >=0\\"
          }
        ]"
      `)
    })

    it('should be memoized and return same instance on multiple calls', () => {
      const schema1 = SimpleVO.schemaPrimitive()
      const schema2 = SimpleVO.schemaPrimitive()

      expect(schema1).toBe(schema2)
    })

    it('should have correct TypeScript types', () => {
      const schema = SimpleVO.schemaPrimitive()

      expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<SimpleVO>()
      expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>()
    })

    it('should handle schemas with preprocessing', () => {
      class PreprocessVO extends ValueObject.define({
        id: 'PreprocessVO',
        schema: () => z.preprocess(
          (val) => typeof val === 'string' ? val.trim() : val,
          z.string().min(1)
        )
      }) {}

      const schema = PreprocessVO.schemaPrimitive()

      const result = schema.parse('  spaced  ')
      expect(result).toBeInstanceOf(PreprocessVO)
      expect(result.props).toBe('spaced')
    })
  })

  describe('schemaRaw() method', () => {
    class SimpleVO extends ValueObject.define({
      id: 'SimpleVO',
      schema: () => z.string().uuid()
    }) {}

    it('should return the raw underlying Zod schema', () => {
      const rawSchema = SimpleVO.schemaRaw()

      expect(rawSchema).toBeInstanceOf(z.ZodString)

      const uuid = '123e4567-e89b-12d3-a456-426614174000'
      expect(rawSchema.parse(uuid)).toBe(uuid)
      expect(() => rawSchema.parse('not-a-uuid')).toThrow()
    })

    it('should not transform input to instances', () => {
      const rawSchema = SimpleVO.schemaRaw()
      const uuid = '123e4567-e89b-12d3-a456-426614174000'

      const result = rawSchema.parse(uuid)
      expect(result).toBe(uuid)
      expect(result).not.toBeInstanceOf(SimpleVO)
    })

    it('should work with complex object schemas', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          id: z.string(),
          metadata: z.record(z.string(), z.unknown()),
          tags: z.array(z.string()).default([])
        })
      }) {}

      const rawSchema = ComplexVO.schemaRaw()

      const input = {
        id: 'test',
        metadata: {key: 'value'}
      }

      const result = rawSchema.parse(input)
      expect(result).toEqual({
        id: 'test',
        metadata: {key: 'value'},
        // Default transformation was applied
        tags: []
      })
      expect(result).not.toBeInstanceOf(ComplexVO)
    })

    it('should be memoized and return same instance on multiple calls', () => {
      const schema1 = SimpleVO.schemaRaw()
      const schema2 = SimpleVO.schemaRaw()

      expect(schema1).toBe(schema2)
    })

    it('should have correct TypeScript types', () => {
      class TypedVO extends ValueObject.define({
        id: 'TypedVO',
        schema: () => z.object({name: z.string(), count: z.number()})
      }) {}

      const rawSchema = TypedVO.schemaRaw()

      expectTypeOf<z.output<typeof rawSchema>>().toEqualTypeOf<{name: string, count: number}>()
      expectTypeOf<z.input<typeof rawSchema>>().toEqualTypeOf<{name: string, count: number}>()
    })

    it('should handle schemas with transforms and refinements', () => {
      class TransformVO extends ValueObject.define({
        id: 'TransformVO',
        schema: () => z.string()
          .transform(s => s.toLowerCase())
          .refine(s => s.includes('test'), {message: 'Must contain test'})
      }) {}

      const rawSchema = TransformVO.schemaRaw()

      expect(rawSchema.parse('TEST')).toBe('test') // Transform applied
      expect(() => rawSchema.parse('invalid')).toThrow('Must contain test')
    })
  })

  describe('Schema method interactions', () => {
    class InteractionVO extends ValueObject.define({
      id: 'InteractionVO',
      schema: () => z.object({
        value: z.string().min(1)
      })
    }) {}

    it('should have all three methods return compatible but different schemas', () => {
      const schema = InteractionVO.schema()
      const schemaPrimitive = InteractionVO.schemaPrimitive()
      const schemaRaw = InteractionVO.schemaRaw()

      const input = {value: 'test'}

      // All should validate the same input successfully
      expect(() => schema.parse(input)).not.toThrow()
      expect(() => schemaPrimitive.parse(input)).not.toThrow()
      expect(() => schemaRaw.parse(input)).not.toThrow()

      // But return different types
      const result1 = schema.parse(input)
      const result2 = schemaPrimitive.parse(input)
      const result3 = schemaRaw.parse(input)

      expect(result1).toBeInstanceOf(InteractionVO)
      expect(result2).toBeInstanceOf(InteractionVO)
      expect(result3).not.toBeInstanceOf(InteractionVO)
      expect(result3).toEqual(input)
    })

    it('should allow instance to be passed through schema() but not schemaPrimitive()', () => {
      const instance = new InteractionVO({value: 'test'})

      expect(InteractionVO.schema().parse(instance)).toBe(instance)
      expect(() => InteractionVO.schemaPrimitive().parse(instance)).toThrow()
    })
  })

  describe('Schema caching behavior', () => {
    it('should cache all three schema methods independently', () => {
      class CacheTestVO extends ValueObject.define({
        id: 'CacheTestVO',
        schema: () => z.string()
      }) {}

      const calls = {
        schema: [] as any[],
        schemaPrimitive: [] as any[],
        schemaRaw: [] as any[]
      }

      calls.schema.push(CacheTestVO.schema(), CacheTestVO.schema())
      calls.schemaPrimitive.push(CacheTestVO.schemaPrimitive(), CacheTestVO.schemaPrimitive())
      calls.schemaRaw.push(CacheTestVO.schemaRaw(), CacheTestVO.schemaRaw())

      expect(calls.schema[0]).toBe(calls.schema[1])
      expect(calls.schemaPrimitive[0]).toBe(calls.schemaPrimitive[1])
      expect(calls.schemaRaw[0]).toBe(calls.schemaRaw[1])

      expect(calls.schema[0]).not.toBe(calls.schemaPrimitive[0])
      expect(calls.schema[0]).not.toBe(calls.schemaRaw[0])
      expect(calls.schemaPrimitive[0]).not.toBe(calls.schemaRaw[0])
    })

    it('should call underlying schema factory only once despite multiple schema method calls', () => {
      let factoryCalls = 0

      class FactoryTestVO extends ValueObject.define({
        id: 'FactoryTestVO',
        schema: () => {
          factoryCalls++
          return z.string()
        }
      }) {}

      // Call all three methods multiple times
      FactoryTestVO.schema()
      FactoryTestVO.schemaPrimitive()
      FactoryTestVO.schemaRaw()
      FactoryTestVO.schema()
      FactoryTestVO.schemaPrimitive()
      FactoryTestVO.schemaRaw()

      expect(factoryCalls).toBe(1)
    })
  })
})
