/**
 * ghost/demo-adapter.js — DemoAdapter: ChatAdapter facade over the Ghost Tape.
 * (OPERATION NIGHTSHIFT, builder B5)
 *
 * WHAT/WHY: The shipped default ChatAdapter (arch §4). connect()/disconnect()
 *       start/stop tape.js's scheduler; everything downstream is bus-only,
 *       adapter-agnostic.
 * GOTCHA: tape.start()/stop() are already idempotent, so this stays a dumb
 *       pass-through on purpose.
 */

import { tape } from './tape.js';

let connected = false;

/** @type {import('../core/contracts.js').ChatAdapter} */
export const demoAdapter = {
  name: 'demo',
  get connected() { return connected; },
  connect() {
    connected = true;
    tape.start();
  },
  disconnect() {
    connected = false;
    tape.stop();
  },
};
