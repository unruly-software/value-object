import z from 'zod'
import {
  RAW_SCHEMA_ACCESSOR_KEY,
  ToJSONOutput,
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

  new(props: z.output<T>): ValueObjectInstance<ID, T, JS>
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
  const {id} = options
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
  }

  return DefinedValueObject as unknown as ValueObjectConstructor<ID, T, JS>
}
