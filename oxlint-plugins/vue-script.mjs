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

/** Local names imported from 'vue', mapped to the imported name. */
const vueImports = () => {
  const names = new Map()
  return {
    names,
    ImportDeclaration(node) {
      if (node.source.value !== 'vue') {
        return
      }
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          names.set(specifier.local.name, specifier.imported.name)
        }
      }
    }
  }
}

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
    const imports = vueImports()
    const refs = new Set()
    const reported = new Set()
    const check = node => {
      if (!node) {
        return
      }
      if (node.type === 'LogicalExpression') {
        check(node.left)
        check(node.right)
        return
      }
      if (
        node.type === 'Identifier' &&
        refs.has(node.name) &&
        !reported.has(node)
      ) {
        reported.add(node)
        context.report({ node, messageId: 'ref', data: { name: node.name } })
      }
    }
    const test = node => check(node.test)
    return {
      ImportDeclaration: imports.ImportDeclaration,
      VariableDeclarator(node) {
        const name = calleeName(node.init)
        if (
          node.id.type === 'Identifier' &&
          refFactories.has(imports.names.get(name))
        ) {
          refs.add(node.id.name)
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
    // Whole-props objects (props.a.b) and destructured props (a.b).
    const objects = new Set()
    const destructured = new Set()
    /** The prop a member chain changes, or null. */
    const propOf = (node, minDepth) => {
      let depth = 0
      let current = node
      while (current.type === 'MemberExpression') {
        depth++
        current = current.object
      }
      if (current.type !== 'Identifier') {
        return null
      }
      if (objects.has(current.name) && depth >= minDepth + 1) {
        let first = node
        while (first.object.type === 'MemberExpression') {
          first = first.object
        }
        return first.property.name ?? current.name
      }
      if (destructured.has(current.name) && depth >= minDepth) {
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
          objects.add(node.id.name)
        } else if (node.id.type === 'ObjectPattern') {
          for (const property of node.id.properties) {
            const value =
              property.value?.type === 'AssignmentPattern'
                ? property.value.left
                : property.value
            if (value?.type === 'Identifier') {
              destructured.add(value.name)
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
          (fn?.type === 'FunctionExpression' ||
            fn?.type === 'ArrowFunctionExpression') &&
          fn.params[0]?.type === 'Identifier'
        ) {
          objects.add(fn.params[0].name)
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
          node.parent?.type === 'ObjectExpression' &&
          node.parent.parent?.type === 'CallExpression' &&
          calleeName(node.parent.parent) === 'defineComponent'
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
