/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { Worker } from 'worker_threads'
import type * as HeapSnapshotModel from './HeapSnapshotModel'

interface DispatcherResponse {
  callId?: number
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  error?: string
  errorCallStack?: Object
  errorMethodName?: string
}
export class HeapSnapshotWorkerDispatcher {
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #objects: any[]
  readonly #global: Worker
  readonly #postMessage: Function
  constructor(globalObject: Worker, postMessage: Function) {
    this.#objects = []
    this.#global = globalObject
    this.#postMessage = postMessage
  }

  #findFunction(name: string): Function {
    const path = name.split('.')
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result = this.#global as any
    for (let i = 0; i < path.length; ++i) {
      result = result[path[i]]
    }
    return result as Function
  }

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendEvent(name: string, data: any): void {
    this.#postMessage({ eventName: name, data: data })
  }

  dispatchMessage({ data }: { data: HeapSnapshotModel.WorkerCommand }): void {
    const response: DispatcherResponse = {
      callId: data.callId,
      result: null,
      error: undefined,
      errorCallStack: undefined,
      errorMethodName: undefined,
    }
    try {
      switch (data.disposition) {
        case 'create': {
          const constructorFunction = this.#findFunction(data.methodName)
          // @ts-ignore
          this.#objects[data.objectId] = new constructorFunction(this)
          break
        }
        case 'dispose': {
          delete this.#objects[data.objectId]
          break
        }
        case 'getter': {
          const object = this.#objects[data.objectId]
          const result = object[data.methodName]
          response.result = result
          break
        }
        case 'factory': {
          const object = this.#objects[data.objectId]
          const result = object[data.methodName].apply(object, data.methodArguments)
          if (result) {
            this.#objects[data.newObjectId] = result
          }
          response.result = Boolean(result)
          break
        }
        case 'method': {
          const object = this.#objects[data.objectId]
          response.result = object[data.methodName].apply(object, data.methodArguments)
          break
        }
        case 'evaluateForTest': {
          try {
            response.result = eval(data.source)
          } catch (error) {
            response.result = (error as Error).toString()
          }
          break
        }
      }
    } catch (error) {
      response.error = (error as Error).toString()
      response.errorCallStack = (error as Error).stack
      if (data.methodName) {
        response.errorMethodName = data.methodName
      }
    }
    this.#postMessage(response)
  }
}
