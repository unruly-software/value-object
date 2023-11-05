import { Valuable, ValueOf } from './Parser'
import {
  MaintainNullable,
  MarkUndefinedAsOptional,
  Primitive,
  Require,
  isPrimitive,
} from './Types'

export type SerializedSingle<T extends Serializable> = ReturnType<
  Serializer<T>['asJSON']
>

export type Serializable = {
  serializer(): Serializer<any>
} & Valuable

export type RecursiveSerialized<T> = Require<T> extends Primitive // if(primitive)
  ? T
  : Require<T> extends (infer AV)[] // if array
  ? RecursiveSerialized<AV>[]
  : Require<T> extends Serializable // if serializable
  ? MaintainNullable<T, SerializedSingle<Require<T>>>
  : MaintainNullable<
      T,
      MarkUndefinedAsOptional<{
        [K in keyof Require<T>]: K extends keyof T
          ? RecursiveSerialized<T[K]>
          : never
      }>
    >

export class Serializer<T extends Valuable> {
  constructor(private object: T) {}

  asJSON(): RecursiveSerialized<ValueOf<T>> {
    return recursiveJSON(this.object.getValue())
  }
}

function recursiveJSON(value: unknown): any {
  if (value === null || value === undefined) return value

  if (isPrimitive(value)) return value

  if (Array.isArray(value)) {
    return value.map(recursiveJSON)
  }

  if (typeof value === 'object') {
    if (typeof (value as Serializable)['serializer'] === 'function') {
      return (value as any).serializer().asJSON()
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, recursiveJSON(value)]),
    )
  }

  return value
}
