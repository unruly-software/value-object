/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it } from 'vitest'
import { Parser, ValueObject, AggregatedValidationError } from '../src'

describe.skip(Parser.name, () => {
  it('Email should pass type tests', () => {
    class Email extends ValueObject.define({
      parse: (value) => value as string,
    }) {}

    // Should allow creating from JSON (Reads type of constructor parameter)
    Email.create('hi')
    // Should allow creating from the instance itself
    Email.create(new Email('hi'))
    // @ts-expect-error Should not accept invalid types for.create
    Email.create(1)
  })

  class StringValue extends ValueObject.define({
    parse: (value) => value as 'NSW' | 'ACT',
  }) {}
  it('Strings should pass type tests', () => {
    // Should allow creating from JSON (Reads type of constructor parameter)
    StringValue.create('NSW')
    // Should allow creating from the instance itself
    StringValue.create(new StringValue('NSW'))
    // @ts-expect-error Should not accept invalid types for.create
    StringValue.create(1)
  })

  it('Nested objects should pass type tests', () => {
    class Child extends ValueObject.define({
      parse: () => 'Some String',
    }) {}
    class Parent extends ValueObject.define({
      parse: (value) => {
        return {
          child: Child.create('Random'),
        }
      },
    }) {}
    // Should allow creating from JSON (Reads type of constructor parameter)
    Parent.create({ child: 'Random' })
    // Should allow creating from the parent instance itself
    Parent.create(new Parent({} as any))
    // Should allow creating from the child instance itself
    Parent.create({
      child: new Child('Value'),
    })
    // Should allow reparsing from the serialized value
    Parent.create(Parent.create({ child: 'Value' }).serializer().asJSON())
    // @ts-expect-error Should not allow creating given invalid primitive
    Parent.create({ child: 3 })
    // @ts-expect-error Should not accept invalid types for.create
    Parent.create(1)
    // @ts-expect-error Should fail given invalid primitive
    Parent.create({ child: undefined })
  })

  it('Arrays should pass type tests', () => {
    class Child extends ValueObject.define({
      parse: () => 'Some String',
    }) {}

    class Parent extends ValueObject.define({
      parse: (value) => {
        return {
          children: [Child.create('Random')],
        }
      },
    }) {}

    // Should allow creating from JSON (Reads type of constructor parameter)
    Parent.create({ children: [] })

    // Should allow creating from JSON (Reads type of constructor parameter)
    Parent.create({ children: ['A', 'B'] })

    // Should allow creating from JSON with multiple valid types in array
    Parent.create({ children: ['A', null! as Child] })

    // Should allow creating from the parent instance itself
    Parent.create(new Parent({} as any))

    // Should allow creating from the child instance itself
    Parent.create({
      children: [new Child('Value')],
    })

    // Should allow reparsing from the serialized value
    Parent.create(Parent.create({ children: [] }).serializer().asJSON())

    //@ts-expect-error Should not allow creating given invalid primitive
    Parent.create({ children: 3 })

    // @ts-expect-error Should not accept invalid types for.create
    Parent.create({ children: [3] })

    // @ts-expect-error Should fail given invalid primitive
    Parent.create({ children: undefined })
  })

  it('Deeply nested children', () => {
    class C extends ValueObject.define({
      parse: () => ({
        value: null! as 'VALUE' | undefined,
      }),
    }) {}

    class B extends ValueObject.define({
      parse: () => ({
        nested: null! as C | undefined,
      }),
    }) {}

    class A extends ValueObject.define({
      parse: (v) => ({
        deeply: null! as B | undefined,
      }),
    }) {}

    // Should allow creating from JSON (Reads type of constructor parameter)
    A.create({ deeply: { nested: { value: 'VALUE' } } })

    // Should allow creating partials
    A.create({ deeply: undefined })
    A.create({ deeply: { nested: undefined } })

    // Should allow creating from the parent instance itself
    A.create(new A({} as any))

    // Should allow creating from the child instances themselves
    A.create({
      deeply: B.create({
        nested: C.create({ value: 'VALUE' }),
      }),
    })

    // @ts-expect-error Should map through as undefined
    const a: 'VALUE' = (null! as A).serializer().asJSON()?.deeply?.nested?.value

    // @ts-expect-error Should expect the value to be maybe defined
    const b: undefined = (null! as A).serializer().asJSON()?.deeply
      ?.nested?.value

    // Should map through as undefined
    const c: 'VALUE' | undefined = (null! as A).serializer().asJSON()?.deeply
      ?.nested?.value

    A.create({ deeply: {} })
    A.create({})
  })

  it('Array children', () => {
    class Child extends ValueObject.define({
      parse: () => ({
        v: null! as 'VALUE' | undefined,
      }),
    }) {}

    class Parent extends ValueObject.define({
      parse: (v) => null! as Child[],
    }) {}

    // Should allow creating from the parent instance itself
    Parent.create(new Parent({} as any))

    Parent.create([])
    Parent.create([{ v: 'VALUE' }])
    Parent.create([{}])
    Parent.create([{ v: 'VALUE' }, Child.create({})])
  })

  it('Parser returns validation errors', () => {
    class Child extends ValueObject.define({
      parse: () => ({ value: 'string' }),
    }) {}

    class Parent extends ValueObject.define({
      parse: (value, errs) => {
        return {
          emails: ['a', 'b'].map((v, index) =>
            Child.fromJSON(v, errs.withPath('emails', index)),
          ),
        }
      },
    }) {}

    // Should not include the error type from "fromJSON"
    Parent.create({ emails: [{ value: 'string' }] })

    // @ts-ignore Should not include the error type from "fromJSON"
    Parent.create({ emails: [null! as AggregatedValidationError] })

    // Should allow empty
    Parent.create({ emails: [] })

    // @ts-expect-error Should not allow empty object
    Parent.create({})
  })
})
