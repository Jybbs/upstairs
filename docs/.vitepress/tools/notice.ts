/**
 * Posts the outputs a workflow's jobs set on the pull request its run checks,
 * editing the comment an earlier run posted rather than adding another.
 */
import { $ } from 'bun'

import { filledOf, needsOf, templateOf, type Needs } from './logbook.ts'

interface Comment {
  body : string
  id   : number
  user : { login: string }
}

interface Thread {
  comments : string
  edits    : string
  needs    : Needs
  template : string
}

/**
 * The login GitHub gives the workflow token, which posts every notice.
 */
const AUTHOR = 'github-actions[bot]'

/**
 * The notice an earlier run posted, meaning the comment of `author` opening on
 * the line `body` opens on.
 */
export const postedOf = (body: string, comments: Comment[], author = AUTHOR) => {
  const [heading] = body.split('\n')
  return comments.find(comment => comment.user.login === author && comment.body.split('\n')[0] === heading)
}

/**
 * Reads the comments endpoint of the pull request a run checks, the endpoint
 * a comment is edited through, the `needs` context, and the notice template
 * named for the workflow from the variables GitHub Actions sets for a step.
 */
export const threadOf = (env: NodeJS.ProcessEnv): Thread => {
  const issues = `repos/${env.GITHUB_REPOSITORY}/issues`
  return {
    comments : `${issues}/${env.GITHUB_REF?.split('/')[2]}/comments`,
    edits    : `${issues}/comments`,
    needs    : needsOf(env),
    template : templateOf(env, 'comments')
  }
}

/**
 * The arguments to `gh api` that edit `posted` to read `body`, or else post
 * `body` as a new comment on the pull request.
 */
export const requestOf = (thread: Thread, body: string, posted?: Comment) => posted
  ? ['--method', 'PATCH', `${thread.edits}/${posted.id}`, '--raw-field', `body=${body}`]
  : [thread.comments, '--raw-field', `body=${body}`]

if (import.meta.main) {
  const thread   = threadOf(process.env)
  const body     = filledOf(await Bun.file(thread.template).text(), thread.needs)
  const comments = (await $`gh api --paginate --slurp ${thread.comments}`.json()).flat()
  await $`gh api ${requestOf(thread, body, postedOf(body, comments))}`
}
