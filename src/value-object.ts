import z from 'zod'
import {
  RAW_SCHEMA_ACCESSOR_KEY,
  ToJSONOutput,
  instanceOrConstruct,
  once,
  recursivelyToJSON,
} from './utils'

export const ValueObjectIdSymbol = Symbol('ValueObjectId')

export type inferJSON<T> = T extends ValueObjectConstructor<
  string,
  any,
  infer JS
>
  ? JS
  : T extends ValueObjectInstance<string, any, infer JS>
  ? JS
  : never

export type inferProps<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? z.output<Z>
  : T extends ValueObjectInstance<string, infer Z, any>
  ? z.output<Z>
  : never

export type inferInput<T> = T extends ValueObjectConstructor<
  string,
  infer Z,
  any
>
  ? z.input<Z> | InstanceType<T>
  : T extends ValueObjectInstance<string, infer Z, any>
  ? z.input<Z> | T
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

  fromJSON<CTOR extends ValueObjectConstructor<ID, T, JS>>(
    this: CTOR,
    props: z.input<T> | InstanceType<CTOR>,
  ): InstanceType<CTOR>

  new (props: z.output<T>): ValueObjectInstance<ID, T, JS>
}

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

  return class DefinedValueObject {
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
      return recursivelyToJSON(this.props) as any
    }
  } as any
}
