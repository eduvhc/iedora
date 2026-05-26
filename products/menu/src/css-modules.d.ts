// Ambient declarations for CSS modules. Used by editorial-list and
// any future module-scoped CSS in this package. Without this, tsc
// errors with `Cannot find module './<x>.module.css'` because
// products/menu is no longer a Next app (the `next` TS plugin
// auto-injects this for Next apps; we declare it explicitly here).
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
