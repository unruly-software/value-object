import {
  ValuableConstructor,
  Parser,
  Valuable,
  CreateParameters,
} from './Parser'
import { Serializer } from './Serializer'
import {
  AggregatedValidationError,
  OmitValidationErrors,
  ValidationAggregator,
} from './ValidationAggregator'

export interface ValueObjectDefinitionArgs<T> {
  parse: (value: unknown, errs: ValidationAggregator) => T
}

export abstract class ValueObject {
  static define<T>(args: ValueObjectDefinitionArgs<T>) {
    return class extends ValueObject {
      readonly value: Readonly<OmitValidationErrors<T>>

      constructor(value: OmitValidationErrors<T>) {
        super()
        this.value = Object.freeze(value)
        Object.freeze(this)
      }

      getValue(): OmitValidationErrors<T> {
        return this.value as OmitValidationErrors<T>
      }

      static parser<T extends ValuableConstructor>(this: T): Parser<T> {
        return ((this as any)._parser ??= new Parser(
          this,
          (value, errs) => new this(args.parse(value, errs)) as InstanceType<T>,
        ))
      }

      static create<
        T extends ValuableConstructor,
        V extends ValidationAggregator | undefined = undefined,
      >(
        this: T,
        data: CreateParameters<T>,
        errs?: V,
      ): V extends ValidationAggregator
        ? InstanceType<T> | AggregatedValidationError
        : InstanceType<T> {
        return (this as any).parser().create(data, errs)
      }

      static fromJSON<
        T extends ValuableConstructor,
        V extends ValidationAggregator | undefined = undefined,
      >(
        this: T,
        data: unknown,
        errs?: V,
      ): V extends ValidationAggregator
        ? InstanceType<T> | AggregatedValidationError
        : InstanceType<T> {
        return (this as any).parser().fromJSON(data, errs)
      }

      serializer<T extends Valuable>(this: T): Serializer<T> {
        return ((this as any)._serializer ??= new Serializer(this))
      }

      asJSON = this.serializer().asJSON.bind(this.serializer())
      toJSON() {
        return this.asJSON()
      }
    }
  }
}
