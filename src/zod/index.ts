import { z, ZodError } from 'zod'
import { Parseable } from '../Parser'
import { ValidationAggregator } from '../ValidationAggregator'

type valueObjectParser = <T extends Parseable & (new (...args: any[]) => any)>(
  valueObject: T,
) => z.ZodEffects<
  z.ZodType<InstanceType<T>, z.ZodTypeDef, InstanceType<T>>,
  InstanceType<T>,
  unknown
>

type Resolver = <T extends z.Schema<any, any>>(
  schema: T,
  options?: z.ParseParams,
) => (data: unknown, errs: ValidationAggregator) => z.infer<T>

export const zodValueObjectParser: valueObjectParser = (valueObject: any) =>
  z
    .preprocess(
      (data) => {
        const aggregator = ValidationAggregator.create()
        const result = valueObject.parser().fromJSON(data, aggregator)
        return { result, aggregator }
      },
      z.any().superRefine(({ aggregator }, ctx) => {
        ;(aggregator as ValidationAggregator).error?.errorList.forEach(
          (err) => {
            ctx.addIssue({
              code: 'custom',
              message: err.message,
              path: [...err.fieldPath.split('.')].filter((v) => v),
            })
          },
        )
      }),
    )
    .transform(({ result }) => result) as any

export const zodResolver: Resolver = (schema, options) => {
  return (data, validationAggregator) => {
    try {
      const parsed = schema.parse(data, options)

      return parsed
    } catch (e) {
      if (e instanceof ZodError) {
        e.errors.forEach((err) => {
          const { message } = err
          validationAggregator.withPath(...err.path).addError(message)
        })
      }
      return null
    }
  }
}
