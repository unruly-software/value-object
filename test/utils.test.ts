import {describe, it, expect, vi} from 'vitest'
import z from 'zod'
import {
  once,
  isPrimitive,
  recursivelyToJSON,
  extractSchema,
  extractZodLiteralValueFromObjectSchema,
  instanceOrConstruct,
  RAW_SCHEMA_ACCESSOR_KEY,
  ValueObjectIdSymbol,
} from '../src/utils'
import {ValueObject} from '../src'

describe('Utils', () => {
  describe('once()', () => {
    it('should call function only once and memoize result', () => {
      const mockFn = vi.fn(() => 'result')
      const memoized = once(mockFn)

      const result1 = memoized()
      const result2 = memoized()
      const result3 = memoized()

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe('result')
      expect(result2).toBe('result')
      expect(result3).toBe('result')
    })

    it('should handle functions with arguments', () => {
      const mockFn = vi.fn((a: number, b: string) => `${a}-${b}`)
      const memoized = once(mockFn)

      const result1 = memoized(1, 'test')
      const result2 = memoized(2, 'different')

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith(1, 'test')
      expect(result1).toBe('1-test')
      expect(result2).toBe('1-test') // Should return cached result
    })

    it('should handle functions that return objects', () => {
      const obj = {key: 'value'}
      const mockFn = vi.fn(() => obj)
      const memoized = once(mockFn)

      const result1 = memoized()
      const result2 = memoized()

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe(obj)
      expect(result2).toBe(obj)
    })
  })

  describe('isPrimitive()', () => {
    it('should return true for string', () => {
      expect(isPrimitive('')).toBe(true)
      expect(isPrimitive('hello')).toBe(true)
    })

    it('should return true for number', () => {
      expect(isPrimitive(0)).toBe(true)
      expect(isPrimitive(42)).toBe(true)
      expect(isPrimitive(-1)).toBe(true)
      expect(isPrimitive(3.14)).toBe(true)
      expect(isPrimitive(NaN)).toBe(true)
      expect(isPrimitive(Infinity)).toBe(true)
    })

    it('should return true for boolean', () => {
      expect(isPrimitive(true)).toBe(true)
      expect(isPrimitive(false)).toBe(true)
    })

    it('should return true for null and undefined', () => {
      expect(isPrimitive(null)).toBe(true)
      expect(isPrimitive(undefined)).toBe(true)
    })

    it('should return false for objects', () => {
      expect(isPrimitive({})).toBe(false)
      expect(isPrimitive({key: 'value'})).toBe(false)
      expect(isPrimitive([])).toBe(false)
      expect(isPrimitive([1, 2, 3])).toBe(false)
      expect(isPrimitive(new Date())).toBe(false)
      expect(isPrimitive(() => {})).toBe(false)
    })
  })

  describe('recursivelyToJSON()', () => {
    it('should return primitives unchanged', () => {
      expect(recursivelyToJSON('hello')).toBe('hello')
      expect(recursivelyToJSON(42)).toBe(42)
      expect(recursivelyToJSON(true)).toBe(true)
      expect(recursivelyToJSON(null)).toBe(null)
      expect(recursivelyToJSON(undefined)).toBe(undefined)
    })

    it('should handle arrays', () => {
      expect(recursivelyToJSON([1, 2, 'three'])).toEqual([1, 2, 'three'])
      expect(recursivelyToJSON([])).toEqual([])
    })

    it('should handle nested arrays', () => {
      expect(recursivelyToJSON([[1, 2], [3, 'four']])).toEqual([[1, 2], [3, 'four']])
    })

    it('should call toJSON method if available', () => {
      const obj = {
        value: 'test',
        toJSON() {
          return {serialized: this.value}
        }
      }
      expect(recursivelyToJSON(obj)).toEqual({serialized: 'test'})
    })

    it('should handle nested objects with toJSON', () => {
      const inner = {
        toJSON() {
          return 'inner-serialized'
        }
      }
      const outer = {
        inner,
        other: 'value'
      }
      expect(recursivelyToJSON(outer)).toEqual({
        inner: 'inner-serialized',
        other: 'value'
      })
    })

    it('should handle arrays with objects that have toJSON', () => {
      const obj1 = {toJSON: () => 'obj1'}
      const obj2 = {toJSON: () => 'obj2'}
      expect(recursivelyToJSON([obj1, obj2])).toEqual(['obj1', 'obj2'])
    })

    it('should handle plain objects', () => {
      const obj = {
        name: 'test',
        age: 25,
        active: true
      }
      expect(recursivelyToJSON(obj)).toEqual(obj)
    })

    it('should handle deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }
      expect(recursivelyToJSON(obj)).toEqual(obj)
    })

    it('should handle recursive toJSON calls', () => {
      const obj = {
        toJSON() {
          return {
            nested: {
              toJSON() {
                return 'deeply-nested'
              }
            }
          }
        }
      }
      expect(recursivelyToJSON(obj)).toEqual({nested: 'deeply-nested'})
    })
  })

  describe('extractSchema()', () => {
    it('should extract schema from value object constructor', () => {
      class TestVO extends ValueObject.define({
        id: 'TestVO',
        schema: () => z.string()
      }) {}

      const schema = extractSchema(TestVO)
      expect(schema).toBeInstanceOf(z.ZodString)
      expect(schema.parse('test')).toBe('test')
    })

    it('should throw error for value object without raw schema', () => {
      const mockConstructor = {
        [ValueObjectIdSymbol]: 'MockVO'
      } as any

      expect(() => extractSchema(mockConstructor)).toThrow(
        'ValueObject MockVO does not have a raw schema defined.'
      )
    })

    it('should handle complex schemas', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          name: z.string(),
          age: z.number()
        })
      }) {}

      const schema = extractSchema(ComplexVO)
      expect(schema).toBeInstanceOf(z.ZodObject)
      expect(schema.parse({name: 'test', age: 25})).toEqual({name: 'test', age: 25})
    })
  })

  describe('extractZodLiteralValueFromObjectSchema()', () => {
    it('should extract literal value from object schema', () => {
      const schema = z.object({
        type: z.literal('dog'),
        name: z.string()
      })

      const value = extractZodLiteralValueFromObjectSchema(schema, 'type')
      expect(value).toBe('dog')
    })

    it('should throw error for non-object schema', () => {
      const schema = z.string()

      expect(() => extractZodLiteralValueFromObjectSchema(schema, 'type')).toThrow(
        'Cannot extract ZodLiteral value from non-object schema at type.'
      )
    })

    it('should throw error for missing field', () => {
      const schema = z.object({
        name: z.string()
      })

      expect(() => extractZodLiteralValueFromObjectSchema(schema, 'type')).toThrow(
        'Field "type" is not a ZodLiteral in the provided schema.'
      )
    })

    it('should throw error for non-literal field', () => {
      const schema = z.object({
        type: z.string(),
        name: z.string()
      })

      expect(() => extractZodLiteralValueFromObjectSchema(schema, 'type')).toThrow(
        'Field "type" is not a ZodLiteral in the provided schema.'
      )
    })

    it('should throw error for non-string literal value', () => {
      const schema = z.object({
        type: z.literal(42),
        name: z.string()
      })

      expect(() => extractZodLiteralValueFromObjectSchema(schema, 'type')).toThrow(
        'ZodLiteral value for field "type" must be a string.'
      )
    })
  })

  describe('instanceOrConstruct()', () => {
    class TestVO extends ValueObject.define({
      id: 'TestVO',
      schema: () => z.string()
    }) {}

    it('should return existing instances unchanged', () => {
      const instance = new TestVO('test')
      const transformer = instanceOrConstruct(TestVO, z.string())

      const result = transformer.parse(instance)
      expect(result).toBe(instance)
    })

    it('should construct new instance from valid input', () => {
      const transformer = instanceOrConstruct(TestVO, z.string())

      const result = transformer.parse('test')
      expect(result).toBeInstanceOf(TestVO)
      expect(result.props).toBe('test')
    })

    it('should handle schema validation errors', () => {
      const transformer = instanceOrConstruct(TestVO, z.string())

      expect(() => transformer.parse(123)).toThrow()
    })

    it('should handle constructor errors', () => {
      class FailingVO {
        constructor() {
          throw new Error('Constructor failed')
        }
      }

      const transformer = instanceOrConstruct(FailingVO, z.string())

      expect(() => transformer.parse('test')).toThrow()
    })

    it('should preserve error paths in nested contexts', () => {
      const transformer = instanceOrConstruct(TestVO, z.string())
      const nestedSchema = z.object({
        nested: z.array(transformer)
      })

      const result = nestedSchema.safeParse({
        nested: ['valid', 123, 'also-valid']
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['nested', 1])
      }
    })
  })
})
