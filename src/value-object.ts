import z from 'zod'
import {
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

  toJSON(): ToJSONOutput<JS>

  /**
   * Structural equality. Returns `true` only when `other` is a value object
   * of the same type (matching `id`) whose `props` are deeply equal:
   *
   * - Object keys are compared in any order, recursively.
   * - Arrays must have the same length and equal elements in order.
   * - Nested value objects are compared via their own `equals()` method, so
   *   user overrides are honoured all the way down.
   * - `Date` instances compare by timestamp.
   *
   * Subclasses may override this with `override equals(other: Self): boolean`
   * to express domain-specific identity (e.g. comparing only an `id` field).
   */
  equals(other: this): boolean
}

export interface ValueObjectConstructor<
  ID extends string,
  T extends z.ZodTypeAny,
  JS,
> {
  [ValueObjectIdSymbol]: ID

  schema<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
  ): z.ZodUnion<
    [
      z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>,
      z.ZodCustom<InstanceType<CTOR>, InstanceType<CTOR>>,
    ]
  >

  schemaPrimitive<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
  ): z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>

  schemaRaw<CTOR extends ValueObjectConstructor<ID, T, JS>>(this: CTOR): T

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
      if ((this as any) === other) return true
      if (other === null || typeof other !== 'object') return false
      if (!(ValueObjectIdSymbol in other)) return false
      if (
        (other as any)[ValueObjectIdSymbol] !==
        (this as any)[ValueObjectIdSymbol]
      ) {
        return false
      }
      return deepEquals(this.props, (other as any).props)
    }
  }

  return DefinedValueObject as unknown as ValueObjectConstructor<ID, T, JS>
}

/**
 * Extracts the Zod schema type from a value object constructor.
 * Local copy of the helper in `./union` to avoid a cross-file import.
 */
type SchemaOf<P> = P extends ValueObjectConstructor<string, infer Z, any>
  ? Z
  : never

/**
 * The user-defined methods/getters on a parent value object class — i.e.
 * everything other than the structural members of `ValueObjectInstance`.
 * Stripping by `keyof ValueObjectInstance<...>` removes `props`, `toJSON`,
 * `__schema`, and `[ValueObjectIdSymbol]` in one go so they can be
 * re-supplied with the extended types.
 */
type ParentExtras<P> = Omit<
  InstanceType<P & (new (...args: any[]) => any)>,
  keyof ValueObjectInstance<string, z.ZodTypeAny, unknown>
>

type ExtendedInstance<
  P extends ValueObjectConstructor<string, any, any>,
  ID extends string,
  NewT extends z.ZodTypeAny,
  NewJS,
> = ParentExtras<P> & ValueObjectInstance<ID, NewT, NewJS>

/**
 * A mapped type over `keyof T` which strips construct/call signatures —
 * leaving only the named static members. We use it so we can re-attach a
 * single, more specific `new()` signature without TypeScript treating it as
 * an overload of the parent's constructor (which would otherwise trigger
 * "Base constructors must all have the same return type" when the result is
 * used in a `class X extends ...` clause).
 */
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
 * Sentinel returned (in place of the extended constructor) when the schema
 * transform produces a type that is *not* assignable to the parent's output.
 * It is intentionally not constructable, so `class X extends extend(...) {}`
 * fails to type-check on the offending call.
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
