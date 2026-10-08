/**
 * Every outward link MM3 prints, in one place. A message names a topic and gets its link from here, so when a topic
 * gets a page of its own (the website, say) the change is one line here and the wording elsewhere stays put.
 * Until a topic has a page that is live, it points at the repository, which always exists.
 */
const REPO_URL = 'https://github.com/mvp-scale/mm3';

export const LINKS = {
  /** Node older than 22.13, or missing: how to pin a supported Node for one project (docs/node-version.md in the repo). */
  nodeVersion: REPO_URL,
} as const;
