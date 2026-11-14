// Join class names, dropping falsy values.
// Small on purpose: the project has no `clsx` dependency and does not need one.
export const cn = (...classes) => classes.filter(Boolean).join(' ')

export default cn
