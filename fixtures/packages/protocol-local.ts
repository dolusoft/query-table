// A consumer of the local evaluator (C-75): for now only its entry; PR-L1
// replaces this with a real evaluation once `applyQuery` lands.
import { profiles } from '@dolusoft/query-protocol/local'

document.body.textContent = JSON.stringify(profiles)
