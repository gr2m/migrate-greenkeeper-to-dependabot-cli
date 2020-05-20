# Migrate Greenkeeper to Dependabot

> CLI to migrate all repositories for a given owner

## Background

[Greenkeeper](https://greenkeeper.io/) was acquired and will stop working after June 3rd.

If you plan to migrate your repositories to GitHub's own [Dependabot](https://dependabot.com/), then this CLI is for you.

There are a few trade-offs to consider

- Dependabot has been created with a focus on apps, not libraries. By default, Dependabot sends updates for all dependency updates, including updates that are within the range of what's defined in `package.json`'s "dependencies" and "devDependencies". There will be many more pull requests coming from Dependabot compared to Greenkeeper
- One of my favorite features of Greenkeeper is live monitoring of in-range dependency updates. It creates a branch, which triggers the CI but does not create any notifications. If CI passes, the branch is deleted again. But if it fails, Greenkeeper creates an issues, so the maintainers can pin the version of the affected dependency, in order to prevent sudden breaking changes for its dependands. See https://greenkeeper.io/docs.html#greenkeeper-step-by-step
- Starting with the upcoming [Dependabot v2](https://dependabot.com/docs/config-file-beta/), live updates will no longer be supported. All updates must happen on a defined schedule.

## Usage

Create a personal access token at https://github.com/settings/tokens/new?scopes=repo

```
GITHUB_TOKEN=... npx migrate-greenkeeper-to-dependabot --owner octokit
```

## What it does

I've made this script for my specific needs. If you have different needs, I suggest you fork it, I'm not sure if it's worth sending pull requests for a one-of CLI, but do what yuo think is best :)

1. Looks for all repositories for the provided `owner`
2. In each repository it looks for a Greenkeeper badge. If it doesn't find one, the repository is ignored.
3. For each remaining repository, it creates a pull request with the following changes

   1. It removes the Greenkeeper badge
   2. It updates Action workflow files. It looks for the `on.push.branches` array. If it finds any string starting with `greenkeeper/...`, it replaces it with `dependabot/npm_and_yarn/...`
   3. It creates a `.github/dependabot.yml` file with the following configuration

      ```yml
      version: 2
      updates:
        - package-ecosystem: "npm"
          directory: "/"
          schedule:
            interval: "daily"
          labels:
            - "maintenance"
      ```

   4. It adds a "maintenance" label on the pull request

## LICENSE

[ISC](LICENSE)
