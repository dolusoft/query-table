import { selectorRule } from './selector-rule.mjs'

const localUnits =
  'Iterate UTF-16 code units with an index (semantics.md#text).'

// The local evaluator (tr-1): what no-restricted-properties cannot see.
export default {
  meta: { name: 'fences' },
  rules: {
    'tr1-local-syntax': selectorRule(
      'The local evaluator walks UTF-16 code units and counts the calendar by hand (tr-1).',
      [
        { selector: 'ForOfStatement', message: localUnits },
        {
          selector:
            "VariableDeclarator[id.type='ObjectPattern'][init.type='MemberExpression'][init.property.name='prototype']",
          message: 'Do not take methods off a prototype (semantics.md#text).'
        },
        {
          selector:
            "NewExpression[callee.name='Date'], CallExpression[callee.name='Date']",
          message:
            'tr-1 checks and counts the calendar by hand (semantics.md#time).'
        },
        {
          selector:
            'ArrayExpression > SpreadElement, CallExpression > SpreadElement',
          message: `A spread splits a string by code point. ${localUnits}`
        }
      ]
    )
  }
}
