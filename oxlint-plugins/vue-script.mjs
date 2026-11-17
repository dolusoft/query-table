// Vue script checks that neither oxlint nor the type check makes (spec O5/N3).
// They read the script only; nothing here asks what the template uses.
//
//   no-ref-as-condition        a ref (always truthy) tested instead of its .value
//   no-mutating-props          a prop changed in place: props.a.b = x, props.a.push(x)
//                              (props.a = x is a type error already)
//   require-valid-default-prop an object or array default that is not a factory,
//                              or a literal default of another type than the prop

const refFactories = new Set([
  'ref',
  'shallowRef',
  'computed',
  'toRef',
  'customRef'
])
const mutatingMethods = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin'
])

/**
 * The bindings imported from 'vue', as variables: a named import mapped to
 * the imported name, and namespace imports (`import * as vue`). A call is
 * resolved through scopes, so a parameter that shadows `ref` is not Vue's.
 */
const vueImports = context => {
  const named = new Map()
  const namespaces = new Set()
  return {
    /** The Vue export a call calls (`ref(x)`, `vue.ref(x)`), or null. */
    called(node) {
      if (node?.type !== 'CallExpression') {
        return null
      }
      const callee = node.callee
      if (callee.type === 'Identifier') {
        return named.get(resolve(context, callee)) ?? null
      }
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        namespaces.has(resolve(context, callee.object))
      ) {
        return callee.property.name
      }
      return null
    },
    ImportDeclaration(node) {
      if (node.source.value !== 'vue') {
        return
      }
      for (const specifier of node.specifiers) {
        const variable = declared(context, specifier, specifier.local.name)
        if (specifier.type === 'ImportSpecifier') {
          named.set(
            variable,
            specifier.imported.name ?? specifier.imported.value
          )
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaces.add(variable)
        }
      }
    }
  }
}

/** The variable an identifier refers to, following scopes (null for globals). */
const resolve = (context, identifier) => {
  let scope = context.sourceCode.getScope(identifier)
  while (scope) {
    const variable = scope.set.get(identifier.name)
    if (variable) {
      return variable
    }
    scope = scope.upper
  }
  return null
}

/** The variables a declarator or parameter pattern declares, by name. */
const declared = (context, node, name) =>
  context.sourceCode
    .getDeclaredVariables(node)
    .find(variable => variable.name === name) ?? null

const calleeName = node =>
  node?.type === 'CallExpression' && node.callee.type === 'Identifier'
    ? node.callee.name
    : null

const noRefAsCondition = {
  meta: {
    type: 'problem',
    docs: { description: 'A ref is always truthy: test its .value.' },
    schema: [],
    messages: {
      ref: '"{{name}}" is a ref and always truthy: use {{name}}.value.'
    }
  },
  create(context) {
    const imports = vueImports(context)
    const refs = new Set()
    const candidates = new Set()
    const check = node => {
      if (!node) {
        return
      }
      if (node.type === 'LogicalExpression') {
        check(node.left)
        check(node.right)
        return
      }
      // Decided at the end: a ref may be declared after a function that
      // tests it.
      if (node.type === 'Identifier') {
        candidates.add(node)
      }
    }
    const test = node => check(node.test)
    return {
      // Imports first, wherever they stand in the file.
      Program(node) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            imports.ImportDeclaration(statement)
          }
        }
      },
      'Program:exit'() {
        for (const node of candidates) {
          if (refs.has(resolve(context, node))) {
            context.report({
              node,
              messageId: 'ref',
              data: { name: node.name }
            })
          }
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          refFactories.has(imports.called(node.init))
        ) {
          refs.add(declared(context, node, node.id.name))
        }
      },
      IfStatement: test,
      WhileStatement: test,
      DoWhileStatement: test,
      ForStatement: test,
      ConditionalExpression: test,
      UnaryExpression(node) {
        if (node.operator === '!') {
          check(node.argument)
        }
      },
      LogicalExpression(node) {
        check(node.left)
      }
    }
  }
}

/** Options a Vue component object may carry besides `setup`. */
const componentOptionNames = new Set([
  'props',
  'emits',
  'components',
  'directives',
  'template',
  'render',
  'data',
  'computed',
  'methods',
  'watch',
  'inject',
  'provide',
  'expose',
  'slots',
  'name'
])

/**
 * Whether an object is the options of a Vue component: the argument of
 * defineComponent(), the default export of a .vue file, or an object with
 * component options besides `setup`.
 */
const isComponentOptions = (context, object) => {
  if (object?.type !== 'ObjectExpression') {
    return false
  }
  const parent = object.parent
  if (
    parent?.type === 'CallExpression' &&
    calleeName(parent) === 'defineComponent' &&
    parent.arguments[0] === object
  ) {
    return true
  }
  if (
    parent?.type === 'ExportDefaultDeclaration' &&
    context.filename.endsWith('.vue')
  ) {
    return true
  }
  return object.properties.some(
    property =>
      property.type === 'Property' &&
      componentOptionNames.has(propertyName(property))
  )
}

/** Option groups whose methods run with the component as `this`. */
const methodGroups = new Set(['methods', 'computed', 'watch'])

/**
 * The component options a method belongs to: a method of the options
 * (`mounted() {}`), of a group (`methods: { add() {} }`), or of a computed
 * or watch entry (`computed: { x: { get() {} } }`). Null for any other
 * object's method.
 */
const methodComponent = (context, fn) => {
  const path = []
  let node = fn
  while (path.length < 3) {
    const property = node.parent
    const object = property?.parent
    if (
      property?.type !== 'Property' ||
      property.value !== node ||
      object?.type !== 'ObjectExpression'
    ) {
      return null
    }
    path.unshift(propertyName(property))
    if (isComponentOptions(context, object)) {
      const fits =
        path.length === 1 ||
        (path.length === 2 && methodGroups.has(path[0])) ||
        (path.length === 3 && (path[0] === 'computed' || path[0] === 'watch'))
      return fits ? object : null
    }
    node = object
  }
  return null
}

/** The props object of a component: defineProps() or setup(props). */
const isDefineProps = node => {
  const name = calleeName(node)
  if (name === 'withDefaults') {
    return isDefineProps(node.arguments[0])
  }
  return name === 'defineProps'
}

const noMutatingProps = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Props are owned by the parent: do not change them in place.'
    },
    schema: [],
    messages: {
      mutate:
        'The prop "{{name}}" is changed in place; emit an event or copy it.'
    }
  },
  create(context) {
    // Whole-props objects (props.a.b) and destructured props (a.b), as
    // variables so that a shadowing parameter of the same name is not a prop.
    const objects = new Set()
    const destructured = new Set()
    /** The names an Options API component declares in `props`. */
    const optionProps = component => {
      const props = component.properties.find(
        property =>
          property.type === 'Property' && propertyName(property) === 'props'
      )?.value
      if (props?.type === 'ArrayExpression') {
        return props.elements
          .filter(element => typeof element?.value === 'string')
          .map(element => element.value)
      }
      if (props?.type === 'ObjectExpression') {
        return props.properties
          .filter(property => property.type === 'Property')
          .map(propertyName)
      }
      return []
    }
    /** The component options a `this` belongs to, or null. */
    const thisComponent = node => {
      let current = node.parent
      while (current) {
        if (current.type === 'FunctionExpression') {
          return methodComponent(context, current)
        }
        if (
          current.type === 'FunctionDeclaration' ||
          current.type === 'ClassBody'
        ) {
          return null
        }
        current = current.parent
      }
      return null
    }
    /** The prop a member chain changes, or null. */
    const propOf = (node, minDepth) => {
      let depth = 0
      let current = node
      while (current.type === 'MemberExpression') {
        depth++
        current = current.object
      }
      const firstProperty = () => {
        let first = node
        while (first.object.type === 'MemberExpression') {
          first = first.object
        }
        return first.property.name ?? first.property.value
      }
      if (current.type === 'ThisExpression') {
        if (depth < minDepth + 1) {
          return null
        }
        const component = thisComponent(current)
        const name = firstProperty()
        return component && optionProps(component).includes(name) ? name : null
      }
      if (current.type !== 'Identifier') {
        return null
      }
      const variable = resolve(context, current)
      if (objects.has(variable) && depth >= minDepth + 1) {
        return firstProperty() ?? current.name
      }
      if (destructured.has(variable) && depth >= minDepth) {
        return current.name
      }
      return null
    }
    const report = (node, name) => {
      if (name) {
        context.report({ node, messageId: 'mutate', data: { name } })
      }
    }
    const target = node =>
      node.type === 'MemberExpression' ? propOf(node, 1) : null
    return {
      VariableDeclarator(node) {
        if (!isDefineProps(node.init)) {
          return
        }
        if (node.id.type === 'Identifier') {
          objects.add(declared(context, node, node.id.name))
        } else if (node.id.type === 'ObjectPattern') {
          for (const property of node.id.properties) {
            const value =
              property.value?.type === 'AssignmentPattern'
                ? property.value.left
                : property.value
            if (value?.type === 'Identifier') {
              destructured.add(declared(context, node, value.name))
            }
          }
        }
      },
      // defineComponent({ setup(props) { ... } })
      Property(node) {
        const fn = node.value
        if (
          node.key.type === 'Identifier' &&
          node.key.name === 'setup' &&
          isComponentOptions(context, node.parent) &&
          (fn?.type === 'FunctionExpression' ||
            fn?.type === 'ArrowFunctionExpression')
        ) {
          const param = fn.params[0]
          if (param?.type === 'Identifier') {
            objects.add(declared(context, fn, param.name))
          } else if (param?.type === 'ObjectPattern') {
            // setup({ items }) { ... }
            for (const property of param.properties) {
              const value =
                property.value?.type === 'AssignmentPattern'
                  ? property.value.left
                  : property.value
              if (value?.type === 'Identifier') {
                destructured.add(declared(context, fn, value.name))
              }
            }
          }
        }
      },
      AssignmentExpression(node) {
        report(node, target(node.left))
      },
      UpdateExpression(node) {
        report(node, target(node.argument))
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          report(node, target(node.argument))
        }
      },
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          mutatingMethods.has(callee.property.name)
        ) {
          report(node, propOf(callee.object, 0))
        }
      }
    }
  }
}

const literalKind = node => {
  switch (node.type) {
    case 'ObjectExpression':
      return 'Object'
    case 'ArrayExpression':
      return 'Array'
    case 'TemplateLiteral':
      return 'String'
    case 'Literal':
      return typeof node.value === 'string'
        ? 'String'
        : typeof node.value === 'number'
          ? 'Number'
          : typeof node.value === 'boolean'
            ? 'Boolean'
            : null
    default:
      return null
  }
}

const isFunction = node =>
  node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

/**
 * The expressions a factory returns: `() => x`, or every `return x` of its
 * body, not counting the returns of functions nested in it.
 */
const factoryResults = fn => {
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body]
  }
  const results = []
  const walk = node => {
    if (!node || typeof node.type !== 'string') {
      return
    }
    if (
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'ClassBody'
    ) {
      return
    }
    if (node.type === 'ReturnStatement') {
      if (node.argument) {
        results.push(node.argument)
      }
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') {
        continue
      }
      const value = node[key]
      if (Array.isArray(value)) {
        value.forEach(walk)
      } else if (value && typeof value === 'object') {
        walk(value)
      }
    }
  }
  fn.body.body.forEach(walk)
  return results
}

const propertyName = property =>
  property.key?.type === 'Identifier' ? property.key.name : property.key?.value

const requireValidDefaultProp = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'An object or array default must be a factory, and a literal default must match the prop type.'
    },
    schema: [],
    messages: {
      factory:
        'The default of "{{name}}" is a shared {{kind}}: return it from a function (() => ...).',
      type: 'The default of "{{name}}" is a {{kind}}, but the prop is {{types}}.'
    }
  },
  create(context) {
    const checkDefault = (name, value, types) => {
      if (isFunction(value)) {
        // A factory: what it returns must match the prop type, unless the
        // prop is a function itself.
        for (const returned of factoryResults(value)) {
          const kind = literalKind(returned)
          if (
            kind &&
            types &&
            !types.includes('Function') &&
            !types.includes(kind)
          ) {
            context.report({
              node: returned,
              messageId: 'type',
              data: { name, kind, types: types.join(' | ') }
            })
          }
        }
        return
      }
      const kind = literalKind(value)
      if (kind === 'Object' || kind === 'Array') {
        context.report({
          node: value,
          messageId: 'factory',
          data: { name, kind: kind.toLowerCase() }
        })
      } else if (kind && types && !types.includes(kind)) {
        context.report({
          node: value,
          messageId: 'type',
          data: { name, kind, types: types.join(' | ') }
        })
      }
    }
    /** Runtime props: { a: { type: String, default: 'x' } }. */
    const checkRuntime = object => {
      for (const property of object.properties) {
        if (
          property.type !== 'Property' ||
          property.value.type !== 'ObjectExpression'
        ) {
          continue
        }
        const options = new Map(
          property.value.properties
            .filter(option => option.type === 'Property')
            .map(option => [propertyName(option), option.value])
        )
        const type = options.get('type')
        const value = options.get('default')
        if (!type || !value) {
          continue
        }
        const types = (type.type === 'ArrayExpression' ? type.elements : [type])
          .filter(element => element?.type === 'Identifier')
          .map(element => element.name)
        checkDefault(propertyName(property), value, types.length ? types : null)
      }
    }
    return {
      CallExpression(node) {
        const name = calleeName(node)
        if (
          name === 'defineProps' &&
          node.arguments[0]?.type === 'ObjectExpression'
        ) {
          checkRuntime(node.arguments[0])
        }
        // withDefaults(defineProps<T>(), { a: [] }): the type check sees the
        // type, not that the array is shared between instances.
        if (
          name === 'withDefaults' &&
          node.arguments[1]?.type === 'ObjectExpression'
        ) {
          for (const property of node.arguments[1].properties) {
            if (property.type === 'Property') {
              checkDefault(propertyName(property), property.value, null)
            }
          }
        }
      },
      // defineComponent({ props: { ... } })
      Property(node) {
        if (
          propertyName(node) === 'props' &&
          node.value.type === 'ObjectExpression' &&
          isComponentOptions(context, node.parent)
        ) {
          checkRuntime(node.value)
        }
      }
    }
  }
}

export default {
  meta: { name: 'vue-script' },
  rules: {
    'no-ref-as-condition': noRefAsCondition,
    'no-mutating-props': noMutatingProps,
    'require-valid-default-prop': requireValidDefaultProp
  }
}
