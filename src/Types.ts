type FunctionLike = (...args: any[]) => any

export type Primitive = string | number | boolean

export type WithoutFunctions<T> = Pick<
  T,
  {
    [Key in keyof T]: T[Key] extends FunctionLike ? never : Key
  }[keyof T]
>

export type WithFunctions<T> = Pick<
  T,
  {
    [Key in keyof T]: T[Key] extends FunctionLike ? Key : never
  }[keyof T]
>

export type Require<T> = Exclude<T, null | undefined>

type CommonKeys<T extends object> = keyof T
type AllKeys<T> = T extends unknown ? keyof T : never
type Subtract<A, C> = A extends C ? never : A
type NonCommonKeys<T extends object> = Subtract<AllKeys<T>, CommonKeys<T>>
type PickType<T, K extends AllKeys<T>> = T extends { [k in K]?: unknown }
  ? T[K]
  : undefined
type PickTypeOf<T, K extends string | number | symbol> = K extends AllKeys<T>
  ? PickType<T, K>
  : never

export type MergeUnion<T extends object> = {
  [k in CommonKeys<T>]: PickTypeOf<T, k>
} & {
  [k in NonCommonKeys<T>]?: PickTypeOf<T, k>
}

export type MaintainNullable<T, V> = T extends null | undefined
  ?
      | V
      | (T extends null ? null : undefined)
      | (T extends undefined ? undefined : null)
  : V

type UndefinedKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never
}[keyof T]
type DefinedKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K
}[keyof T]
export type MarkUndefinedAsOptional<T> = {
  [K in DefinedKeys<T>]: T[K]
} & {
  [K in UndefinedKeys<T>]+?: T[K]
}

export const isPrimitive = (value: unknown): value is Primitive =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
