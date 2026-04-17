import z from 'zod'
import {
  DEFAULT_EQUALS_SYMBOL,
  RAW_SCHEMA_ACCESSOR_KEY,
  ToJSONOutput,
  deepEquals,
  instanceOrConstruct,
  once,
  recursivelyToJSON,
  ValueObjectIdSymbol,
} from './utils'

/**
 * Infers the serialized JSON shape of a value object (the return type of `toJSON()`).
 *
 * @example
 * type EmailJSON = ValueObject.inferJSON<typeof Email> // string
 */
export type inferJSON<T> = T extends ValueObjectConstructor<
  string,
  any,
  infer JS
>
  ? JS
  : T extends ValueObjectInstance<string, any, infer JS>
  ? JS
  : never

/**
 * Infers the parsed `props` shape of a value object (the schema's output type).
 *
 * @example
 * type YearMonthProps = ValueObject.inferProps<typeof YearMonth> // { year: number, month: number }
 */
export type inferProps<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? z.output<Z>
  : T extends ValueObjectInstance<string, infer Z, any>
  ? z.output<Z>
  : never

/**
 * Infers the accepted input type of a value object — either the raw schema input or an existing instance.
 *
 * @example
 * type EmailInput = ValueObject.inferInput<typeof Email> // string | Email
 */
export type inferInput<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? z.input<Z> | InstanceType<T>
  : T extends ValueObjectInstance<string, infer Z, any>
  ? z.input<Z> | T
  : never

/**
 * Infers the raw schema input — the same as `inferInput<T>` but excluding the instance type.
 *
 * @example
 * type EmailRaw = ValueObject.inferRawInput<typeof Email> // string
 */
export type inferRawInput<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? z.input<Z>
  : T extends ValueObjectInstance<string, infer Z, any>
  ? z.input<Z>
  : never

export interface ValueObjectInstance<
  ID extends string,
  T extends z.ZodTypeAny,
  JS,
> {
  [ValueObjectIdSymbol]: ID

  readonly props: z.output<T>

  readonly __schema: T

  /**
   * JSON-compatible representation of the value object. Honours the optional
   * `toJSON` serializer passed to `define()` / `extend()`.
   *
   * @example
   * Email.fromJSON('alice@example.com').toJSON() // 'alice@example.com'
   */
  toJSON(): ToJSONOutput<JS>

  /**
   * Structural equality — same type and deeply-equal `props`. Override on a
   * subclass to express domain-specific identity (e.g. comparing only `id`).
   *
   * @example
   * class User extends ValueObject.define({
   *   id: 'User',
   *   schema: () => z.object({ id: z.string(), name: z.string() }),
   * }) {
   *   override equals(other: User) { return this.props.id === other.props.id }
   * }
   */
  equals(other: this): boolean

  /**
   * Returns a duplicate instance by re-parsing `props` through the schema
   * (Zod handles deep cloning) and constructing a new instance of the same class.
   *
   * @example
   * const a = Address.fromJSON({ street: '1 Main St', tags: ['home'] })
   * const b = a.clone()
   * b.props.tags.push('mutated')
   * a.props.tags // ['home'] — original is untouched
   */
  clone(): this
}

export interface ValueObjectConstructor<
  ID extends string,
  T extends z.ZodTypeAny,
  JS,
> {
  [ValueObjectIdSymbol]: ID

  /**
   * Zod schema accepting either a raw input or an existing instance, returning
   * an instance. Use this when composing the value object inside other Zod schemas.
   *
   * @example
   * const Form = z.object({ email: Email.schema() })
   * Form.parse({ email: 'a@b.com' }).email instanceof Email // true
   */
  schema<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
  ): z.ZodUnion<
    [
      z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>,
      z.ZodCustom<InstanceType<CTOR>, InstanceType<CTOR>>,
    ]
  >

  /**
   * Zod schema accepting only the raw primitive input (not an instance),
   * returning an instance. Useful when parsing JSON from the wire.
   *
   * @example
   * Email.schemaPrimitive().parse('a@b.com') instanceof Email // true
   */
  schemaPrimitive<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
  ): z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>

  /**
   * The raw underlying Zod schema with no instance wrapping.
   *
   * @example
   * Email.schemaRaw().parse('a@b.com') // 'a@b.com' (string, not Email)
   */
  schemaRaw<CTOR extends ValueObjectConstructor<ID, T, JS>>(this: CTOR): T

  /**
   * Parses a raw input (or accepts an existing instance) and returns a validated instance.
   *
   * @example
   * const email = Email.fromJSON('a@b.com')
   * Email.fromJSON(email) === email // true — instances pass through
   */
  fromJSON<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
    props: z.input<T> | InstanceType<CTOR>,
  ): InstanceType<CTOR>

  new (props: z.output<T>): ValueObjectInstance<ID, T, JS>
}

/**
 * Creates a value object class backed by a Zod schema. Extend the returned class
 * to add methods/getters. The class exposes `fromJSON`, `schema`, `schemaPrimitive`
 * and `schemaRaw` statics, plus `props` and `toJSON()` on instances.
 *
 * @example
 * class Email extends ValueObject.define({
 *   id: 'Email',
 *   schema: () => z.string().email(),
 * }) {}
 *
 * const email = Email.fromJSON('value@object.com')
 * email.props // 'value@object.com'
 * email.toJSON() // 'value@object.com'
 *
 * @example
 * // With a custom JSON serializer:
 * class YearMonth extends ValueObject.define({
 *   id: 'YearMonth',
 *   schema: () => z.object({ year: z.number(), month: z.number() }),
 *   toJSON: (v) => `${v.year}-${String(v.month).padStart(2, '0')}`,
 * }) {}
 */
export function define<
  ID extends string,
  T extends z.ZodTypeAny,
  JS = z.output<T>,
>(options: {
  id: ID
  schema: () => T
  toJSON?: (value: z.output<T>) => JS
}): ValueObjectConstructor<ID, T, JS> {
  const { id } = options
  const getSchema = once(options.schema)

  const schema = once(function (klass: ValueObjectConstructor<ID, T, JS>) {
    return instanceOrConstruct(klass, getSchema())
  })

  const schemaPrimitive = once(function (
    klass: ValueObjectConstructor<ID, T, JS>,
  ) {
    return getSchema().transform((value) => {
      return new klass(value)
    })
  })

  const DefinedValueObject = class {
    static [ValueObjectIdSymbol] = id
    static get [RAW_SCHEMA_ACCESSOR_KEY]() {
      return getSchema()
    }
    [ValueObjectIdSymbol] = id

    constructor(public readonly props: z.output<T>) {}

    static schema(this: ValueObjectConstructor<ID, T, JS>) {
      return schema(this)
    }

    static schemaPrimitive(this: ValueObjectConstructor<ID, T, JS>) {
      return schemaPrimitive(this)
    }

    static schemaRaw(this: ValueObjectConstructor<ID, T, JS>) {
      return getSchema()
    }

    static fromJSON(
      this: ValueObjectConstructor<ID, T, JS>,
      props: z.input<T>,
    ) {
      return this.schema().parse(props)
    }

    toJSON(): ToJSONOutput<JS> {
      if (options.toJSON) {
        return recursivelyToJSON(options.toJSON(this.props))
      }
      return recursivelyToJSON(this.props) as ToJSONOutput<JS>
    }

    equals(other: unknown): boolean {
      return deepEquals(this, other)
    }

    clone(): ValueObjectInstance<ID, T, JS> {
      const Ctor = this.constructor as new (
        props: z.output<T>,
      ) => ValueObjectInstance<ID, T, JS>
      const cloned = (
        Ctor as unknown as ValueObjectConstructor<ID, T, JS>
      ).fromJSON(this.props as any)
      return cloned
    }
  }

  ;(DefinedValueObject.prototype.equals as any)[DEFAULT_EQUALS_SYMBOL] = true

  return DefinedValueObject as unknown as ValueObjectConstructor<ID, T, JS>
}

/** Extracts the Zod schema type from a value object constructor. */
type SchemaOf<P> = P extends ValueObjectConstructor<string, infer Z, any>
  ? Z
  : never

/** Methods/getters defined on the parent class, excluding structural members. */
type ParentExtras<P extends ValueObjectConstructor<string, any, any>> = Omit<
  InstanceType<P>,
  keyof ValueObjectInstance<string, z.ZodTypeAny, unknown>
>

type ExtendedInstance<
  P extends ValueObjectConstructor<string, any, any>,
  ID extends string,
  NewT extends z.ZodTypeAny,
  NewJS,
> = ParentExtras<P> & ValueObjectInstance<ID, NewT, NewJS>

/** Strips construct/call signatures from a type, leaving only named static members. */
type StaticsOf<T> = { [K in keyof T]: T[K] }

export type ExtendedValueObjectConstructor<
  P extends ValueObjectConstructor<string, any, any>,
  ID extends string,
  NewT extends z.ZodTypeAny,
  NewJS,
> = StaticsOf<ValueObjectConstructor<ID, NewT, NewJS>> & {
  new (props: z.output<NewT>): ExtendedInstance<P, ID, NewT, NewJS>
}

/**
 * Returned when an `extend` schema produces an output not assignable to the parent's.
 * Not constructable, so misuse fails to type-check at the `class X extends ...` site.
 */
export type SchemaTransformOutputMismatchError = {
  __valueObjectError: 'Schema transform output must be assignable to the parent schema output'
}

/**
 * Derives a new value object class from an existing one. The returned class
 * extends `parent` directly, so `instanceof` and inherited methods work, and
 * the new schema is layered on top of the parent's via `options.schema`.
 *
 * @example
 * class Email extends ValueObject.define({
 *   id: 'Email',
 *   schema: () => z.string().email(),
 * }) {
 *   get domain() { return this.props.split('@')[1] }
 * }
 *
 * class GoogleEmail extends ValueObject.extends(Email, {
 *   id: 'GoogleEmail',
 *   schema: (prev) => prev.refine((s) => s.endsWith('@google.com'), 'must be a google email'),
 * }) {
 *   get isWorkspace() { return this.props.endsWith('@workspace.google.com') }
 * }
 *
 * const ge = GoogleEmail.fromJSON('alice@google.com')
 * ge instanceof Email       // true — prototype chain preserved
 * ge.domain                 // 'google.com' — inherited from Email
 * ge.isWorkspace            // false — defined on GoogleEmail
 */
export function extend<
  P extends ValueObjectConstructor<string, any, any>,
  ID extends string,
  NewT extends z.ZodTypeAny,
  NewJS = z.output<NewT>,
>(
  parent: P,
  options: {
    id: ID
    schema: (prev: SchemaOf<P>) => NewT
    toJSON?: (value: z.output<NewT>) => NewJS
  },
): z.output<NewT> extends z.output<SchemaOf<P>>
  ? ExtendedValueObjectConstructor<P, ID, NewT, NewJS>
  : SchemaTransformOutputMismatchError {
  const { id } = options

  const getSchema = once(() =>
    options.schema((parent as any)[RAW_SCHEMA_ACCESSOR_KEY]),
  )

  const schemaFn = once(function (klass: any) {
    return instanceOrConstruct(klass, getSchema())
  })

  const schemaPrimitiveFn = once(function (klass: any) {
    return getSchema().transform((value: any) => new klass(value))
  })

  const Extended = class extends (parent as any) {
    static [ValueObjectIdSymbol] = id
    static get [RAW_SCHEMA_ACCESSOR_KEY]() {
      return getSchema()
    }
    [ValueObjectIdSymbol] = id

    static schema(this: any) {
      return schemaFn(this)
    }

    static schemaPrimitive(this: any) {
      return schemaPrimitiveFn(this)
    }

    static schemaRaw() {
      return getSchema()
    }

    static fromJSON(this: any, props: any) {
      return this.schema().parse(props)
    }
  }

  if (options.toJSON) {
    const customToJSON = options.toJSON
    Object.defineProperty(Extended.prototype, 'toJSON', {
      value: function toJSON(this: any) {
        return recursivelyToJSON(customToJSON(this.props))
      },
      writable: true,
      configurable: true,
    })
  }

  return Extended as unknown as z.output<NewT> extends z.output<SchemaOf<P>>
    ? ExtendedValueObjectConstructor<P, ID, NewT, NewJS>
    : SchemaTransformOutputMismatchError
}
