import {describe, it, expect, expectTypeOf} from 'vitest'
import {ValueObject} from '../src'
import z from 'zod'

describe('ValueObject', () => {

  describe('Primitive-backed value object', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email()
    }) {
    }

    it('should allow creating from JSON', () => {
      const email = Email.fromJSON('value@object.com')
      expect(email.props).toEqual('value@object.com')
      expect(email).toBeInstanceOf(Email)
      expect(JSON.stringify(email)).toEqual('"value@object.com"')
      expect(email.toJSON()).toEqual('value@object.com')
    })

    it('should not be referentially equal', () => {
      const email = 'value@object.com'
      const a = Email.fromJSON(email)
      const b = Email.fromJSON(email)
      expect(a).not.toBe(b)
      expect(a === b).toBe(false)
      expect(a == b).toBe(false)
    })

    it('Should return itself when passed into the schema', () => {
      const email = Email.fromJSON('value@object.com')
      const output = Email.fromJSON(Email.fromJSON(email))
      expect(email).toBe(output)
      expect(email === output).toBe(true)
    })

    /**
     * This is primarily to help reduce the burden of writing custom equality
     * checkers in tests. Most test frameworks will check that each value of an
     * object and the prototype match instead of strict equality.
     *
     * Adding bound functions to the prototype will cause this to fail.
     */
    it('should be equal according to vitests equality checker', () => {
      const email = 'value@object.com'
      const a = Email.fromJSON(email)
      const b = Email.fromJSON(email)
      expect(a).toEqual(b)
    })

    it('should respect paths in a schema (This is important for integration with zod-based form libraries)', () => {
      const schema = z.object({
        emails: z.array(Email.schema())
      })

      const {error} = schema.safeParse({emails: ['value@object.com', 'hi', null]})
      if (!error) {
        expect.fail('Expected an error but got none')
      }
      expect(error.format()).toMatchInlineSnapshot(`
        {
          "_errors": [],
          "emails": {
            "1": {
              "_errors": [
                "Invalid email address",
              ],
            },
            "2": {
              "_errors": [
                "Invalid input: expected string, received null",
              ],
            },
            "_errors": [],
          },
        }
      `)
    })


    it('should be chainable with zod optionals', () => {
      const schema = z.object({
        email: Email.schema().optional(),
      })

      expect(schema.parse({email: undefined})).toEqual({email: undefined})
    })

    it('Should pass type tests', () => {
      const email = Email.fromJSON('zod@zod.com')

      expectTypeOf(email.toJSON()).toEqualTypeOf<string>()
      expectTypeOf(email.props).toEqualTypeOf<string>()
      expectTypeOf(email).toEqualTypeOf<Email>()

      expectTypeOf<typeof Email.fromJSON>().toBeFunction()
      expectTypeOf<Parameters<typeof Email.fromJSON>[0]>().toEqualTypeOf<string | Email>()
      expectTypeOf<z.output<ReturnType<typeof Email.schema>>>().toEqualTypeOf<Email>()
      expectTypeOf<z.input<ReturnType<typeof Email.schema>>>().toEqualTypeOf<string | Email>()
    })
  })

  describe('Value object with multiple primitive properties', () => {
    class YearMonth extends ValueObject.define({
      id: 'YearMonth',
      schema: () => z.object({
        year: z.number(),
        month: z.number(),
      })
    }) {

      // static isoSchema() {
      //   return z.string().pipe(z.transform((s) => {
      //     const [year, month] = s.split('-').map(Number)
      //     return {
      //       year,
      //       month,
      //     }
      //   })).pipe(YearMonth.schemaPrimitive())
      // }

      // static fromISO(isoString: string) {
      //   return YearMonth.isoSchema().parse(isoString)
      // }
    }


    it('should allow creating from JSON', () => {
      const ym = YearMonth.fromJSON({year: 2023, month: 10})
      expect(ym.props).toEqual({year: 2023, month: 10})
      expect(ym).toBeInstanceOf(YearMonth)
      expect(JSON.stringify(ym)).toEqual('{"year":2023,"month":10}')
      expect(ym.toJSON()).toEqual({year: 2023, month: 10})
    })

    it('should not be referentially equal', () => {
      const ym = {year: 2023, month: 10}
      const a = YearMonth.fromJSON(ym)
      const b = YearMonth.fromJSON(ym)
      expect(a).not.toBe(b)
      expect(a === b).toBe(false)
      expect(a == b).toBe(false)
    })

    it('Should return itself when passed into the schema', () => {
      const ym = YearMonth.fromJSON({year: 2023, month: 10})
      const output = YearMonth.fromJSON(YearMonth.fromJSON(ym))
      expect(ym).toBe(output)
      expect(ym === output).toBe(true)
    })

    /**
     * This is primarily to help reduce the burden of writing custom equality
     * checkers in tests. Most test frameworks will check that each value of an
     * object and the prototype match instead of strict equality.
     *
     * Adding bound functions to the prototype will cause this to fail.
     */
    it('should be equal according to vitests equality checker', () => {
      const ym = {year: 2023, month: 10}
      const a = YearMonth.fromJSON(ym)
      const b = YearMonth.fromJSON(ym)
      expect(a).toEqual(b)
    })

    it('should respect paths in a schema (This is important for integration with zod-based form libraries)', () => {
      const schema = z.object({
        yearMonths: z.array(YearMonth.schema())
      })

      const {error} = schema.safeParse({yearMonths: [{year: 2023, month: 10}, {year: null, month: 13}]})
      if (!error) {
        expect.fail('Expected an error but got none')
      }
      expect(error.format()).toMatchInlineSnapshot(`
        {
          "_errors": [],
          "yearMonths": {
            "1": {
              "_errors": [],
              "year": {
                "_errors": [
                  "Invalid input: expected number, received null",
                ],
              },
            },
            "_errors": [],
          },
        }
      `)
    })

    it('should be chainable with zod optionals', () => {
      const schema = z.object({
        yearMonth: YearMonth.schema().optional(),
      })

      expect(schema.parse({yearMonth: undefined})).toEqual({yearMonth: undefined})
    })

    it('Should pass type tests', () => {
      const ym = YearMonth.fromJSON({year: 2023, month: 10})

      expectTypeOf(ym.toJSON()).toEqualTypeOf<{year: number, month: number}>()
      expectTypeOf(ym.props).toEqualTypeOf<{year: number, month: number}>()
      expectTypeOf(ym).toEqualTypeOf<YearMonth>()

      expectTypeOf<typeof YearMonth.fromJSON>().toBeFunction()
      expectTypeOf<Parameters<typeof YearMonth.fromJSON>[0]>().toEqualTypeOf<{year: number, month: number} | YearMonth>()
      expectTypeOf<z.output<ReturnType<typeof YearMonth.schema>>>().toEqualTypeOf<YearMonth>()
      expectTypeOf<z.input<ReturnType<typeof YearMonth.schema>>>().toEqualTypeOf<{year: number, month: number} | YearMonth>()
    })
  })


  describe('Nested value objects', () => {
    class Address extends ValueObject.define({
      id: 'Address',
      schema: () => z.object({
        street: z.string(),
        city: z.string(),
      })
    }) {
    }

    class User extends ValueObject.define({
      id: 'User',
      schema: () => z.object({
        email: z.string().email(),
        addresses: z.array(Address.schema()).optional(),
      })
    }) {
    }

    it('should allow creating from JSON', () => {
      const user = User.fromJSON({
        email: 'value@object.com',
        addresses: [
          {street: '123 Main St', city: 'Anytown'},
          {street: '456 Elm St', city: 'Othertown'},
        ],
      })

      expect(user.props).toEqual(
        {
          email: 'value@object.com',
          addresses: [
            Address.fromJSON({street: '123 Main St', city: 'Anytown'}),
            Address.fromJSON({street: '456 Elm St', city: 'Othertown'}),
          ],
        }
      )
    })

    it('should not be referentially equal', () => {
      const user = {
        email: 'value@object.com',
        addresses: [
          {street: '123 Main St', city: 'Anytown'},
        ]
      }
      const a = User.fromJSON(user)
      const b = User.fromJSON(user)
      expect(a).not.toBe(b)
      expect(a === b).toBe(false)
    })


    it('Should return itself when passed into the schema', () => {
      const user = User.fromJSON({
        email: 'value@object.com',
        addresses: [
          {street: '123 Main St', city: 'Anytown'},
        ]
      })
      const output = User.fromJSON(User.fromJSON(user))
      expect(user).toBe(output)
    })

    /**
     * This is primarily to help reduce the burden of writing custom equality
     * checkers in tests. Most test frameworks will check that each value of an
     * object and the prototype match instead of strict equality.
     *
     * Adding bound functions to the prototype will cause this to fail.
     */
    it('should be equal according to vitests equality checker', () => {
      const user = {
        email: 'value@object.com',
        addresses: [
          {street: '123 Main St', city: 'Anytown'},
        ]
      }

      const a = User.fromJSON(user)
      const b = User.fromJSON(user)
      expect(a).toEqual(b)
    })

    it('should respect paths in a schema (This is important for integration with zod-based form libraries)', () => {
      const schema = z.object({
        users: z.array(User.schema())
      })

      const {error} = schema.safeParse({
        users: [
          {email: 'value@object.com', addresses: [{street: '123 Main St', city: 'Anytown'}]},
          {email: 'invalid-email', addresses: [{street: '456 Elm St', city: 'Othertown'}]},
          {email: 'value@object.com', addresses: [{street: null, city: 'Sometown'}]},
        ]
      })

      if (!error) {
        expect.fail('Expected an error but got none')
      }
      expect(error.format()).toMatchInlineSnapshot(`
        {
          "_errors": [],
          "users": {
            "1": {
              "_errors": [],
              "email": {
                "_errors": [
                  "Invalid email address",
                ],
              },
            },
            "2": {
              "_errors": [],
              "addresses": {
                "0": {
                  "_errors": [],
                  "street": {
                    "_errors": [
                      "Invalid input: expected string, received null",
                    ],
                  },
                },
                "_errors": [],
              },
            },
            "_errors": [],
          },
        }
      `)
    })

    it('should be chainable with zod optionals', () => {
      const schema = z.object({
        user: User.schema().optional(),
      })

      expect(schema.parse({user: undefined})).toEqual({user: undefined})
    })

    it('Should pass type tests', () => {
      const user = User.fromJSON({
        email: 'value@object.com',
        addresses: [
          {street: '123 Main St', city: 'Anytown'},
        ]
      })

      expectTypeOf(user.toJSON()).toEqualTypeOf<{
        email: string,
        addresses?: {street: string, city: string}[]
      }>()

      expectTypeOf(user.props).toEqualTypeOf<{
        email: string,
        addresses?: Address[]
      }>()

      expectTypeOf(user).toEqualTypeOf<User>()

      type c = Parameters<typeof User.fromJSON>[0]

      expectTypeOf<typeof User.fromJSON>().toBeFunction()
      expectTypeOf<Parameters<typeof User.fromJSON>[0]>().toEqualTypeOf<{
        email: string,
        addresses?: (Address | {
          street: string;
          city: string;
        })[] | undefined;
      } | User>()
      expectTypeOf<z.output<ReturnType<typeof User.schema>>>().toEqualTypeOf
        <User>()
      expectTypeOf<z.input<ReturnType<typeof User.schema>>>().toEqualTypeOf<{
        email: string,
        addresses?: (Address | {
          street: string;
          city: string;
        })[] | undefined;
      } | User>()
    })
  })

  describe('Using a value object as a wrapper for a value object union', () => {
    class Dog extends ValueObject.define({
      id: 'Dog',
      schema: () => z.object({
        type: z.literal('dog'),
        woofs: z.boolean()
      })
    }) {
      get type() {
        return this.props.type
      }
    }

    class Cat extends ValueObject.define({
      id: 'Cat',
      schema: () => z.object({
        type: z.literal('cat'),
        sharpClaws: z.boolean()
      })
    }) {
      get type() {
        return this.props.type
      }
    }

    class Pet extends ValueObject.define({
      id: 'Pet',
      schema: () => z.union([Dog.schema(), Cat.schema()])
    }) {
      get hasClaws() {
        const pet = this.props
        if (pet.type === 'cat') {
          return pet.props.sharpClaws
        }
        return false
      }
    }

    it('should allow creating from JSON', () => {
      const pet = Pet.fromJSON({type: 'dog', woofs: true})
      expect(pet.props).toEqual(Dog.fromJSON({type: 'dog', woofs: true}))
      expect(pet).toBeInstanceOf(Pet)
      expect(JSON.stringify(pet)).toEqual('{"type":"dog","woofs":true}')
      expect(pet.toJSON()).toEqual({type: 'dog', woofs: true})
      expect(pet.hasClaws).toBe(false)
    })

    it('should not be referentially equal', () => {
      const pet = {type: 'dog' as const, woofs: true}
      const a = Pet.fromJSON(pet)
      const b = Pet.fromJSON(pet)
      expect(a).not.toBe(b)
      expect(a === b).toBe(false)
      expect(a == b).toBe(false)
    })

    it('Should return itself when passed into the schema', () => {
      const pet = Pet.fromJSON({type: 'dog', woofs: true})
      const output = Pet.fromJSON(Pet.fromJSON(pet))
      expect(pet).toBe(output)
      expect(pet === output).toBe(true)
    })

    /**
     * This is primarily to help reduce the burden of writing custom equality
     * checkers in tests. Most test frameworks will check that each value of an
     * object and the prototype match instead of strict equality.
     *
     * Adding bound functions to the prototype will cause this to fail.
     */
    it('should be equal according to vitests equality checker', () => {
      const pet = {type: 'dog' as const, woofs: true}
      const a = Pet.fromJSON(pet)
      const b = Pet.fromJSON(pet)
      expect(a).toEqual(b)
    })

    it('should respect paths in a schema (This is important for integration with zod-based form libraries)', () => {
      const schema = z.object({
        pets: z.array(Pet.schema())
      })

      const s = Dog.schemaPrimitive().or(Cat.schemaPrimitive())

      const {error} = schema.safeParse({
        pets: [
          {type: 'dog', woofs: true},
          {type: 'cat', sharpClaws: true},
          {type: 'dog', woofs: null},
        ]
      })
      if (!error) {
        expect.fail('Expected an error but got none')
      }
      /**
       * These errors are pretty unclear. I don't think this is a great pattern
       * for union types.
       */
      expect(error.format()).toMatchInlineSnapshot(`
        {
          "_errors": [],
          "sharpClaws": {
            "_errors": [
              "Invalid input: expected boolean, received undefined",
            ],
          },
          "type": {
            "_errors": [
              "Invalid input: expected \\"cat\\"",
            ],
          },
          "woofs": {
            "_errors": [
              "Invalid input: expected boolean, received null",
            ],
          },
        }
      `)

    })

  })

  describe('Using the internal ValueObject.defineUnion to create a union of value objects', () => {
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
        sharpClaws: z.boolean()
      })
    }) {}

    const Pets = ValueObject.defineUnion('type', () => ({
      cat: Cat,
      dog: Dog,
    }))

    it('should parse', () => {
      const pet = Pets.fromJSON({type: 'dog', woofs: true})
      expect(pet).toBeInstanceOf(Dog)
      expect(pet.props).toEqual({type: 'dog', woofs: true})
      expect(JSON.stringify(pet)).toEqual('{"type":"dog","woofs":true}')
      expect(pet.toJSON()).toEqual({type: 'dog', woofs: true})
      if (!Pets.isInstance('dog', pet)) {
        expect.fail('Expected pet to be an instance of Dog')
      }
      if (Pets.isInstance('cat', pet)) {
        expect.fail('Expected pet to not be an instance of Cat')
      }
      expect(Pets.schema().parse(pet.toJSON())).toEqual(pet)
    })

    it('should not be referentially equal', () => {
      const pet = {type: 'dog' as const, woofs: true}
      const a = Pets.fromJSON(pet)
      const b = Pets.fromJSON(pet)
      expect(a).not.toBe(b)
      expect(a === b).toBe(false)
      expect(a == b).toBe(false)
    })

    it('Should return itself when passed into the schema', () => {
      const pet = Pets.fromJSON({type: 'dog', woofs: true})
      const output = Pets.fromJSON(Pets.fromJSON(pet))
      expect(pet).toBe(output)
      expect(pet === output).toBe(true)
    })

    it('should be equal according to vitests equality checker', () => {
      const pet = {type: 'dog' as const, woofs: true}
      const a = Pets.fromJSON(pet)
      const b = Pets.fromJSON(pet)
      expect(a).toEqual(b)
    })

    it('should respect paths in a schema (This is important for integration with zod-based form libraries)', () => {
      const schema = z.object({
        pets: z.array(Pets.schema())
      })

      const {error} = schema.safeParse({
        pets: [
          {type: 'dog', woofs: true},
          {type: 'cat', sharpClaws: true},
          {type: 'dog', woofs: null},
          {type: 'spaghetti', sharpClaws: true},
        ]
      })
      if (!error) {
        expect.fail('Expected an error but got none')
      }
      expect(error.format()).toMatchInlineSnapshot(`
        {
          "_errors": [],
          "pets": {
            "2": {
              "_errors": [],
              "woofs": {
                "_errors": [
                  "Invalid input: expected boolean, received null",
                ],
              },
            },
            "3": {
              "_errors": [],
              "type": {
                "_errors": [
                  "Invalid input",
                ],
              },
            },
            "_errors": [],
          },
        }
      `)
    })

    it('should be chainable with zod optionals', () => {
      const schema = z.object({
        pet: Pets.schema().optional(),
      })

      expect(schema.parse({pet: undefined})).toEqual({pet: undefined})
    })


    it('Should pass type tests', () => {
      const pet = Pets.fromJSON({type: 'dog', woofs: true})

      expectTypeOf(pet.toJSON()).toEqualTypeOf<{type: 'dog', woofs: boolean} | {type: 'cat', sharpClaws: boolean}>()
      expectTypeOf(pet.props).toEqualTypeOf<{type: 'dog', woofs: boolean} | {type: 'cat', sharpClaws: boolean}>()
      expectTypeOf(pet).toEqualTypeOf<Dog | Cat>()

      expectTypeOf<typeof Pets.fromJSON>().toBeFunction()
      expectTypeOf<Parameters<typeof Pets.fromJSON>[0]>().toEqualTypeOf<{type: 'dog', woofs: boolean} | {type: 'cat', sharpClaws: boolean} | Dog | Cat>()
      expectTypeOf<z.output<ReturnType<typeof Pets.schema>>>().toEqualTypeOf<Dog | Cat>()
      expectTypeOf<z.input<ReturnType<typeof Pets.schema>>>().toEqualTypeOf<{type: 'dog', woofs: boolean} | {type: 'cat', sharpClaws: boolean} | Dog | Cat>()
    })
  })
})
