//import { describe, it, expect } from 'vitest'
//import * as z from 'zod'
//import { ValidationAggregator, ValueObject } from '../src'
//import { zodResolver, zodValueObjectParser } from '../src/zod'

//describe('it works', () => {
//  it('should validate and serialize nested raw objects', () => {
//    class User extends ValueObject.define({
//      parse: zodResolver(
//        z.object({
//          email: z.string(),
//          addresses: z.array(
//            z.object({
//              street: z.string(),
//              city: z.string(),
//            }),
//          ),
//        }),
//      ),
//    }) {}

//    const user = User.create({
//      email: 'Hi',
//      addresses: [
//        {
//          city: '123',
//          street: '456',
//        },
//      ],
//    })

//    expect(user.asJSON()).toMatchInlineSnapshot(`
//      {
//        "addresses": [
//          {
//            "city": "123",
//            "street": "456",
//          },
//        ],
//        "email": "Hi",
//      }
//    `)
//  })

//  describe('given a nested schema', () => {
//    class Address extends ValueObject.define({
//      parse: zodResolver(
//        z.object({
//          street: z.string(),
//          city: z.string(),
//        }),
//      ),
//    }) {}

//    class User extends ValueObject.define({
//      parse: zodResolver(
//        z.object({
//          email: z.string(),
//          addresses: z.array(zodValueObjectParser(Address)),
//        }),
//      ),
//    }) {}

//    it('should validate and serialize nested raw objects', () => {
//      const user = User.create({
//        email: 'Hi',
//        addresses: [
//          {
//            city: '123',
//            street: '456',
//          },
//        ],
//      })

//      user.value.addresses.forEach((addr) =>
//        expect(addr).toBeInstanceOf(Address),
//      )

//      expect(user.asJSON()).toMatchInlineSnapshot(`
//        {
//          "addresses": [
//            {
//              "city": "123",
//              "street": "456",
//            },
//          ],
//          "email": "Hi",
//        }
//    `)
//    })

//    it('should parse undefined safely', () => {
//      const aggregator = ValidationAggregator.create()
//      User.parser().fromJSON(undefined, aggregator)

//      expect(aggregator.error?.info).toMatchInlineSnapshot(`
//        {
//          "paths": {},
//          "root": "Required",
//        }
//      `)
//    })

//    it('should parse angrily', () => {
//      expect(() =>
//        User.parser().fromJSON(undefined),
//      ).toThrowErrorMatchingInlineSnapshot('"Validation Error: Required"')
//    })

//    it('should parse validation errors in nested value objects', () => {
//      expect(() =>
//        User.parser().create({
//          //@ts-expect-error
//          email: 1,
//          // @ts-expect-error
//          addresses: [{ street: 1, city: 1 }],
//        }),
//      ).toThrowErrorMatchingInlineSnapshot(`
//        "Validation Error: 
//          email: Expected string, received number"
//      `)
//    })
//  })
//})
