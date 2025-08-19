import z from 'zod'
import {
  RAW_SCHEMA_ACCESSOR_KEY,
  ToJSONOutput,
  instanceOrConstruct,
  once,
  recursivelyToJSON,
} from './utils'

export const ValueObjectIdSymbol = Symbol('ValueObjectId')

export interface ValueObjectInstance<
  ID extends string,
  T extends z.ZodTypeAny,
> {
  [ValueObjectIdSymbol]: ID

  readonly props: z.output<T>

  toJSON(): ToJSONOutput<z.output<T>>
}

export interface ValueObjectConstructor<
  ID extends string,
  T extends z.ZodTypeAny,
> {
  [ValueObjectIdSymbol]: ID

  schema<CTOR extends ValueObjectConstructor<ID, T>>(
    this: CTOR,
  ): z.ZodUnion<
    [
      z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>,
      z.ZodCustom<InstanceType<CTOR>, InstanceType<CTOR>>,
    ]
  >

  schemaPrimitive<CTOR extends ValueObjectConstructor<ID, T>>(
    this: CTOR,
  ): z.ZodPipe<T, z.ZodTransform<InstanceType<CTOR>, T>>

  fromJSON<CTOR extends ValueObjectConstructor<ID, T>>(
    this: CTOR,
    props: z.input<T> | InstanceType<CTOR>,
  ): InstanceType<CTOR>

  new (props: z.output<T>): ValueObjectInstance<ID, T>
}

export function define<ID extends string, T extends z.ZodTypeAny>(options: {
  id: ID
  schema: () => T
}): ValueObjectConstructor<ID, T> {
  const { id } = options
  const getSchema = once(options.schema)

  const schema = once(function (klass: ValueObjectConstructor<ID, T>) {
    return instanceOrConstruct(klass, getSchema())
  })

  const schemaPrimitive = once(function (klass: ValueObjectConstructor<ID, T>) {
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

    static schema(this: ValueObjectConstructor<ID, T>) {
      return schema(this)
    }

    static schemaPrimitive(this: ValueObjectConstructor<ID, T>) {
      return schemaPrimitive(this)
    }

    static fromJSON(this: ValueObjectConstructor<ID, T>, props: z.input<T>) {
      return this.schema().parse(props)
    }

    toJSON() {
      return recursivelyToJSON(this.props)
    }
  } as any
}
