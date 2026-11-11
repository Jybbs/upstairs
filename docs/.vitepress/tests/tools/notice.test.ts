import { describe, expect, it } from 'vitest'

import { postedOf, threadOf } from '../../tools/notice.ts'

const HEADING = '## 🔍 Preview'
const BODY    = `${HEADING}\n\nThe site is published at https://20-previews.upstairs-7as.pages.dev.`

const comment = (id: number, body: string, login = 'github-actions[bot]') => ({ body, id, user: { login } })

describe('postedOf', () => {
  it.each([
    ['the workflow token’s comment on the same heading', [comment(1, `${HEADING}\n\nAn old address.`)], 1],
    ['the first such comment of several', [comment(2, BODY), comment(3, BODY)], 2],
    ['no comment on another heading', [comment(4, '## 🛰️ CI\n\nA summary.')], undefined],
    ['no comment a person posted', [comment(5, BODY, 'someone')], undefined]
  ])('finds %s', (_, comments, id) =>
    expect(postedOf(BODY, comments)?.id).toBe(id))
})

describe('threadOf', () => {
  it('reads the pull request’s comments endpoint and the template named for the workflow', () =>
    expect(threadOf({
      GITHUB_REF          : 'refs/pull/20/merge',
      GITHUB_REPOSITORY   : 'Jybbs/upstairs',
      GITHUB_WORKFLOW_REF : 'Jybbs/upstairs/.github/workflows/deploy.yml@refs/pull/20/merge',
      NEEDS               : '{"preview":{"outputs":{"alias":"https://a.pages.dev"},"result":"success"}}'
    })).toEqual({
      comments : 'repos/Jybbs/upstairs/issues/20/comments',
      edits    : 'repos/Jybbs/upstairs/issues/comments',
      needs    : { preview: { outputs: { alias: 'https://a.pages.dev' }, result: 'success' } },
      template : '.github/scripts/comments/deploy.md'
    }))
})
