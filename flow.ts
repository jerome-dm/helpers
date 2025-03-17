type FunctionCallSpec = {
  this?: unknown
  args?: unknown[]
}

interface FlowInterface<T, IsAsync extends boolean> {
  get: () => IsAsync extends true ? Promise<T> : T
  pipe: <R>(transformer: ((value: T, ...args: unknown[]) => R | Promise<R>) | R, ...args: unknown[]) => Flow<R, IsAsync>
  catch: (errorHandler: (error: Error) => void) => Flow<T, IsAsync>
  tap: (fn: (value: T) => void) => Flow<T, IsAsync>
  map: <R>(fn: (value: T) => R) => Flow<R, IsAsync>
  filter: (predicate: (value: T) => boolean) => Flow<T | null, IsAsync>
  delay: (ms: number) => Flow<T, true>
  retry: (attempts: number) => Flow<T, IsAsync>
  when: (condition: boolean | ((value: T) => boolean), thenFn: ((value: T) => T | Promise<T>), elseFn?: ((value: T) => T | Promise<T>)) => Flow<T, IsAsync>
}

class Flow<T, IsAsync extends boolean = false> implements FlowInterface<T, IsAsync> {
  private readonly value: T | Promise<T>
  private errorHandler: (error: Error) => void = (): void => {}
  private readonly isAsync: IsAsync

  constructor(initialValue: T | Promise<T>, isAsync: IsAsync) {
    this.value = initialValue
    this.isAsync = isAsync
  }

  get(): IsAsync extends true ? Promise<T> : T {
    if (this.isAsync) {
      return Promise.resolve(this.value) as IsAsync extends true ? Promise<T> : T
    }
    return this.value as IsAsync extends true ? Promise<T> : T
  }

  pipe<R>(
    transformer: ((value: T, ...args: unknown[]) => R | Promise<R>) | R,
    ...args: unknown[]
  ): Flow<R, IsAsync> {
    FlowContext.currentValue = this.value

    try {
      if (!this.isAsync) {
        return this.handleSyncTransformation(transformer, args)
      }
      return this.handleAsyncTransformation(transformer, args)
    } catch (error) {
      this.errorHandler(error as Error)
      return new Flow(undefined as unknown as R, this.isAsync)
    }
  }

  private handleSyncTransformation<R>(
    transformer: ((value: T, ...args: unknown[]) => R | Promise<R>) | R,
    args: unknown[]
  ): Flow<R, IsAsync> {
    const value = this.value as T
    const { context, callArgs } = this.prepareTransformationArgs(value, args)
    const result: R|Promise<R> = this.executeTransformation(transformer, context, callArgs)
    const finalValue = this.determineFinalValue(result, value, args) as R
    return new Flow(finalValue, false) as Flow<R, IsAsync>
  }

  private handleAsyncTransformation<R>(
    transformer: ((value: T, ...args: unknown[]) => R | Promise<R>) | R,
    args: unknown[]
  ): Flow<R, IsAsync> {
    const asyncTransform: () => Promise<R> = async (): Promise<R> => {
      const value: Awaited<T> = await Promise.resolve(this.value)
      const { context, callArgs } = this.prepareTransformationArgs(value, args)
      const result: Awaited<R> = await Promise.resolve(this.executeTransformation(transformer, context, callArgs))
      return this.determineFinalValue(result, value, args)
    }
    return new Flow(asyncTransform(), this.isAsync)
  }

  private prepareTransformationArgs(value: T, args: unknown[]): { context: unknown, callArgs: unknown[] } {
    if (args[0] && isValidFunctionCallSpec(args[0])) {
      return {
        context: args[0].this ?? null,
        callArgs: args[0].args ?? []
      }
    }
    return {
      context: null,
      callArgs: [value, ...args]
    }
  }

  private executeTransformation<R>(
    transformer: ((value: T, ...args: unknown[]) => R | Promise<R>) | R,
    context: unknown,
    callArgs: unknown[]
  ): R | Promise<R> {
    if (typeof transformer === 'function') {
      return transformer.apply(context, callArgs)
    }
    return transformer
  }

  private determineFinalValue<R>(result: R, originalValue: T, args: unknown[]): R {
    const lastArgument: unknown = args[args.length - 1]
    if (lastArgument === FlowContext.returnOriginal) {
      return originalValue as unknown as R
    }
    if (lastArgument === FlowContext.returnBoth) {
      return [result, originalValue] as unknown as R
    }
    return result
  }

  catch(errorHandler: (error: Error) => void): Flow<T, IsAsync> {
    this.errorHandler = errorHandler
    return this
  }

  tap(fn: (value: T) => void): Flow<T, IsAsync> {
    return this.pipe((value: T): T => {
      fn(value)
      return value
    })
  }

  map<R>(fn: (value: T) => R): Flow<R, IsAsync> {
    return this.pipe(fn)
  }

  filter(predicate: (value: T) => boolean): Flow<T | null, IsAsync> {
    return this.pipe((value: T): T => predicate(value) ? value : null)
  }

  delay(ms: number): Flow<T, true> {
    return this.pipe(async (value: T): Promise<T> => {
      await new Promise((resolve: (value: unknown) => void): number => setTimeout(resolve, ms))
      return value
    }) as unknown as Flow<T, true>
  }

  retry(attempts: number): Flow<T, IsAsync> {
    return this.pipe(async (value: T) => {
      let lastError: Error
      for (let i: number = 0; i < attempts; i++) {
        try {
          return await Promise.resolve(value)
        } catch (error) {
          lastError = error as Error
          if (i === attempts - 1) throw lastError
        }
      }
    })
  }

  when(
    condition: boolean | ((value: T) => boolean),
    thenFn: ((value: T) => T | Promise<T>),
    elseFn?: ((value: T) => T | Promise<T>)
  ): Flow<T, IsAsync> {
    return this.pipe((value: T): T | Promise<T> => {
      const result: boolean = typeof condition === 'function' ? condition(value) : condition
      if (result) {
        return thenFn(value)
      }
      return elseFn ? elseFn(value) : value
    })
  }
}

class FlowContext {
  static currentValue: unknown
  static readonly returnOriginal: symbol = Symbol('ReturnOriginal')
  static readonly returnBoth: symbol = Symbol('ReturnBoth')
}

function isValidFunctionCallSpec(spec: unknown): spec is FunctionCallSpec {
  if (!spec || typeof spec !== 'object') return false
  const specObject = spec as FunctionCallSpec
  return (specObject.this !== undefined || Array.isArray(specObject.args))
}

export function flow<T>(initialValue: T | Promise<T>): Flow<T, boolean> {
  const isAsync: boolean = initialValue instanceof Promise ||
    (typeof initialValue === 'function' && initialValue.constructor.name === 'AsyncFunction')
  return new Flow(initialValue, isAsync)
}

flow.$ = FlowContext.currentValue
flow.$orig = FlowContext.returnOriginal
flow.$both = FlowContext.returnBoth
