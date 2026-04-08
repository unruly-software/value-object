import {describe, it, expect, expectTypeOf} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'

describe('ValueObject#equals', () => {
  describe('Primitive-backed value objects', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {}

    it('returns true for two instances built from the same string', () => {
      const a = Email.fromJSON('alice@example.com')
      const b = Email.fromJSON('alice@example.com')
      expect(a).not.toBe(b) // different references
      expect(a.equals(b)).toBe(true)
      expect(b.equals(a)).toBe(true)
    })

    it('returns false for instances built from different strings', () => {
      const a = Email.fromJSON('alice@example.com')
      const b = Email.fromJSON('bob@example.com')
      expect(a.equals(b)).toBe(false)
    })

    it('returns true when compared to itself', () => {
      const a = Email.fromJSON('alice@example.com')
      expect(a.equals(a)).toBe(true)
    })
  })

  describe('null and undefined props', () => {
    class UndefinedVO extends ValueObject.define({
      id: 'UndefinedVO',
      schema: () => z.object({field: z.undefined()}),
    }) {}

    class NullVO extends ValueObject.define({
      id: 'NullVO',
      schema: () => z.object({field: z.null()}),
    }) {}

    it('UndefinedVO instances are equal to each other', () => {
      const a = UndefinedVO.fromJSON({field: undefined})
      const b = UndefinedVO.fromJSON({field: undefined})
      expect(a.equals(b)).toBe(true)
    })

    it('NullVO instances are equal to each other', () => {
      const a = NullVO.fromJSON({field: null})
      const b = NullVO.fromJSON({field: null})
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('Object-backed value objects', () => {
    class Address extends ValueObject.define({
      id: 'Address',
      schema: () =>
        z.object({
          street: z.string(),
          city: z.string(),
          zipCode: z.string(),
        }),
    }) {}

    it('returns true when keys are constructed in the same order', () => {
      const a = Address.fromJSON({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '12345',
      })
      const b = Address.fromJSON({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '12345',
      })
      expect(a.equals(b)).toBe(true)
    })

    it('returns true regardless of the original key order', () => {
      const a = Address.fromJSON({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '12345',
      })
      const b = Address.fromJSON({
        // Reverse order — should still compare equal.
        zipCode: '12345',
        city: 'Springfield',
        street: '123 Main St',
      })
      expect(a.equals(b)).toBe(true)
    })

    it('returns false when any field differs', () => {
      const a = Address.fromJSON({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '12345',
      })
      const b = Address.fromJSON({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '54321',
      })
      expect(a.equals(b)).toBe(false)
    })
  })

  describe('Nested value objects', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {}

    class User extends ValueObject.define({
      id: 'User',
      schema: () =>
        z.object({
          name: z.string(),
          email: Email.schema(),
        }),
    }) {}

    it('uses the inner value object equals() for nested fields', () => {
      const a = User.fromJSON({name: 'Alice', email: 'alice@example.com'})
      const b = User.fromJSON({name: 'Alice', email: 'alice@example.com'})
      expect(a.props.email).not.toBe(b.props.email) // different references
      expect(a.props.email.equals(b.props.email)).toBe(true)
      expect(a.equals(b)).toBe(true)
    })

    it('returns false when a nested value object differs', () => {
      const a = User.fromJSON({name: 'Alice', email: 'alice@example.com'})
      const b = User.fromJSON({name: 'Alice', email: 'alice@other.com'})
      expect(a.equals(b)).toBe(false)
    })

    it('honours a user override on the nested value object', () => {
      // EmailCI compares case-insensitively.
      class EmailCI extends ValueObject.define({
        id: 'EmailCI',
        schema: () => z.string().email(),
      }) {
        override equals(other: EmailCI): boolean {
          if (!(other instanceof EmailCI)) return false
          return this.props.toLowerCase() === other.props.toLowerCase()
        }
      }

      class Account extends ValueObject.define({
        id: 'Account',
        schema: () =>
          z.object({
            name: z.string(),
            email: EmailCI.schema(),
          }),
      }) {}

      const a = Account.fromJSON({name: 'Alice', email: 'Alice@Example.com'})
      const b = Account.fromJSON({name: 'Alice', email: 'alice@example.com'})

      // Direct comparison goes through the override.
      expect(a.props.email.equals(b.props.email)).toBe(true)

      // Parent comparison cascades through the inner override.
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('Arrays in props', () => {
    class Tag extends ValueObject.define({
      id: 'Tag',
      schema: () => z.string(),
    }) {}

    class Post extends ValueObject.define({
      id: 'Post',
      schema: () =>
        z.object({
          title: z.string(),
          tags: z.array(Tag.schema()),
        }),
    }) {}

    it('returns true for arrays with identical contents in the same order', () => {
      const a = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod', 'ddd']})
      const b = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod', 'ddd']})
      expect(a.equals(b)).toBe(true)
    })

    it('returns false when arrays contain the same elements in a different order', () => {
      const a = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod', 'ddd']})
      const b = Post.fromJSON({title: 'Hello', tags: ['zod', 'ts', 'ddd']})
      expect(a.equals(b)).toBe(false)
    })

    it('returns false when arrays differ in length', () => {
      const a = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod']})
      const b = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod', 'ddd']})
      expect(a.equals(b)).toBe(false)
    })

    it('compares nested value objects inside arrays via their own equals()', () => {
      const a = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod']})
      const b = Post.fromJSON({title: 'Hello', tags: ['ts', 'zod']})
      // Different Tag instances at index 0 but should still be equal.
      expect(a.props.tags[0]).not.toBe(b.props.tags[0])
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('Cross-type comparisons', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {}

    class Username extends ValueObject.define({
      id: 'Username',
      schema: () => z.string().min(1),
    }) {}

    it('returns false when comparing two different VO types with the same primitive props', () => {
      const e = Email.fromJSON('alice@example.com')
      // Cast through any: this is the runtime check, not the type check.
      const u = Username.fromJSON('alice@example.com') as any
      expect(e.equals(u)).toBe(false)
    })

    it('returns false when compared with null, undefined, or a plain object', () => {
      const e = Email.fromJSON('alice@example.com')
      expect((e.equals as any)(null)).toBe(false)
      expect((e.equals as any)(undefined)).toBe(false)
      expect((e.equals as any)({props: 'alice@example.com'})).toBe(false)
      expect((e.equals as any)('alice@example.com')).toBe(false)
    })
  })

  describe('Subclasses produced via ValueObject.extends', () => {
    class Animal extends ValueObject.define({
      id: 'Animal',
      schema: () =>
        z.object({name: z.string(), age: z.number().int().nonnegative()}),
    }) {}

    class Dog extends ValueObject.extends(Animal, {
      id: 'Dog',
      schema: (prev) => prev.and(z.object({breed: z.string()})),
    }) {}

    class Cat extends ValueObject.extends(Animal, {
      id: 'Cat',
      schema: (prev) => prev.and(z.object({indoor: z.boolean()})),
    }) {}

    it('two Dog instances with identical props are equal', () => {
      const a = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'})
      const b = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'})
      expect(a.equals(b)).toBe(true)
    })

    it('Dog and Cat are never equal even when shared fields match', () => {
      const dog = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'}) as any
      const cat = Cat.fromJSON({name: 'Rex', age: 3, indoor: true}) as any
      expect(dog.equals(cat)).toBe(false)
    })

    it('Dog and bare Animal with same shared fields are not equal (different IDs)', () => {
      const dog = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'}) as any
      const animal = Animal.fromJSON({name: 'Rex', age: 3}) as any
      expect(dog.equals(animal)).toBe(false)
      expect(animal.equals(dog)).toBe(false)
    })
  })

  describe('User overrides', () => {
    // Compare users by id only — common pattern for entity-like value objects.
    class User extends ValueObject.define({
      id: 'User',
      schema: () =>
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          updatedAt: z.string(),
        }),
    }) {
      override equals(other: User): boolean {
        if (!(other instanceof User)) return false
        return this.props.id === other.props.id
      }
    }

    it('uses the override even when other fields differ', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000'
      const a = User.fromJSON({id, name: 'Alice', updatedAt: '2024-01-01'})
      const b = User.fromJSON({id, name: 'Alice Renamed', updatedAt: '2024-12-31'})
      expect(a.equals(b)).toBe(true)
    })

    it('the override returns false when ids differ even if other fields match', () => {
      const a = User.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Alice',
        updatedAt: '2024-01-01',
      })
      const b = User.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Alice',
        updatedAt: '2024-01-01',
      })
      expect(a.equals(b)).toBe(false)
    })

    it('the override is honoured when the User is nested inside another VO', () => {
      class Comment extends ValueObject.define({
        id: 'Comment',
        schema: () =>
          z.object({
            body: z.string(),
            author: User.schema(),
          }),
      }) {}

      const id = '123e4567-e89b-12d3-a456-426614174000'
      const a = Comment.fromJSON({
        body: 'hello',
        author: {id, name: 'Alice', updatedAt: '2024-01-01'},
      })
      const b = Comment.fromJSON({
        body: 'hello',
        // Same id, different name & timestamp — User override says equal.
        author: {id, name: 'Alice Renamed', updatedAt: '2024-12-31'},
      })
      expect(a.equals(b)).toBe(true)
    })

    it('the override parameter type is the subclass', () => {
      // Type-level smoke check: `override equals(other: User)` is valid.
      expectTypeOf(User.prototype.equals)
        .parameter(0)
        .toEqualTypeOf<User>()
    })
  })

  describe('deepEquals branch coverage via heterogeneous prop shapes', () => {
    // Each pair below targets a specific branch in `deepEquals` that is hard
    // to reach through the more "well-typed" tests above. The schemas use
    // unions so the same value object can hold either side of a heterogeneous
    // comparison.

    it('returns false when one VO has a null prop and the other has an object prop', () => {
      // Targets the `a === null` short-circuit reached via recursion (the
      // top-level `equals` already guards `this`, so this branch only fires
      // when deepEquals recurses into the props).
      class MaybeData extends ValueObject.define({
        id: 'MaybeData',
        schema: () => z.union([z.null(), z.object({x: z.number()})]),
      }) {}

      const a = MaybeData.fromJSON(null)
      const b = MaybeData.fromJSON({x: 1})
      expect(a.equals(b)).toBe(false)
      // And the symmetric direction (`b === null` branch).
      expect(b.equals(a)).toBe(false)
    })

    it('returns false when one nested value is a value object and the other is a plain object', () => {
      // Targets `aIsVO !== bIsVO` reached via recursion into props.
      class Email extends ValueObject.define({
        id: 'Email',
        schema: () => z.string().email(),
      }) {}

      class Container extends ValueObject.define({
        id: 'Container',
        schema: () =>
          z.object({
            inner: z.union([
              Email.schema(),
              z.object({raw: z.string()}),
            ]),
          }),
      }) {}

      const a = Container.fromJSON({inner: 'alice@example.com'})
      const b = Container.fromJSON({inner: {raw: 'alice@example.com'}})
      expect(a.equals(b)).toBe(false)
      expect(b.equals(a)).toBe(false)
    })

    it('returns false when comparing two VOs with different IDs but the same prop shape', () => {
      // Targets the inline ID-mismatch branch in deepEquals.
      class A extends ValueObject.define({
        id: 'A',
        schema: () => z.object({n: z.number()}),
      }) {}
      class B extends ValueObject.define({
        id: 'B',
        schema: () => z.object({n: z.number()}),
      }) {}

      const a = A.fromJSON({n: 1})
      const b = B.fromJSON({n: 1}) as any
      expect(a.equals(b)).toBe(false)
    })

    it('returns false when one prop is a Date and the other is a plain object', () => {
      // Targets the Date-vs-non-Date branch in the Date check.
      class WhenOrMeta extends ValueObject.define({
        id: 'WhenOrMeta',
        schema: () =>
          z.object({
            value: z.union([z.date(), z.object({y: z.number()})]),
          }),
      }) {}

      const a = WhenOrMeta.fromJSON({value: new Date('2024-01-01T00:00:00Z')})
      const b = WhenOrMeta.fromJSON({value: {y: 1}})
      expect(a.equals(b)).toBe(false)
      expect(b.equals(a)).toBe(false)
    })

    it('returns false when one prop is an array and the other is a plain object', () => {
      // Targets the array-vs-non-array branch.
      class ListOrMap extends ValueObject.define({
        id: 'ListOrMap',
        schema: () =>
          z.object({
            value: z.union([
              z.array(z.string()),
              z.object({k: z.string()}),
            ]),
          }),
      }) {}

      const a = ListOrMap.fromJSON({value: ['a', 'b']})
      const b = ListOrMap.fromJSON({value: {k: 'a'}})
      expect(a.equals(b)).toBe(false)
      expect(b.equals(a)).toBe(false)
    })

    it('returns false when nested objects have a different number of keys', () => {
      // Targets the `aKeys.length !== bKeys.length` branch on nested plain objects.
      class WithOptional extends ValueObject.define({
        id: 'WithOptional',
        schema: () =>
          z.object({
            data: z.object({
              a: z.string(),
              b: z.string().optional(),
            }),
          }),
      }) {}

      const a = WithOptional.fromJSON({data: {a: 'x', b: 'y'}})
      const b = WithOptional.fromJSON({data: {a: 'x'}})
      expect(a.equals(b)).toBe(false)
    })

    it('returns false when nested objects have the same key count but different keys', () => {
      // Targets the `hasOwnProperty(b, key)` branch where lengths match but
      // a key from `a` is missing in `b`.
      class TwoShapes extends ValueObject.define({
        id: 'TwoShapes',
        schema: () =>
          z.object({
            data: z.union([
              z.object({x: z.string()}),
              z.object({y: z.string()}),
            ]),
          }),
      }) {}

      const a = TwoShapes.fromJSON({data: {x: 'a'}})
      const b = TwoShapes.fromJSON({data: {y: 'a'}})
      expect(a.equals(b)).toBe(false)
    })

    it('honours an override that lives only on the right-hand operand', () => {
      // Targets the `bEquals` override-detection branch in deepEquals. Both
      // values must share the same VO id (so the inline ID check passes), but
      // only the right-hand instance must carry an override — otherwise the
      // `aEquals` branch fires first. We pin the override directly onto the
      // single instance to engineer that asymmetry.
      class Word extends ValueObject.define({
        id: 'Word',
        schema: () => z.string(),
      }) {}

      const a = Word.fromJSON('HELLO')
      const b = Word.fromJSON('hello')

      // Default equals is case-sensitive — sanity check the starting point.
      expect(a.equals(b)).toBe(false)

      // Pin a case-insensitive override on the `b` instance only.
      ;(b as any).equals = function (other: Word) {
        return this.props.toLowerCase() === other.props.toLowerCase()
      }

      // a.equals(b) → deepEquals(a, b) → a uses default → b's override fires.
      expect(a.equals(b)).toBe(true)
    })

    it('comparing a value object to a primitive returns false', () => {
      // Targets the `typeof b !== "object"` branch where `this` is an object.
      class Email extends ValueObject.define({
        id: 'Email',
        schema: () => z.string().email(),
      }) {}
      const e = Email.fromJSON('alice@example.com')
      expect((e.equals as any)(42)).toBe(false)
      expect((e.equals as any)(true)).toBe(false)
    })
  })

  describe('Date and primitive edge cases in props', () => {
    class Event extends ValueObject.define({
      id: 'Event',
      schema: () =>
        z.object({
          name: z.string(),
          when: z.date(),
        }),
    }) {}

    it('compares Date fields by their numeric time, not by reference', () => {
      const a = Event.fromJSON({name: 'launch', when: new Date('2024-01-01T00:00:00Z')})
      const b = Event.fromJSON({name: 'launch', when: new Date('2024-01-01T00:00:00Z')})
      expect(a.props.when).not.toBe(b.props.when)
      expect(a.equals(b)).toBe(true)
    })

    it('returns false when Date fields differ', () => {
      const a = Event.fromJSON({name: 'launch', when: new Date('2024-01-01T00:00:00Z')})
      const b = Event.fromJSON({name: 'launch', when: new Date('2024-01-02T00:00:00Z')})
      expect(a.equals(b)).toBe(false)
    })
  })
})
