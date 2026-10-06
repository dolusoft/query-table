// shared/: the contract between the plugins (ADR 0003). A feature imports
// this folder and the protocol, never another feature.
export {
  currentReason,
  dispatch,
  markEmitted,
  onBeforeAction,
  runBeforeAction
} from './action'
export { dispose, onDispose } from './lifecycle'
export { hasRecord, isDisposed } from './registry'
export { type AnyColumn, type AnyTable, broad } from './broad'
