import {describe, it, expect} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'

describe('Edge Cases and Error Handling', () => {
  describe('Invalid schema scenarios', () => {
    it('should handle empty schema factory', () => {
      expect(() => {
        ValueObject.define({
          id: 'InvalidVO',
          schema: () => undefined as any
        })
      }).not.toThrow() // The error should occur during usage, not definition
    })

    it('should handle schema factory that throws', () => {
      const ThrowingVO = ValueObject.define({
        id: 'ThrowingVO',
        schema: () => {
          throw new Error('Schema creation failed')
        }
      })

      expect(() => ThrowingVO.fromJSON('test')).toThrow('Schema creation failed')
    })

    it('should handle circular schema references', () => {
      // This tests the 'once' memoization behavior
      let callCount = 0
      const MyVO = ValueObject.define({
        id: 'MyV0',
        schema: () => {
          callCount++
          return z.object({
            id: z.string(),
          })
        }
      })

      const instance = MyVO.fromJSON({
        id: 'root',
      })
      MyVO.schema()
      MyVO.schemaRaw()
      MyVO.schemaPrimitive()

      expect(instance.props.id).toBe('root')
      expect(callCount).toBe(1) // Schema should be memoized
    })
  })

  describe('Constructor failures', () => {
    it('should handle constructor that throws during instantiation', () => {
      class FailingVO extends ValueObject.define({
        id: 'FailingVO',
        schema: () => z.string()
      }) {
        constructor(props: string) {
          super(props)
          if (props === 'fail') {
            throw new Error('Construction failed')
          }
        }
      }

      expect(() => FailingVO.fromJSON('fail')).toThrow('Construction failed')
      expect(() => FailingVO.fromJSON('success')).not.toThrow()
    })

    it('should allow overwriting the constructor', () => {
      class StrictVO extends ValueObject.define({
        id: 'StrictVO',
        schema: () => z.object({value: z.string()})
      }) {
        constructor(props: {value: string}) {
          if (!props || typeof props.value !== 'string') {
            throw new Error('Invalid props structure')
          }
          super(props)
        }
      }

      expect(() => StrictVO.fromJSON({value: 'valid'})).not.toThrow()
      expect(() => new StrictVO(null as any)).toThrow('Invalid props structure')
    })
  })

  describe('Union discrimination errors', () => {
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

    it('should reject mismatched discriminator values at the type level', () => {
      ValueObject.defineUnion('type', () => ({
        // @ts-expect-error - Dog's discriminator literal is "dog", not "wrongKey"
        wrongKey: Dog,
        cat: Cat,
      }))

      ValueObject.defineUnion('type', () => ({
        // @ts-expect-error - Cat's discriminator literal is "cat", not "dog"
        dog: Cat,
        // @ts-expect-error - Dog's discriminator literal is "dog", not "cat"
        cat: Dog,
      }))

      ValueObject.defineUnion('type', () => ({
        // @ts-expect-error - "spaghetti" is not a valid discriminator for Dog
        spaghetti: Dog,
        // @ts-expect-error - "bolognese" is not a valid discriminator for Cat
        bolognese: Cat,
      }))

      // Runtime guard still rejects mismatches that bypass the type system.
      const MismatchedUnion = ValueObject.defineUnion('type', () => ({
        wrongKey: Dog,
        cat: Cat,
      }) as any)

      expect(() => MismatchedUnion.fromJSON({type: 'dog', woofs: true} as any))
        .toThrow('Discriminator value mismatch for Dog: expected "wrongKey", got "dog"')
    })

    it('should handle invalid discriminator values in union', () => {
      const Pets = ValueObject.defineUnion('type', () => ({
        dog: Dog,
        cat: Cat
      }))

      expect(() => Pets.fromJSON({type: 'bird', flies: true} as any))
        .toThrowErrorMatchingInlineSnapshot(`
          "[
            {
              \\"code\\": \\"custom\\",
              \\"path\\": [
                \\"type\\"
              ],
              \\"message\\": \\"Invalid input\\"
            }
          ]"
        `)
    })

    it('should handle missing discriminator field', () => {
      const Pets = ValueObject.defineUnion('type', () => ({
        dog: Dog,
        cat: Cat
      }))

      expect(() => Pets.fromJSON({woofs: true} as any)).toThrowErrorMatchingInlineSnapshot(`
        "[
          {
            \\"code\\": \\"custom\\",
            \\"path\\": [
              \\"type\\"
            ],
            \\"message\\": \\"Invalid input\\"
          }
        ]"
      `)
    })

    it('should handle non-literal discriminator field', () => {
      class InvalidVO extends ValueObject.define({
        id: 'InvalidVO',
        schema: () => z.object({
          type: z.string(), // Not a literal!
          value: z.string()
        })
      }) {}

      expect(() => {
        const BadUnion = ValueObject.defineUnion('type', () => ({
          invalid: InvalidVO
        }))
        BadUnion.fromJSON({type: 'invalid', value: 'test'})
      }).toThrow('Field "type" is not a ZodLiteral in the provided schema.')
    })

    it('should handle union with non-object schemas', () => {
      class StringVO extends ValueObject.define({
        id: 'StringVO',
        schema: () => z.string()
      }) {}

      expect(() => {
        const BadUnion = ValueObject.defineUnion('type', () => ({
          // @ts-expect-error - StringVO's schema is not an object with a discriminator field
          string: StringVO
        }))
        BadUnion.fromJSON('test')
      }).toThrow('Cannot extract ZodLiteral value from non-object schema at type.')
    })
  })

  describe('JSON serialization edge cases', () => {
    it('should handle toJSON that returns undefined', () => {
      const UndefinedVO = ValueObject.define({
        id: 'UndefinedVO',
        schema: () => z.string(),
        toJSON: () => undefined as any
      })

      const instance = new UndefinedVO('test')
      expect(instance.toJSON()).toBeUndefined()
    })

    it('should handle toJSON that throws', () => {
      const ThrowingJSONVO = ValueObject.define({
        id: 'ThrowingJSONVO',
        schema: () => z.string(),
        toJSON: () => {
          throw new Error('JSON serialization failed')
        }
      })

      const instance = new ThrowingJSONVO('test')
      expect(() => instance.toJSON()).toThrow('JSON serialization failed')
    })

    it('should handle deeply nested structures', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) return 'leaf'
        return {nested: createDeepObject(depth - 1)}
      }

      const DeepVO = ValueObject.define({
        id: 'DeepVO',
        schema: () => z.any(),
        toJSON: (props) => createDeepObject(100)
      })

      const instance = new DeepVO('test')
      const result = instance.toJSON()

      // Should handle deep nesting without stack overflow
      expect(result).toMatchObject({nested: expect.any(Object)})
    })

    it('should handle arrays with mixed toJSON behaviors', () => {
      const obj1 = {toJSON: () => 'serialized1'}
      const obj2 = {regularProp: 'value2'}
      const obj3 = {toJSON: () => ({complex: 'object'})}

      const MixedArrayVO = ValueObject.define({
        id: 'MixedArrayVO',
        schema: () => z.array(z.any()),
        toJSON: (props) => props
      })

      const instance = new MixedArrayVO([obj1, obj2, obj3, 'string', 42])
      expect(instance.toJSON()).toEqual([
        'serialized1',
        {regularProp: 'value2'},
        {complex: 'object'},
        'string',
        42
      ])
    })

    it('should handle null and undefined in complex structures', () => {
      const NullishVO = ValueObject.define({
        id: 'NullishVO',
        schema: () => z.object({
          nullValue: z.null(),
          undefinedValue: z.undefined(),
          optional: z.string().optional(),
          nullable: z.string().nullable()
        })
      })

      const instance = NullishVO.fromJSON({
        nullValue: null,
        undefinedValue: undefined,
        nullable: null
      })

      expect(instance.toJSON()).toEqual({
        nullValue: null,
        undefinedValue: undefined,
        nullable: null
      })
    })
  })

  describe('Schema method edge cases', () => {
    class TestVO extends ValueObject.define({
      id: 'TestVO',
      schema: () => z.string().min(1)
    }) {}

    it('should handle schema validation with custom error messages', () => {
      const result = TestVO.schema().safeParse('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Too small')
      }
    })

    it('should handle schemaPrimitive with invalid construction', () => {
      class ThrowingConstructorVO extends ValueObject.define({
        id: 'ThrowingConstructorVO',
        schema: () => z.string()
      }) {
        constructor(props: string) {
          if (props === 'throw') {
            throw new Error('Cannot construct with this value')
          }
          super(props)
        }
      }

      expect(() => ThrowingConstructorVO.schemaPrimitive().parse('throw'))
        .toThrow('Cannot construct with this value')
    })

    it('should handle schemaRaw with complex Zod schema', () => {
      class ComplexVO extends ValueObject.define({
        id: 'ComplexVO',
        schema: () => z.object({
          id: z.string().uuid(),
          metadata: z.record(z.string(), z.unknown()),
          createdAt: z.date().default(() => new Date())
        })
      }) {}

      const rawSchema = ComplexVO.schemaRaw()
      expect(rawSchema).toBeInstanceOf(z.ZodObject)

      const result = rawSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        metadata: {key: 'value'}
      })

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(result.createdAt).toBeInstanceOf(Date)
    })
  })
})
