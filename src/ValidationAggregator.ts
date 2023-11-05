import { Serializable } from './Serializer'

type Remove<T> = Exclude<T, AggregatedValidationError>

export type OmitValidationErrors<T> = T extends AggregatedValidationError
  ? OmitValidationErrors<Remove<T>>
  : T extends Serializable
  ? Remove<T>
  : T extends (infer AV)[]
  ? OmitValidationErrors<AV>[]
  : T extends Record<string, any>
  ? {
      [K in keyof T]: OmitValidationErrors<T[K]>
    }
  : Remove<T>

export class ValidationAggregator {
  constructor(private path: string, private errors: ValidationError[]) {}

  static create() {
    return new ValidationAggregator('', [])
  }

  wrap<T>(func: () => T): T | AggregatedValidationError {
    try {
      return func()
    } catch (e) {
      if (e instanceof AggregatedValidationError) {
        return e
      }
      this.addError(e as Error)
      return this.error!
    }
  }

  withPath = (...paths: (string | number)[]) => {
    const nextPath = paths.join('.')
    return new ValidationAggregator(
      this.path ? `${this.path}.${nextPath}` : nextPath.toString(),
      this.errors,
    )
  }

  addError = (error: string | Error) => {
    if (typeof error === 'string') {
      error = new Error(error)
    }
    this.errors.push(new ValidationError(this.path || '', error))
    return this.error!
  }

  get error() {
    const [error, ...rest] = this.errors
    if (error) {
      return new AggregatedValidationError([error, ...rest])
    }
    return undefined
  }

  throwAggregate = () => {
    const { error } = this
    if (error) {
      throw error
    }
  }

  fail(error: string | Error) {
    const err = this.addError(error)
    this.throwAggregate()
    return err
  }

  get hasErrors() {
    return this.errors.length > 0
  }
}

function groupErrors(errors: ValidationError[]) {
  const root: ValidationError[] = []
  const paths: ValidationError[] = []
  for (const error of errors) {
    if (error.fieldPath) {
      paths.push(error)
    } else {
      root.push(error)
    }
  }
  return { root, paths }
}

export class AggregatedValidationError extends Error {
  constructor(public errorList: [ValidationError, ...ValidationError[]]) {
    const { paths, root } = groupErrors(errorList)

    let message = `Validation Error: ${root
      .map((err) => err.message)
      .join(', ')}`

    if (paths.length > 0) {
      message += `\n${paths
        .map((err) => `  ${err.fieldPath}: ${err.error.message}`)
        .join('\n')}`
    }

    super(message)
  }

  get errors() {
    const { paths, root } = groupErrors(this.errorList)

    const nested: Record<string, Error[]> = {}
    for (const error of paths) {
      nested[error.fieldPath] ??= []
      nested[error.fieldPath].push(error.error)
    }
    return {
      root: root.map((error) => error.error),
      paths: nested,
    }
  }

  get info() {
    const { paths, root } = this.errors
    return {
      root: root.length > 0 ? root[0].message : undefined,
      paths: Object.fromEntries(
        Object.entries(paths).map(([path, errors]) => [
          path,
          errors[0].message,
        ]),
      ),
    }
  }
}

export class ValidationError extends Error {
  constructor(public fieldPath: string, public error: Error) {
    super(error.message)
  }
}
