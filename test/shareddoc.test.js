/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'assert';
import { updateHandler, WSSharedDoc } from '../src/shareddoc.js';

function isSubArray(full, sub) {
  if (sub.length === 0) {
    return true;
  }

  const candidateIdxs = [];
  for (let i = 0; i < full.length; i++) {
    if (full[i] === sub[0]) {
      candidateIdxs.push(i);
    }
  }

  nextCandidate:
  for (let i = 0; i < candidateIdxs.length; i++) {
    for (let j = 0; j < sub.length; j++) {
      if (sub[j] !== full[candidateIdxs[i] + j]) {
        break nextCandidate;
      }
    }
    return true;
  }

  return false;
}

describe('Collab Test Suite', () => {
  it('Test updateHandler', () => {
    const conn = {
      isClosed: false,
      message: null,
      readyState: 1, // wsReadyStateOpen
      has() {
        return true;
      },
      close() {
        this.isClosed = true;
      },
      send(m) {
        this.message = m;
      },
    };

    const deleted = [];
    const conns = {
      forEach(f) {
        f(null, conn);
      },
      has(c) {
        return c === conn;
      },
      get: () => 123,
      delete(id) { deleted.push(id); },
    };

    const update = new Uint8Array([21, 31]);
    const doc = { conns };

    updateHandler(update, null, doc);

    assert(conn.isClosed === false);
    assert.deepStrictEqual(deleted, []);
    assert.deepStrictEqual(update, conn.message.slice(-2));
  });

  it('Test updateHandler closes first', () => {
    const conn1 = {
      isClosed: false,
      message: null,
      readyState: 42, // unknown code, causes to close
      has() {
        return true;
      },
      close() {
        this.isClosed = true;
      },
      send(m) {
        this.message = m;
      },
    };
    const conn2 = { ...conn1 }; // clone conn1 into conn2

    // We have multiple connections here
    const fe = (func) => {
      func(null, conn1);
      func(null, conn2);
    };

    const deleted = [];
    const conns = {
      forEach: fe,
      has(c) {
        return c === conn1 || c === conn2;
      },
      get: () => 123,
      delete(id) { deleted.push(id); },
    };

    const update = new Uint8Array([99, 98, 97, 96]);
    const doc = { conns };

    updateHandler(update, null, doc);

    assert(conn1.isClosed === true);
    assert(conn2.isClosed === true);
    assert.deepStrictEqual(deleted, [conn1, conn2]);
    assert.deepStrictEqual(update, conn1.message.slice(-4));
    assert.deepStrictEqual(update, conn2.message.slice(-4));
  });

  it('Test WSSharedDoc', () => {
    const doc = new WSSharedDoc('hello');
    assert.equal(doc.name, 'hello');
    assert.equal(doc.awareness.getLocalState(), null);

    const conn = {
      isClosed: false,
      message: null,
      readyState: 1, // wsReadyStateOpen
      has() {
        return true;
      },
      close() {
        this.isClosed = true;
      },
      send(m) {
        this.message = m;
      },
    };

    doc.conns.set(conn, 'conn1');
    doc.awareness.setLocalState('foo');
    assert(conn.isClosed === false);
    const fooAsUint8Arr = new Uint8Array(['f'.charCodeAt(0), 'o'.charCodeAt(0), 'o'.charCodeAt(0)]);
    assert(isSubArray(conn.message, fooAsUint8Arr));
  });
});
