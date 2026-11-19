/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // The standard Vue SFC shim: its empty props and `any` are what it means.
  // oxlint-disable-next-line typescript/no-empty-object-type, typescript/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}
