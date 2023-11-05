import { describe, it, expect } from 'vitest'
import { ValidationAggregator } from '../src'

const addError = (
  aggregator: ValidationAggregator,
  error: Error,
  path: string[],
) => {
  const nestedAggregator = path.reduce(
    (aggregator, path) => aggregator.withPath(path),
    aggregator,
  )
  return nestedAggregator.addError(error)
}

describe(ValidationAggregator.name, () => {
  it('should aggregate errors from root', () => {
    const agg = ValidationAggregator.create()

    addError(agg, new Error('error 1'), [])

    expect(agg.throwAggregate).toThrowErrorMatchingInlineSnapshot(
      '"Validation Error: error 1"',
    )
  })

  it('should aggregate errors from root paths', () => {
    const agg = ValidationAggregator.create()

    addError(agg, new Error('error 1'), ['foo'])
    addError(agg, new Error('error 2'), ['bar'])

    expect(agg.error!.info).toMatchInlineSnapshot(`
      {
        "paths": {
          "bar": "error 2",
          "foo": "error 1",
        },
        "root": undefined,
      }
    `)
    expect(agg.error!.errors).toMatchInlineSnapshot(`
      {
        "paths": {
          "bar": [
            [Error: error 2],
          ],
          "foo": [
            [Error: error 1],
          ],
        },
        "root": [],
      }
    `)
    expect(agg.throwAggregate).toThrowErrorMatchingInlineSnapshot(
      `
      "Validation Error: 
        foo: error 1
        bar: error 2"
    `,
    )
  })

  it('should aggregate errors from nested paths', () => {
    const agg = ValidationAggregator.create()

    agg.addError(new Error('is invalid'))
    addError(agg, new Error('error 1'), ['foo', 'bar'])
    addError(agg, new Error('error 2'), ['foo', 'baz'])

    expect(agg.error!.info).toMatchInlineSnapshot(`
      {
        "paths": {
          "foo.bar": "error 1",
          "foo.baz": "error 2",
        },
        "root": "is invalid",
      }
    `)
    expect(agg.error!.errors).toMatchInlineSnapshot(`
      {
        "paths": {
          "foo.bar": [
            [Error: error 1],
          ],
          "foo.baz": [
            [Error: error 2],
          ],
        },
        "root": [
          [Error: is invalid],
        ],
      }
    `)
    expect(agg.throwAggregate).toThrowErrorMatchingInlineSnapshot(
      `
      "Validation Error: is invalid
        foo.bar: error 1
        foo.baz: error 2"
    `,
    )
  })

  it('should aggregate errors from nested paths with same name', () => {
    const agg = ValidationAggregator.create()

    agg.addError(new Error('is invalid'))
    addError(agg, new Error('error 1'), ['foo', 'bar'])
    addError(agg, new Error('error 2'), ['foo', 'bar'])

    expect(agg.error!.info).toMatchInlineSnapshot(`
      {
        "paths": {
          "foo.bar": "error 1",
        },
        "root": "is invalid",
      }
    `)
    expect(agg.error!.errors).toMatchInlineSnapshot(`
      {
        "paths": {
          "foo.bar": [
            [Error: error 1],
            [Error: error 2],
          ],
        },
        "root": [
          [Error: is invalid],
        ],
      }
    `)
    expect(agg.throwAggregate).toThrowErrorMatchingInlineSnapshot(
      `
      "Validation Error: is invalid
        foo.bar: error 1
        foo.bar: error 2"
    `,
    )
  })
})
