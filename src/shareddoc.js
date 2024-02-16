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
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';

import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';
import debounce from 'lodash/debounce.js';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

// disable gc when using snapshots!
const gcEnabled = false;

const persistence = {
  bindState: async (docName, ydoc, conn) => {
    const persistedYdoc = new Y.Doc();
    const aemMap = persistedYdoc.getMap('aem');
    const initalOpts = {};
    if (conn.auth) {
      initalOpts.headers = new Headers({ Authorization: conn.auth });
    }
    const initialReq = await fetch(docName, initalOpts);
    if (initialReq.ok) {
      aemMap.set('initial', await initialReq.text());
    } else if (initialReq.status === 404) {
      aemMap.set('initial', '');
    } else {
      // eslint-disable-next-line no-console
      console.log(`unable to get resource: ${initialReq.status} - ${initialReq.statusText}`);
      throw new Error(`unable to get resource - status: ${initialReq.status}`);
    }

    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    let last = aemMap.get('initial');
    ydoc.on('update', debounce(async () => {
      try {
        const content = ydoc.getMap('aem').get('content');
        if (last !== content) {
          last = content;
          const blob = new Blob([content], { type: 'text/html' });

          const formData = new FormData();
          formData.append('data', blob);

          const opts = { method: 'PUT', body: formData };
          const auth = Array.from(ydoc.conns.keys())
            .map((con) => con.auth);

          if (auth.length > 0) {
            opts.headers = new Headers({ Authorization: [...new Set(auth)].join(',') });
          }

          const put = await fetch(docName, opts);
          if (!put.ok) {
            throw new Error(`${put.status} - ${put.statusText}`);
          }
          // eslint-disable-next-line no-console
          console.log(content);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        ydoc.emit('error', [err]);
      }
    }, 2000, 10000));
  },
};

const docs = new Map();

const messageSync = 0;
const messageAwareness = 1;

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  conn.close();
};

const send = (doc, conn, m) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
  }
  try {
    conn.send(m, (err) => err != null && closeConn(doc, conn));
  } catch (e) {
    closeConn(doc, conn);
  }
};

export const updateHandler = (update, _origin, doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
};

export class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: gcEnabled });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = (this.conns.get(conn));
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => {
            connControlledIDs.add(clientID);
          });
          removed.forEach((clientID) => {
            connControlledIDs.delete(clientID);
          });
        }
      }
      // broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol
        .encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };
    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);
  }
}

const getYDoc = async (docname, conn, gc = true) => {
  let doc = docs.get(docname);
  if (doc === undefined) {
    doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
      await persistence.bindState(docname, doc, conn);
    }
    docs.set(docname, doc);
  }
  return doc;
};

export const getYDocIfPresent = (docname) => docs.get(docname);

const messageListener = (conn, doc, message) => {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        // If the `encoder` only contains the type of reply message and no
        // message, there is no need to send the message. When `encoder` only
        // contains the type of reply, its length is 1.
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness: {
        awarenessProtocol
          .applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    doc.emit('error', [err]);
  }
};

export const setupWSConnection = async (conn, docName) => {
  // eslint-disable-next-line no-param-reassign
  conn.binaryType = 'arraybuffer';
  // get doc, initialize if it does not exist yet
  const doc = await getYDoc(docName, conn, true);

  doc.conns.set(conn, new Set());
  // listen and reply to events
  conn.addEventListener('message', (message) => messageListener(conn, doc, new Uint8Array(message.data)));

  // Check if connection is still alive
  conn.addEventListener('close', () => {
    closeConn(doc, conn);
  });
  // put the following in a variables in a block so the interval handlers don't keep in in
  // scope
  {
    // send sync step 1
    let encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol
        .encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
      send(doc, conn, encoding.toUint8Array(encoder));
    }
  }
};
