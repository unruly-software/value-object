<div align="center">
  <img src="https://github.com/unruly-software/value-object/blob/master/docs/logo.png" alt="@unruly-software/value-object" width="500" />
</div>

<div align="center">

[![Build Status](https://github.com/unruly-software/value-object/workflows/Build/badge.svg)](https://github.com/unruly-software/value-object/actions)
[![npm version](https://badge.fury.io/js/%40unruly-software%2Fvalue-object.svg)](https://badge.fury.io/js/%40unruly-software%2Fvalue-object)
[![Coverage Status](https://coveralls.io/repos/github/unruly-software/value-object/badge.svg?branch=master)](https://coveralls.io/github/unruly-software/value-object?branch=master)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js LTS](https://img.shields.io/node/v/@unruly-software/value-object.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)

</div>

A small TypeScript library for modelling [value objects](https://martinfowler.com/bliki/ValueObject.html) on top of [Zod](https://zod.dev/) schemas. Define a type once, get runtime validation, a real `class` you can attach methods to, and lossless `JSON.stringify` round-tripping — without writing boilerplate.

```typescript
class Email extends ValueObject.define({
  id: 'Email',
  schema: () => z.string().email(),
}) {
  get domain() {
    return this.props.split('@')[1]
  }
}

const email = Email.fromJSON('alice@example.com')
email.domain                // 'example.com'
JSON.stringify({ email })   // '{"email":"alice@example.com"}'
```

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Why This Design](#why-this-design)
- [Core Concepts](#core-concepts)
  - [Defining a value object](#defining-a-value-object)
  - [Custom JSON serialization](#custom-json-serialization)
  - [Composing value objects](#composing-value-objects)
  - [Structural equality](#structural-equality)
  - [Extending a value object](#extending-a-value-object)
  - [Discriminated unions](#discriminated-unions)
- [Schema Methods](#schema-methods)
- [Type Inference](#type-inference)
- [Comparison With Similar Libraries](#comparison-with-similar-libraries)
- [API Reference](#api-reference)
- [License](#license)

## Installation

```bash
npm install @unruly-software/value-object zod
# or
yarn add @unruly-software/value-object zod
# or
pnpm add @unruly-software/value-object zod
```

Zod v4 is the only peer dependency.

## Quick Start

```typescript
import { ValueObject } from '@unruly-software/value-object'
import { z } from 'zod'

class Email extends ValueObject.define({
  id: 'Email',
  schema: () => z.string().email(),
}) {}

// Parse and validate in one step
const email = Email.fromJSON('user@example.com')
email.props          // 'user@example.com'
email.toJSON()       // 'user@example.com'

// Invalid input throws a ZodError
Email.fromJSON('not-an-email') // throws

// Use the schema anywhere Zod is accepted
const userSchema = z.object({
  name: z.string(),
  email: Email.schema(), // accepts a string OR an existing Email instance
})

const user = userSchema.parse({ name: 'Alice', email: 'alice@example.com' })
user.email instanceof Email // true
```

## Why This Design

A **value object** is an object whose identity is defined entirely by its values rather than by reference. Two `Email` instances holding the same string are interchangeable; two `User` entities with the same id are not. Martin Fowler's [Value Object](https://martinfowler.com/bliki/ValueObject.html) bliki entry is the canonical short reference; the pattern is also a foundational building block in Domain-Driven Design.

This library exists because TypeScript on its own can't express "this string has been validated as an email." A `string` type tells you nothing about what's inside it, and `interface User { email: string }` is a comment, not a guarantee. The result is validation scattered across every layer that touches the data, and bugs that show up far from the boundary that should have rejected them.

The library is built around three deliberate choices:

**Parse, don't validate.** Following Alexis King's [essay of the same name](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), unvalidated data is parsed once at the boundary into a type that *cannot* exist unless it has been validated. From that point on, the type system carries the proof — there is no need to re-check inside business logic.

**Schemas, not decorators.** Validation lives inside a Zod schema rather than in property decorators. That means no `reflect-metadata`, no experimental compiler flags, full structural type inference, and you can reuse the schema anywhere Zod is accepted (`z.object`, `.parse`, form libraries, OpenAPI generators, tRPC, etc.).

**Real classes, not plain objects.** A schema produces a class you can `extends` and add methods, getters, and computed properties to — `email.domain`, `money.add(other)`, `address.formatted` — keeping behaviour next to the data it operates on. `instanceof` works, prototype chains are preserved, and `ValueObject.extends()` lets you derive a more refined subtype (e.g. `GoogleEmail extends Email`) without losing either.

**JSON serialization that just works.** Every instance has a `toJSON()` method, so `JSON.stringify(instance)` returns the right shape automatically — no `instanceToPlain`, no manual `serialize()` step, no decorator metadata to keep in sync. Combined with `fromJSON()` on the constructor, persisting and rehydrating value objects is a one-liner in each direction. Custom serialization (e.g. encoding `{ year, month }` as `"2024-03"`) is a single `toJSON` option on the definition.

## Core Concepts

### Defining a value object

```typescript
class UserId extends ValueObject.define({
  id: 'UserId',
  schema: () => z.string().uuid(),
}) {}

class Age extends ValueObject.define({
  id: 'Age',
  schema: () => z.number().int().min(0).max(150),
}) {}

class Address extends ValueObject.define({
  id: 'Address',
  schema: () => z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.string().default('US'),
  }),
}) {
  get formatted() {
    const { street, city, zipCode, country } = this.props
    return `${street}, ${city} ${zipCode}, ${country}`
  }
}

const address = Address.fromJSON({
  street: '123 Main St',
  city: 'Springfield',
  zipCode: '12345',
})

address.props.country // 'US' (from default)
address.formatted     // '123 Main St, Springfield 12345, US'
```

### Custom JSON serialization

Pass a `toJSON` option to control the wire format. The library handles `JSON.stringify` automatically — you don't need to call `toJSON()` yourself.

```typescript
class YearMonth extends ValueObject.define({
  id: 'YearMonth',
  schema: () =>
    z
      .object({ year: z.number().int(), month: z.number().int().min(1).max(12) })
      .or(
        z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .transform((str) => {
            const [year, month] = str.split('-').map(Number)
            return { year, month }
          }),
      ),
  toJSON: (v) => `${v.year}-${String(v.month).padStart(2, '0')}`,
}) {}

const ym = YearMonth.fromJSON('2024-03')
ym.props                   // { year: 2024, month: 3 }
ym.toJSON()                // '2024-03'
JSON.stringify({ ym })     // '{"ym":"2024-03"}'
```

Round-tripping is symmetric: `YearMonth.fromJSON(JSON.parse(JSON.stringify(ym)))` gives you back an equivalent instance.

### Composing value objects

Value object schemas compose like any other Zod schema. Nested values are automatically rehydrated into the right class.

```typescript
class Customer extends ValueObject.define({
  id: 'Customer',
  schema: () => z.object({
    id: UserId.schema(),
    email: Email.schema(),
    addresses: z.array(Address.schema()).optional(),
  }),
}) {}

const customer = Customer.fromJSON({
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'alice@example.com',
  addresses: [{ street: '123 Main St', city: 'Springfield', zipCode: '12345' }],
})

customer.props.id instanceof UserId             // true
customer.props.email instanceof Email           // true
customer.props.addresses?.[0] instanceof Address // true
```

### Structural equality

Every value object exposes an `equals(other)` method. Two instances are considered equal when they are of the same type and contain exactly the same data:

- Object keys are compared in any order, recursively.
- Arrays must have the same length and equal elements **in order**.
- Nested value objects are compared via their own `equals()` — overrides cascade all the way down.
- `Date` fields are compared by timestamp.

```typescript
const a = Address.fromJSON({ street: '123 Main St', city: 'Springfield', zipCode: '12345' })
const b = Address.fromJSON({ zipCode: '12345', city: 'Springfield', street: '123 Main St' })

a === b        // false — different references
a.equals(b)    // true  — same data, key order is irrelevant

const c = Address.fromJSON({ street: '123 Main St', city: 'Springfield', zipCode: '54321' })
a.equals(c)    // false
```

You can override `equals()` to express domain-specific identity — comparing entities by `id`, treating emails case-insensitively, ignoring metadata fields, etc. The override is honoured everywhere the value object appears, including when it is nested inside another value object's props.

```typescript
class User extends ValueObject.define({
  id: 'User',
  schema: () => z.object({
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

const id = '123e4567-e89b-12d3-a456-426614174000'
const a = User.fromJSON({ id, name: 'Alice',         updatedAt: '2024-01-01' })
const b = User.fromJSON({ id, name: 'Alice Renamed', updatedAt: '2024-12-31' })

a.equals(b) // true — User identity is the id, not the snapshot
```

### Extending a value object

`ValueObject.extends()` derives a new class from an existing one and layers a refined schema on top. The prototype chain is preserved, so `instanceof` and inherited methods continue to work, and the new schema receives the parent's schema as its first argument.

```typescript
class Animal extends ValueObject.define({
  id: 'Animal',
  schema: () => z.object({
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
  schema: (prev) => prev.and(z.object({ breed: z.string() })),
}) {
  bark() {
    return `${this.props.name} says woof!`
  }
}

class Cat extends ValueObject.extends(Animal, {
  id: 'Cat',
  schema: (prev) => prev.and(z.object({ indoor: z.boolean() })),
}) {
  meow() {
    return `${this.props.name} says meow!`
  }
}

const dog = Dog.fromJSON({ name: 'Rex', age: 3, breed: 'Labrador' })
dog instanceof Dog       // true
dog instanceof Animal    // true — inheritance is real
dog.description          // 'Rex, age 3' — inherited from Animal
dog.bark()               // 'Rex says woof!'

const cat = Cat.fromJSON({ name: 'Whiskers', age: 5, indoor: true })
cat instanceof Cat       // true
cat instanceof Animal    // true
cat.description          // 'Whiskers, age 5'
cat.meow()               // 'Whiskers says meow!'

Dog.fromJSON({ name: 'Rex', age: 3 } as any) // throws — missing `breed`
```

A type-level guard enforces that the extension's schema output is still assignable to the parent's. A transform that changes the shape (e.g. `string → number`) won't compile, so a `class X extends ValueObject.extends(...)` clause cannot accidentally break the Liskov contract.

### Discriminated unions

```typescript
class Circle extends ValueObject.define({
  id: 'Circle',
  schema: () => z.object({
    kind: z.literal('circle'),
    radius: z.number().positive(),
  }),
}) {
  get area() {
    return Math.PI * this.props.radius ** 2
  }
}

class Square extends ValueObject.define({
  id: 'Square',
  schema: () => z.object({
    kind: z.literal('square'),
    side: z.number().positive(),
  }),
}) {
  get area() {
    return this.props.side ** 2
  }
}

const Shape = ValueObject.defineUnion('kind', () => ({
  circle: Circle,
  square: Square,
}))

const shape = Shape.fromJSON({ kind: 'circle', radius: 4 })
shape instanceof Circle           // true
Shape.isInstance('circle', shape) // true (with type narrowing)

// Use it inside any other Zod schema
const drawingSchema = z.object({
  title: z.string(),
  shape: Shape.schema(),
})
```

The discriminator literal on each member is checked against the key at the type level — keying `Circle` under anything other than `'circle'` is a compile-time error.

## Schema Methods

Each value object exposes three Zod schemas for different boundaries.

| Method               | Accepts                  | Returns                | Use for                                   |
| -------------------- | ------------------------ | ---------------------- | ----------------------------------------- |
| `schema()`           | primitive **or** instance | instance               | Most boundaries — the flexible default    |
| `schemaPrimitive()`  | primitive only           | instance               | Forcing a fresh parse from raw input      |
| `schemaRaw()`        | primitive only           | primitive (validated)  | Validation without wrapping (e.g. forms)  |

```typescript
// schema() — accepts both, returns an instance
Email.schema().parse('a@b.com')              // Email
Email.schema().parse(existingEmail)          // Email (the same instance)

// schemaPrimitive() — only the raw form
Email.schemaPrimitive().parse('a@b.com')     // Email
Email.schemaPrimitive().parse(existingEmail) // throws

// schemaRaw() — validate but don't wrap
Email.schemaRaw().parse('a@b.com')           // 'a@b.com' (string)
```

## Type Inference

```typescript
class Money extends ValueObject.define({
  id: 'Money',
  schema: () => z.object({
    amount: z.number(),
    currency: z.enum(['USD', 'EUR', 'GBP']),
  }),
  toJSON: (v) => `${v.amount} ${v.currency}`,
}) {}

type MoneyProps = ValueObject.inferProps<typeof Money>
// { amount: number; currency: 'USD' | 'EUR' | 'GBP' }

type MoneyJSON  = ValueObject.inferJSON<typeof Money>
// string (from the custom toJSON)

type MoneyInput = ValueObject.inferInput<typeof Money>
// { amount: number; currency: 'USD' | 'EUR' | 'GBP' } | Money
```

All three helpers accept either the constructor (`typeof Money`) or an instance type (`Money`).

## Comparison With Similar Libraries

This library sits in the small intersection of "schema validation" and "class-based domain modelling." A few related options, and how they differ:

| Library                                | Style                       | Class instances | Inheritance / refinement              | `JSON.stringify` round-trip          |
| -------------------------------------- | --------------------------- | --------------- | ------------------------------------- | ------------------------------------ |
| **@unruly-software/value-object**      | Class on top of Zod         | Yes             | `extends()` preserves prototype chain | Built-in via `toJSON()`              |
| [zod-class](https://github.com/sam-goodwin/zod-class) | Class on top of Zod         | Yes             | `.extend({...})` to add fields        | No documented `toJSON` hook          |
| [Effect Schema](https://effect.website/docs/schema/classes/) | Schema-first with class API | Yes             | `Schema.Class` with getters/methods   | Uses explicit `encode` / `decode`    |
| [class-validator](https://github.com/typestack/class-validator) + [class-transformer](https://github.com/typestack/class-transformer) | Decorators on classes       | Yes             | Decorators inherited via `extends`    | Requires `instanceToPlain` / `plainToInstance` |
| [Valibot](https://valibot.dev)         | Functional, tree-shakable   | No              | n/a — plain objects                   | Plain object out, no methods         |
| [io-ts](https://github.com/gcanti/io-ts) | Functional codecs (`fp-ts`) | No              | n/a — combinators only                | Plain object out, no methods         |
| [runtypes](https://github.com/runtypes/runtypes) | Functional combinators      | No              | n/a — `.withConstraint`, `.withBrand` | Plain object out, no methods         |
| [type-fest `Tagged`](https://github.com/sindresorhus/type-fest) | Type-level brand only       | No              | n/a — types only                      | Trivial — value is the primitive     |

A few notes on where the trade-offs sit:

- **Functional codec libraries** (Valibot, io-ts, runtypes) are excellent for pure validation but produce plain objects. There is nowhere natural to attach `email.domain`, `money.add()`, or `address.formatted` — that behaviour ends up in free functions, away from the data.
- **`type-fest`-style branding** is the lightest possible option but provides no runtime validation; you're responsible for parsing the value into the branded type yourself.
- **`class-validator` / `class-transformer`** is the established decorator-based approach. It supports inheritance and rich validation, but it depends on `reflect-metadata`, requires `experimentalDecorators`, and round-tripping through JSON is a two-step process: `instanceToPlain` before `JSON.stringify` and `plainToInstance` after `JSON.parse`.
- **`zod-class`** is the closest direct comparison: it also wraps Zod in a class with `.extend(...)` for adding fields. It is missing a few key features: no custom `toJSON` option, no separate schema for primitive input, and the `.extend()` method creates a new class that doesn't preserve the prototype chain (so `instanceof` checks and inherited methods don't work).
- **Effect Schema** has a powerful `Schema.Class` API and integrates with the rest of the Effect ecosystem (equality, hashing, etc.). It uses explicit encode/decode transformations for serialization rather than the implicit `toJSON()` convention, and brings the Effect runtime as a dependency.

Pick this library if you want the ergonomics of plain TypeScript classes, validated by Zod, that survive `JSON.stringify` and `JSON.parse` without any extra ceremony — and you don't want to take on a larger framework to get it.

## API Reference

### `ValueObject.define(options)`

Creates a value object class.

| Option        | Type                            | Description                                            |
| ------------- | ------------------------------- | ------------------------------------------------------ |
| `id`          | `string`                        | Unique identifier for the value object type            |
| `schema`      | `() => ZodSchema`               | Function returning the Zod schema for validation       |
| `toJSON?`     | `(value) => unknown`            | Optional custom JSON serializer                        |

### `ValueObject.extends(parent, options)`

Derives a new value object class from `parent`. The returned class extends `parent` directly, so `instanceof` and inherited methods work.

| Option        | Type                                       | Description                                         |
| ------------- | ------------------------------------------ | --------------------------------------------------- |
| `id`          | `string`                                   | Unique identifier for the new type                  |
| `schema`      | `(parentSchema) => ZodSchema`              | Builds the new schema on top of the parent's schema |
| `toJSON?`     | `(value) => unknown`                       | Optional override; defaults to the parent's `toJSON` |

The schema's output type must remain assignable to the parent's output type, or the result is a non-constructable error sentinel that fails to compile when used with `extends`.

### `ValueObject.defineUnion(discriminator, members)`

Creates a discriminated union of value objects.

| Parameter       | Type                                       | Description                                        |
| --------------- | ------------------------------------------ | -------------------------------------------------- |
| `discriminator` | `string`                                   | Field name used to distinguish members             |
| `members`       | `() => Record<string, ValueObjectClass>`   | Map of discriminator literal → member class        |

Returns an object with `fromJSON()`, `schema()`, and `isInstance()` methods.

### Instance members

| Member            | Description                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| `props`           | The validated, readonly data                                                      |
| `toJSON()`        | JSON-compatible representation (respects custom `toJSON` option)                  |
| `equals(other)`   | Structural equality with deep, key-order-independent comparison; override-friendly |

### Static members

| Member               | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `fromJSON(input)`    | Parse raw input (or accept an existing instance) and validate     |
| `schema()`           | Zod schema accepting primitive **or** instance, returning instance |
| `schemaPrimitive()`  | Zod schema accepting only primitive input, returning instance     |
| `schemaRaw()`        | The raw underlying Zod schema (no instance wrapping)              |

### Type helpers

| Helper                          | Resolves to                                            |
| ------------------------------- | ------------------------------------------------------ |
| `ValueObject.inferProps<T>`     | The validated `props` shape                            |
| `ValueObject.inferJSON<T>`      | The return type of `toJSON()`                          |
| `ValueObject.inferInput<T>`     | The accepted input: schema input **or** an instance    |

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.
