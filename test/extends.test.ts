import {describe, it, expect, expectTypeOf} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'
import {extractSchema} from '../src/utils'

describe('ValueObject.extends', () => {
  describe('Refining a primitive value object', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {
      get domain() {
        return this.props.split('@')[1]
      }
    }

    class GoogleEmail extends ValueObject.extends(Email, {
      id: 'GoogleEmail',
      schema: (prev) =>
        prev.refine(
          (s) => /@(?:[\w-]+\.)*google\.com$/.test(s),
          'must be a google email',
        ),
    }) {
      get isWorkspace() {
        return this.props.endsWith('@workspace.google.com')
      }
    }

    it('parses a valid value through the refined schema', () => {
      const ge = GoogleEmail.fromJSON('alice@google.com')
      expect(ge.props).toBe('alice@google.com')
    })

    it('rejects values that fail the new refinement', () => {
      expect(() => GoogleEmail.fromJSON('alice@yahoo.com')).toThrow(
        /must be a google email/,
      )
    })

    it('still rejects values that fail the parent schema', () => {
      expect(() => GoogleEmail.fromJSON('not-an-email')).toThrow()
    })

    it('preserves the prototype chain — instanceof parent and self', () => {
      const ge = GoogleEmail.fromJSON('alice@google.com')
      expect(ge).toBeInstanceOf(GoogleEmail)
      expect(ge).toBeInstanceOf(Email)
    })

    it('inherits getters defined on the parent class', () => {
      const ge = GoogleEmail.fromJSON('alice@google.com')
      expect(ge.domain).toBe('google.com')
    })

    it('exposes getters defined on the extended user class', () => {
      const ge = GoogleEmail.fromJSON('alice@workspace.google.com')
      expect(ge.isWorkspace).toBe(true)
      const ge2 = GoogleEmail.fromJSON('alice@google.com')
      expect(ge2.isWorkspace).toBe(false)
    })

    it('does not affect the parent — Email still accepts non-google emails', () => {
      const e = Email.fromJSON('alice@yahoo.com')
      expect(e.props).toBe('alice@yahoo.com')
      expect(e).not.toBeInstanceOf(GoogleEmail)
    })

    it('Email.schema() and GoogleEmail.schema() are independent', () => {
      const emailResult = Email.schema().safeParse('alice@yahoo.com')
      const googleResult = GoogleEmail.schema().safeParse('alice@yahoo.com')
      expect(emailResult.success).toBe(true)
      expect(googleResult.success).toBe(false)
    })

    it('round-trips through schemaPrimitive without producing a parent instance', () => {
      const result = GoogleEmail.schemaPrimitive().parse('alice@google.com')
      expect(result).toBeInstanceOf(GoogleEmail)
      expect(result).toBeInstanceOf(Email)
    })
  })

  describe('Extending an object-shaped value object via .and', () => {
    class Person extends ValueObject.define({
      id: 'Person',
      schema: () => z.object({name: z.string()}),
    }) {
      greet() {
        return `hi ${this.props.name}`
      }
    }

    class Employee extends ValueObject.extends(Person, {
      id: 'Employee',
      schema: (prev) => prev.and(z.object({company: z.string()})),
    }) {
      get summary() {
        return `${this.props.name} @ ${this.props.company}`
      }
    }

    it('parses both parent and new fields', () => {
      const e = Employee.fromJSON({name: 'Alice', company: 'Acme'})
      expect(e.props).toEqual({name: 'Alice', company: 'Acme'})
    })

    it('rejects input missing the new field', () => {
      expect(() => Employee.fromJSON({name: 'Alice'} as any)).toThrow()
    })

    it('inherits parent methods that read parent fields', () => {
      const e = Employee.fromJSON({name: 'Alice', company: 'Acme'})
      expect(e.greet()).toBe('hi Alice')
    })

    it('exposes new methods that read both parent and new fields', () => {
      const e = Employee.fromJSON({name: 'Alice', company: 'Acme'})
      expect(e.summary).toBe('Alice @ Acme')
    })

    it('is instanceof both Employee and Person', () => {
      const e = Employee.fromJSON({name: 'Alice', company: 'Acme'})
      expect(e).toBeInstanceOf(Employee)
      expect(e).toBeInstanceOf(Person)
    })
  })

  describe('toJSON behaviour', () => {
    class Money extends ValueObject.define({
      id: 'Money',
      schema: () => z.object({amount: z.number(), currency: z.string()}),
      toJSON: (v) => `${v.amount} ${v.currency}`,
    }) {}

    it('inherits the parent toJSON when no override is provided', () => {
      class TaxedMoney extends ValueObject.extends(Money, {
        id: 'TaxedMoney',
        schema: (prev) => prev.and(z.object({taxRate: z.number()})),
      }) {}

      const tm = TaxedMoney.fromJSON({amount: 100, currency: 'USD', taxRate: 0.1})
      expect(tm.toJSON()).toBe('100 USD')
      expect(JSON.stringify(tm)).toBe('"100 USD"')
    })

    it('uses a custom toJSON when provided in extend options', () => {
      class TaxedMoney extends ValueObject.extends(Money, {
        id: 'TaxedMoney',
        schema: (prev) => prev.and(z.object({taxRate: z.number()})),
        toJSON: (v) => `${v.amount} ${v.currency} (+${v.taxRate * 100}%)`,
      }) {}

      const tm = TaxedMoney.fromJSON({amount: 100, currency: 'USD', taxRate: 0.1})
      expect(tm.toJSON()).toBe('100 USD (+10%)')
      expect(JSON.stringify(tm)).toBe('"100 USD (+10%)"')
    })
  })

  describe('Interop with existing public API', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {}

    class GoogleEmail extends ValueObject.extends(Email, {
      id: 'GoogleEmail',
      schema: (prev) => prev.refine((s) => s.endsWith('@google.com')),
    }) {}

    it('extractSchema returns the extended schema, not the parent schema', () => {
      const parentSchema = extractSchema(Email)
      const extendedSchema = extractSchema(GoogleEmail)
      expect(parentSchema).not.toBe(extendedSchema)

      // The extended schema rejects non-google emails; the parent does not.
      expect(parentSchema.safeParse('a@yahoo.com').success).toBe(true)
      expect(extendedSchema.safeParse('a@yahoo.com').success).toBe(false)
    })

    it('inferProps / inferJSON / inferInput resolve to the extended types', () => {
      expectTypeOf<ValueObject.inferProps<typeof GoogleEmail>>().toEqualTypeOf<string>()
      expectTypeOf<ValueObject.inferJSON<typeof GoogleEmail>>().toEqualTypeOf<string>()
      expectTypeOf<
        ValueObject.inferInput<typeof GoogleEmail>
      >().toEqualTypeOf<string | GoogleEmail>()
    })

    it('inferProps with a custom JSON serializer on the extension', () => {
      class Money extends ValueObject.define({
        id: 'Money',
        schema: () => z.object({amount: z.number(), currency: z.string()}),
      }) {}

      class TaxedMoney extends ValueObject.extends(Money, {
        id: 'TaxedMoney',
        schema: (prev) => prev.and(z.object({taxRate: z.number()})),
        toJSON: (v) => `${v.amount} ${v.currency}`,
      }) {}

      expectTypeOf<ValueObject.inferProps<typeof TaxedMoney>>().toEqualTypeOf<{
        amount: number
        currency: string
      } & {taxRate: number}>()
      expectTypeOf<ValueObject.inferJSON<typeof TaxedMoney>>().toEqualTypeOf<string>()
    })

    it('GoogleEmail.fromJSON accepts string and returns GoogleEmail', () => {
      const result = GoogleEmail.fromJSON('alice@google.com')
      expectTypeOf(result).toEqualTypeOf<GoogleEmail>()
      // Also accepts an existing instance (idempotent fromJSON):
      const result2 = GoogleEmail.fromJSON(result)
      expectTypeOf(result2).toEqualTypeOf<GoogleEmail>()
    })

    it('works as a member of a defineUnion (literal still inherited from parent)', () => {
      class Dog extends ValueObject.define({
        id: 'Dog',
        schema: () =>
          z.object({type: z.literal('dog'), age: z.number(), name: z.string()}),
      }) {}

      class Cat extends ValueObject.define({
        id: 'Cat',
        schema: () =>
          z.object({type: z.literal('cat'), name: z.string()}),
      }) {}

      // Puppy inherits the 'dog' literal from Dog and refines age < 1.
      class Puppy extends ValueObject.extends(Dog, {
        id: 'Puppy',
        schema: (prev) => prev.refine((d) => d.age < 1, 'must be under 1 year'),
      }) {}

      const Pets = ValueObject.defineUnion('type', () => ({
        dog: Puppy,
        cat: Cat,
      }))

      // Parses through the *extended* validation: an old dog is rejected.
      const puppy = Pets.fromJSON({type: 'dog', age: 0.5, name: 'Rex'})
      expect(puppy).toBeInstanceOf(Puppy)
      expect(puppy).toBeInstanceOf(Dog)

      expect(() =>
        Pets.fromJSON({type: 'dog', age: 5, name: 'Rex'}),
      ).toThrow(/must be under 1 year/)

      // The discriminator validator on defineUnion uses the inherited 'dog'
      // literal — keying Puppy under any other label is a type error.
      ValueObject.defineUnion('type', () => ({
        // @ts-expect-error - Puppy's discriminator literal is "dog", not "puppy"
        puppy: Puppy,
        cat: Cat,
      }))
    })

    it('ValueObjectSchema<typeof GoogleEmail> resolves to the extended schema', () => {
      type S = ValueObject.ValueObjectSchema<typeof GoogleEmail>
      expectTypeOf<z.output<S>>().toEqualTypeOf<string>()
    })

    it('exposes schemaRaw() on the extended class', () => {
      const raw = (GoogleEmail as any).schemaRaw()
      // It is a Zod schema and rejects non-google emails (the extended rule).
      expect(raw.safeParse('a@yahoo.com').success).toBe(false)
      expect(raw.safeParse('a@google.com').success).toBe(true)
    })
  })

  describe('Type-level constraint on schema transform output', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {}

    it('rejects transforms that change the output type (string -> number)', () => {
      const broken = ValueObject.extends(Email, {
        id: 'EmailLength',
        schema: (prev) => prev.transform((s) => s.length),
      })

      // The function returns a non-constructable sentinel error type.
      // Trying to use it as a base class is therefore a type error.
      expectTypeOf(broken).toEqualTypeOf<
        ValueObject.SchemaTransformOutputMismatchError
      >()

      // @ts-expect-error - cannot extend a non-constructable sentinel error type
      class Broken extends broken {}
      void Broken
    })

    it('accepts transforms that preserve the output type (refine)', () => {
      const ok = ValueObject.extends(Email, {
        id: 'GoogleEmail',
        schema: (prev) => prev.refine((s) => s.endsWith('@google.com')),
      })

      // Should NOT be the sentinel; should be a real constructor.
      expectTypeOf(ok).not.toEqualTypeOf<
        ValueObject.SchemaTransformOutputMismatchError
      >()

      // Extending it as a class works.
      class GoogleEmail extends ok {}
      const ge = GoogleEmail.fromJSON('alice@google.com')
      expect(ge).toBeInstanceOf(GoogleEmail)
    })

    it('accepts transforms that broaden via .and (object intersection)', () => {
      class Person extends ValueObject.define({
        id: 'Person',
        schema: () => z.object({name: z.string()}),
      }) {}

      const ok = ValueObject.extends(Person, {
        id: 'Employee',
        schema: (prev) => prev.and(z.object({company: z.string()})),
      })

      expectTypeOf(ok).not.toEqualTypeOf<
        ValueObject.SchemaTransformOutputMismatchError
      >()
    })
  })

  describe('Sibling extensions (Animal -> Dog, Animal -> Cat)', () => {
    class Animal extends ValueObject.define({
      id: 'Animal',
      schema: () =>
        z.object({
          name: z.string(),
          age: z.number().int().nonnegative(),
        }),
    }) {
      get description() {
        return `${this.props.name}, age ${this.props.age}`
      }
    }

    class Dog extends ValueObject.extends(Animal, {
      id: 'Dog',
      schema: (prev) => prev.and(z.object({breed: z.string()})),
    }) {
      bark() {
        return `${this.props.name} says woof!`
      }
    }

    class Cat extends ValueObject.extends(Animal, {
      id: 'Cat',
      schema: (prev) => prev.and(z.object({indoor: z.boolean()})),
    }) {
      meow() {
        return `${this.props.name} says meow!`
      }
    }

    it('Dog parses parent + new fields and exposes both methods', () => {
      const dog = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'})
      expect(dog.props).toEqual({name: 'Rex', age: 3, breed: 'Labrador'})
      expect(dog.description).toBe('Rex, age 3')
      expect(dog.bark()).toBe('Rex says woof!')
    })

    it('Cat parses parent + new fields and exposes both methods', () => {
      const cat = Cat.fromJSON({name: 'Whiskers', age: 5, indoor: true})
      expect(cat.props).toEqual({name: 'Whiskers', age: 5, indoor: true})
      expect(cat.description).toBe('Whiskers, age 5')
      expect(cat.meow()).toBe('Whiskers says meow!')
    })

    it('Dog and Cat are both instanceof Animal but not each other', () => {
      const dog = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'})
      const cat = Cat.fromJSON({name: 'Whiskers', age: 5, indoor: true})

      expect(dog).toBeInstanceOf(Dog)
      expect(dog).toBeInstanceOf(Animal)
      expect(dog).not.toBeInstanceOf(Cat)

      expect(cat).toBeInstanceOf(Cat)
      expect(cat).toBeInstanceOf(Animal)
      expect(cat).not.toBeInstanceOf(Dog)
    })

    it('Dog rejects input missing the new field', () => {
      expect(() => Dog.fromJSON({name: 'Rex', age: 3} as any)).toThrow()
    })

    it('Cat rejects input missing the new field', () => {
      expect(() => Cat.fromJSON({name: 'Whiskers', age: 5} as any)).toThrow()
    })

    it('Dog and Cat schemas do not bleed into each other', () => {
      // A Dog payload is not a valid Cat (missing `indoor`, has stray `breed`).
      expect(() =>
        Cat.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'} as any),
      ).toThrow()
      // And vice versa.
      expect(() =>
        Dog.fromJSON({name: 'Whiskers', age: 5, indoor: true} as any),
      ).toThrow()
    })

    it('Animal still parses bare parent payloads (siblings do not affect parent)', () => {
      const a = Animal.fromJSON({name: 'Generic', age: 7})
      expect(a.props).toEqual({name: 'Generic', age: 7})
      expect(a).toBeInstanceOf(Animal)
      expect(a).not.toBeInstanceOf(Dog)
      expect(a).not.toBeInstanceOf(Cat)
    })

    it('JSON.stringify round-trips a Dog through fromJSON', () => {
      const dog = Dog.fromJSON({name: 'Rex', age: 3, breed: 'Labrador'})
      const json = JSON.stringify(dog)
      const restored = Dog.fromJSON(JSON.parse(json))
      expect(restored).toBeInstanceOf(Dog)
      expect(restored).toBeInstanceOf(Animal)
      expect(restored.props).toEqual(dog.props)
      expect(restored.bark()).toBe(dog.bark())
    })
  })

  describe('Multi-level extension', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email(),
    }) {
      get domain() {
        return this.props.split('@')[1]
      }
    }

    class GoogleEmail extends ValueObject.extends(Email, {
      id: 'GoogleEmail',
      schema: (prev) =>
        prev.refine((s) => /@(?:[\w-]+\.)*google\.com$/.test(s)),
    }) {}

    class GoogleWorkspaceEmail extends ValueObject.extends(GoogleEmail, {
      id: 'GoogleWorkspaceEmail',
      schema: (prev) => prev.refine((s) => s.endsWith('@workspace.google.com')),
    }) {}

    it('keeps the full instanceof chain through two levels of extension', () => {
      const w = GoogleWorkspaceEmail.fromJSON('alice@workspace.google.com')
      expect(w).toBeInstanceOf(GoogleWorkspaceEmail)
      expect(w).toBeInstanceOf(GoogleEmail)
      expect(w).toBeInstanceOf(Email)
      expect(w.domain).toBe('workspace.google.com')
    })

    it('each level enforces its own validation', () => {
      // Valid at all three levels.
      expect(() =>
        GoogleWorkspaceEmail.fromJSON('alice@workspace.google.com'),
      ).not.toThrow()
      // Valid at Email + GoogleEmail, fails at GoogleWorkspaceEmail.
      expect(() => GoogleWorkspaceEmail.fromJSON('alice@google.com')).toThrow()
      // Valid only at Email.
      expect(() => GoogleWorkspaceEmail.fromJSON('alice@yahoo.com')).toThrow()
    })
  })
})
