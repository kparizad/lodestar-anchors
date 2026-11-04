# Lodestar public anchors

Each file in `anchors/` records Lodestar's newest log hashes on that day. Git history
and GitHub's commit times show when each hash was published. Every hour a workflow
checks that the hashes published earlier are still in the live log, and that the site
is up. A failed run means one of those checks needs attention.

What this proves: rows covered by a published hash can't be rewritten or deleted later
without the check failing. What it doesn't prove: that a model works, or anything about
rows logged after the newest anchor. Outcomes and the paper journal aren't hash-chained.
