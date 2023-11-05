import { describe, it, expect } from 'vitest'
import { ValueObject } from '../src'

describe(ValueObject.name, () => {
  class Email extends ValueObject.define({
    parse: (value, errs) => {
      if (typeof value !== 'string') {
        return errs.addError('must be a string')
      }
      if (!value) {
        errs.addError('must not be empty')
      }
      if (!value.includes('@')) {
        // Intentionally not returned to allow testing multiple errors
        errs.addError('must contain an @ symbol')
      }

      return value
    },
  }) {}

  describe('Email (string value object) (Validates using errs.fail()/errs.addError())', () => {
    it('should allow each of the validation errors to throw an error', () => {
      expect(() => Email.create('')).toThrowErrorMatchingInlineSnapshot(
        '"Validation Error: must not be empty, must contain an @ symbol"',
      )

      expect(() => Email.fromJSON(1)).toThrowErrorMatchingInlineSnapshot(
        '"Validation Error: must be a string"',
      )

      expect(() => Email.create('james@james.com')).not.toThrow()
      const email = Email.create('james@james.com')
      expect(email).toBeInstanceOf(Email)
      expect(email.getValue()).toMatchInlineSnapshot('"james@james.com"')
      expect(email.serializer().asJSON()).toMatchInlineSnapshot(
        '"james@james.com"',
      )
    })
  })

  describe('Emails (value object list) (Validates using raw errors)', () => {
    class Emails extends ValueObject.define({
      parse: (value, errs) => {
        if (!value || typeof value !== 'object' || !('emails' in value)) {
          throw errs.fail('no')
        }
        if (!Array.isArray(value.emails)) {
          throw new Error('Must be an array')
        }
        return {
          emails: value.emails.map((v, index) =>
            Email.fromJSON(v, errs.withPath('emails', index)),
          ),
        }
      },
    }) {}

    it('should allow each of the validation errors to throw an error', () => {
      expect(() =>
        Emails.create({
          emails: ['invalid', 'valid@valid.com', undefined!],
        }),
      ).toThrowErrorMatchingInlineSnapshot(
        `
        "Validation Error: 
          emails.0: must contain an @ symbol
          emails.2: must be a string"
      `,
      )
    })
  })
})
