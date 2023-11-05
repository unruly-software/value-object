import { describe, it, expect } from 'vitest'
import { ValueObject } from '../src'

class Email extends ValueObject.define({
  parse: (value, errs) => {
    if (typeof value !== 'string') {
      return errs.addError('must be a string')
    }
    if (!value.includes('@')) {
      return errs.addError('must contain an @')
    }
    return value
  },
}) {}

class Address extends ValueObject.define({
  parse: (value, errs) => {
    if (!value || typeof value !== 'object') {
      return errs.fail('must be an object')
    }

    if (!('street' in value) || typeof value.street !== 'string') {
      return errs.fail('must have a street')
    }

    if (!('city' in value) || typeof value.city !== 'string') {
      return errs.fail('must have a city')
    }

    return {
      street: value.street,
      city: value.city,
    }
  },
}) {}

class User extends ValueObject.define({
  parse: (value, errs) => {
    if (!value || typeof value !== 'object') {
      return errs.addError('must be an object')
    }

    return {
      email:
        'email' in value && value.email
          ? Email.fromJSON(value.email)
          : undefined,
      addresses:
        'addresses' in value && Array.isArray(value.addresses)
          ? value.addresses.map((addr) => Address.fromJSON(addr))
          : undefined,
    }
  },
}) {}
describe('Serializer', () => {
  it('should deserialize simple objects', async () => {
    const data = Object.freeze({
      email: 'hi@there',
    })
    const user = User.fromJSON(data)

    expect(user.toJSON()).toStrictEqual(user.asJSON())
    expect(user.serializer().asJSON()).toStrictEqual(user.asJSON())

    expect(user.asJSON()).toMatchInlineSnapshot(`
      {
        "addresses": undefined,
        "email": "hi@there",
      }
    `)
  })

  it('should deserialize nested objects', async () => {
    const user = User.create({
      addresses: [
        {
          street: '123 main',
          city: 'New York',
        },
      ],
    })
    user.value.addresses!.forEach((addr) =>
      expect(addr).toBeInstanceOf(Address),
    )

    expect(user.toJSON()).toStrictEqual(user.asJSON())
    expect(user.serializer().asJSON()).toStrictEqual(user.asJSON())

    expect(user.toJSON()).toMatchInlineSnapshot(`
      {
        "addresses": [
          {
            "city": "New York",
            "street": "123 main",
          },
        ],
        "email": undefined,
      }
    `)
  })
})
