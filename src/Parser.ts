import { RecursiveSerialized, Serializable } from './Serializer'
import { MarkUndefinedAsOptional, Primitive, Require } from './Types'
import {
  AggregatedValidationError,
  ValidationAggregator,
} from './ValidationAggregator'

export type Parseable = {
  parser(): Parser<any>
}

export type ValuableConstructor = { new (...args: any[]): Valuable }
export type Valuable = { getValue(): any }
export type ValueOf<T extends Valuable> = ReturnType<T['getValue']>

type ValuableConstructorValue<T extends ValuableConstructor> = ValueOf<
  InstanceType<T>
>

type Attributes<T> = Require<T> extends Primitive // If the passed type is a primitive
  ? T // Return the attributes (nullable)
  : Require<T> extends Serializable // If the passed type is serializable
  ? RecursiveSerialized<T> // Return the attributes
  : Require<T> extends (infer AV)[] // If the passed type is an array
  ? (Attributes<AV> | AV)[] // Return the attributes
  : never

export type CreateParameters<T extends ValuableConstructor> =
  ValuableConstructorValue<T> extends Primitive
    ? ValuableConstructorValue<T> | InstanceType<T>
    : ValuableConstructorValue<T> extends (infer AV)[]
    ? Attributes<AV>[] | InstanceType<T>
    :
        | MarkUndefinedAsOptional<{
            [K in keyof ValuableConstructorValue<T>]:
              | Attributes<ValuableConstructorValue<T>[K]>
              | ValuableConstructorValue<T>[K]
          }>
        | InstanceType<T>

type ParserFunction<T extends { new (args: any): any }> = (
  args: unknown,
  errs: ValidationAggregator,
) => InstanceType<T>

export class Parser<T extends { new (args: any): any }> {
  constructor(private parsedClass: T, private parser: ParserFunction<T>) {}

  private parse(args: {
    data: unknown
    shouldThrow?: boolean
    errs?: ValidationAggregator
  }): InstanceType<T> | AggregatedValidationError {
    const { data, errs, shouldThrow } = args
    if (data instanceof this.parsedClass) {
      return data
    }
    const validator = errs ?? ValidationAggregator.create()

    const result = validator.wrap(() => this.parser(data, validator))

    const validationError =
      result instanceof AggregatedValidationError ? result : validator.error

    if (shouldThrow && validationError) {
      throw validationError
    }
    return result
  }

  fromJSON<V extends ValidationAggregator | undefined = undefined>(
    data: unknown,
    errs?: V,
  ): V extends ValidationAggregator
    ? InstanceType<T> | AggregatedValidationError
    : InstanceType<T> {
    const result = this.parse({ data, shouldThrow: !errs, errs })
    return result as InstanceType<T>
  }

  create<V extends ValidationAggregator | undefined = undefined>(
    data: CreateParameters<T>,
    errs?: V,
  ): V extends ValidationAggregator
    ? InstanceType<T> | AggregatedValidationError
    : InstanceType<T> {
    const result = this.parse({ data, shouldThrow: !errs, errs })
    return result as InstanceType<T>
  }
}
