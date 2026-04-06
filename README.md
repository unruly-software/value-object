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

A TypeScript library for creating type-safe value objects, DTOs or entities with
[Zod](https://zod.dev/) schema validation. Build robust domain models with
compile-time type safety, runtime validation, and seamless JSON serialization.

This library is the logical evolution of the [Parse, don't
validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
philosophy. Instead of validating raw data and passing that data around, we
nominally type it to show the data is guaranteed to be valid.

If you ever wondered whether the "email: string" in your interfaces is actually
a valid email this is the library for you.

## Features

- **Complete Zod support**: Use any Zod schema to define the properties of your value objects. You can use `ValueObject.schema()` to integrate the value object with library of your choice.
- **1 Peer Dependency**: Only peer dependency on Zod (which you're probably already using)
- **Type-Safe Value Objects**: Leverage TypeScript's type system with automatic type inference from Zod schemas
- **Runtime Validation**: Built on Zod for robust schema validation and transformation
- **Discriminated Unions**: Create type-safe unions of value objects with automatic type narrowing
- **JSON Serialization**: Automatic JSON serialization with custom transformation and typed support
- **Nested Value Objects**: Compose complex domain models from simple value objects
- **100% Typesafe**: All operations are fully typed with no `any` or type assertions required

## Installation

```bash
# npm
npm install @unruly-software/value-object zod

# yarn
yarn add @unruly-software/value-object zod

# pnpm
pnpm add @unruly-software/value-object zod
```

## Quick Start

```typescript
import { ValueObject } from '@unruly-software/value-object'
import { z } from 'zod'

// 1. Define a simple value object for email validation
class Email extends ValueObject.define({
  id: 'Email',
  schema: () => z.string().email()
}) {}

// 2. Create and validate instances
const email = Email.fromJSON('user@example.com')
console.log(email.props) // 'user@example.com'
console.log(email.toJSON()) // 'user@example.com'

// 3. Automatic validation
try {
  Email.fromJSON('invalid-email') // Throws ZodError
} catch (error) {
  console.log('Validation failed!')
}

// 4. Use in Zod schemas for forms and APIs
const userSchema = z.object({
  email: Email.schema(), // Accepts both strings and Email instances
  name: z.string()
})

const user = userSchema.parse({
  email: 'user@example.com', // Automatically creates Email instance
  name: 'John Doe'
})
console.log(user.email instanceof Email) // true
```

## Examples

### Basic Value Objects

```typescript
// Simple string-based value object
class UserId extends ValueObject.define({
  id: 'UserId',
  schema: () => z.string().uuid()
}) {}

// Number-based value object with validation
class Age extends ValueObject.define({
  id: 'Age',
  schema: () => z.number().int().min(0).max(150)
}) {}

const userId = UserId.fromJSON('123e4567-e89b-12d3-a456-426614174000')
const age = Age.fromJSON(25)
```

### Object-Based Value Objects

```typescript
// Complex value object with multiple properties
class Address extends ValueObject.define({
  id: 'Address',
  schema: () => z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.string().default('US')
  })
}) {}

const address = Address.fromJSON({
  street: '123 Main St',
  city: 'Anytown',
  zipCode: '12345'
})

console.log(address.props.country) // 'US' (from default)
console.log(address.toJSON()) // Full address object
```

### Custom JSON Serialization

```typescript
// Value object with custom serialization format
class YearMonth extends ValueObject.define({
  id: 'YearMonth',
  schema: () => z.object({
    year: z.number().int().min(1900),
    month: z.number().int().min(1).max(12)
  }).or(z.string().regex(/^\d{4}-\d{2}$/).transform(str => {
    const [year, month] = str.split('-').map(Number)
    return { year, month }
  })),
  toJSON: (value) => `${value.year}-${value.month.toString().padStart(2, '0')}`
}) {}

// Can create from object or string
const ym1 = YearMonth.fromJSON({ year: 2024, month: 3 })
const ym2 = YearMonth.fromJSON('2024-03')

console.log(ym1.toJSON()) // '2024-03'
console.log(ym2.toJSON()) // '2024-03'
console.log(ym1.props) // { year: 2024, month: 3 }
```

### Nested Value Objects

```typescript
class Customer extends ValueObject.define({
  id: 'Customer',
  schema: () => z.object({
    id: UserId.schema(),
    email: Email.schema(),
    addresses: z.array(Address.schema()).optional()
  })
}) {}

// Seamlessly compose value objects
const customer = Customer.fromJSON({
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'customer@example.com',
  addresses: [{
    street: '123 Main St',
    city: 'Anytown',
    zipCode: '12345'
  }]
})

// All nested objects are automatically converted to value objects
console.log(customer.props.id instanceof UserId) // true
console.log(customer.props.email instanceof Email) // true
console.log(customer.props.addresses?.[0] instanceof Address) // true
```

### Value Object Unions

```typescript
// Individual value objects with discriminator
class Dog extends ValueObject.define({
  id: 'Dog',
  schema: () => z.object({
    type: z.literal('dog'),
    breed: z.string(),
    woofs: z.boolean()
  })
}) {}

class Cat extends ValueObject.define({
  id: 'Cat',
  schema: () => z.object({
    type: z.literal('cat'),
    breed: z.string(),
    purrs: z.boolean()
  })
}) {}

// Create a discriminated union
const Pet = ValueObject.defineUnion('type', () => ({
  dog: Dog,
  cat: Cat
}))

// Type-safe parsing and narrowing
const myPet = Pet.fromJSON({
  type: 'dog',
  breed: 'Golden Retriever',
  woofs: true
})

console.log(myPet instanceof Dog) // true
console.log(Pet.isInstance('dog', myPet)) // true
console.log(Pet.isInstance('cat', myPet)) // false

// Use in schemas for automatic type narrowing
const petOwnerSchema = z.object({
  name: z.string(),
  pet: Pet.schema()
})
```

## Type Access and Inference

ValueObject provides utility types to extract TypeScript types from your value objects:

```typescript
class Money extends ValueObject.define({
  id: 'Money',
  schema: () => z.object({
    amount: z.number(),
    currency: z.enum(['USD', 'EUR', 'GBP'])
  }),
  toJSON: (value) => `${value.amount} ${value.currency}`
}) {}

// Extract types from value objects
type MoneyProps = ValueObject.inferProps<Money>        // { amount: number, currency: 'USD' | 'EUR' | 'GBP' }
type MoneyJSON = ValueObject.inferJSON<Money>          // string (due to custom toJSON)
type MoneyInput = ValueObject.inferInput<Money>        // { amount: number, currency: 'USD' | 'EUR' | 'GBP' } | Money

// Also works with constructor types
type MoneyProps2 = ValueObject.inferProps<typeof Money>  // Same as above
type MoneyJSON2 = ValueObject.inferJSON<typeof Money>    // Same as above
type MoneyInput2 = ValueObject.inferInput<typeof Money>  // Same as above

// Use in function signatures
function processPayment(amount: Money, balance: Money): Money {
  // ...whatever processing logic
  if (balance.has(amount)) {
    return balance.minus(amount)
  }
}
```

## Schema Methods

Each value object provides three different schema access methods for different use cases:

### `schema()` - Union Schema (Most Common)

```typescript
const emailSchema = Email.schema()

// Accepts both primitives and existing instances
emailSchema.parse('user@example.com') // Creates new Email instance
emailSchema.parse(existingEmail)      // Returns the same instance

// Perfect for API boundaries and form validation
const apiSchema = z.object({
  userEmail: Email.schema(), // Flexible input, guaranteed Email output
  userId: UserId.schema()
})
```

### `schemaPrimitive()` - Transform Only

```typescript
const emailPrimitiveSchema = Email.schemaPrimitive()

// Only accepts primitive values, always creates new instances
emailPrimitiveSchema.parse('user@example.com') // ✅ Creates Email
emailPrimitiveSchema.parse(existingEmail)      // ❌ Throws error

// Useful when you want to ensure fresh instances
const userCreationSchema = z.object({
  email: Email.schemaPrimitive() // Only accepts string input
})
```

### `schemaRaw()` - Raw Validation Only

```typescript
const emailRawSchema = Email.schemaRaw()

// Returns validated primitives without wrapping in value objects
emailRawSchema.parse('user@example.com') // Returns: 'user@example.com' (string)

// Useful for validation without instantiation such as in forms.
function validateEmailFormat(input: unknown): string {
  return emailRawSchema.parse(input) // Just validation, no wrapping
}
```

## API Reference

### `ValueObject.define(options)`

Creates a new value object class.

**Parameters:**
- `options.id` (string): Unique identifier for the value object type
- `options.schema` (function): Function returning a Zod schema for validation
- `options.toJSON` (function, optional): Custom JSON serialization function

**Returns:** Value object constructor class

```typescript
class Example extends ValueObject.define({
  id: 'Example',
  schema: () => z.string(),
  toJSON: (value) => value.toUpperCase() // optional
}) {}
```

### `ValueObject.defineUnion(discriminator, values)`

Creates a discriminated union of value objects.

**Parameters:**
- `discriminator` (string): Field name used to distinguish between types
- `values` (function): Function returning object mapping discriminator values to value object classes

**Returns:** Value object union with `fromJSON()`, `schema()`, and `isInstance()` methods

```typescript
const Union = ValueObject.defineUnion('type', () => ({
  typeA: ClassA,
  typeB: ClassB
}))
```

### Instance Methods

#### `valueObject.toJSON()`

Serializes the value object to JSON-compatible format.

**Returns:** JSON representation (respects custom `toJSON` option)

#### `valueObject.props`

**Returns:** The validated data properties (readonly)

### Static Methods

#### `ValueObjectClass.fromJSON(input)`

Creates an instance from JSON input with validation.

**Parameters:**
- `input`: Raw data or existing instance

**Returns:** Value object instance

#### `ValueObjectClass.schema()`

**Returns:** Zod schema that accepts both primitives and instances

#### `ValueObjectClass.schemaPrimitive()`

**Returns:** Zod schema that only accepts primitives and transforms to instances

#### `ValueObjectClass.schemaRaw()`

**Returns:** Raw Zod schema for validation only

### Union Methods

#### `union.fromJSON(input)`

Parses input and returns the appropriate value object instance.

#### `union.schema()`

**Returns:** Zod schema for the union

#### `union.isInstance(discriminatorValue, value)`

Type guard to check if value is instance of specific union member.

**Parameters:**
- `discriminatorValue`: The discriminator value to check
- `value`: Value to test

**Returns:** Boolean (with type narrowing)

## Common Patterns

### Domain-Driven Design

```typescript
// Money value object for financial calculations
class Money extends ValueObject.define({
  id: 'Money',
  schema: () => z.object({
    amount: z.number().nonnegative(),
    currency: z.enum(['USD', 'EUR', 'GBP'])
  })
}) {
  add(other: Money): Money {
    if (this.props.currency !== other.props.currency) {
      throw new Error('Cannot add money with different currencies')
    }

    return new Money({
      amount: this.props.amount + other.props.amount,
      currency: this.props.currency
    })
  }

  multiply(factor: number): Money {
    return new Money({
      amount: Math.round(this.props.amount * factor * 100) / 100,
      currency: this.props.currency
    })
  }
}

// Order aggregate with business logic
class Order extends ValueObject.define({
  id: 'Order',
  schema: () => z.object({
    id: z.string(),
    items: z.array(z.object({
      price: Money.schema(),
      quantity: z.number().int().positive()
    })),
    tax: Money.schema()
  })
}) {
  get total(): Money {
    const itemsTotal = this.props.items.reduce(
      (sum, item) => sum.add(item.price.multiply(item.quantity)),
      new Money({ amount: 0, currency: this.props.items[0]?.price.props.currency || 'USD' })
    )

    return itemsTotal.add(this.props.tax)
  }
}
```

## TypeScript Support

This library is built with TypeScript-first design principles:

- **Full type inference** from Zod schemas
- **Compile-time type safety** for all operations
- **IntelliSense support** for properties and methods
- **Type narrowing** for union members
- **Generic type utilities** for extracting types from value objects

```typescript
// TypeScript understands the exact shape of your value objects
const user = Customer.fromJSON(data)
user.props.email.props // TypeScript knows this is a string
user.props.addresses?.[0]?.props.zipCode // Optional chaining with proper types

// Union type narrowing works automatically
const pet = Pet.fromJSON(data)
if (pet instanceof Dog) { // or pet.props.type === 'dog'
  pet.props.woofs // TypeScript knows this is boolean and available
  // pet.props.purrs // ❌ TypeScript error: Property doesn't exist on Dog
}
```

## License

MIT

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and version history.
