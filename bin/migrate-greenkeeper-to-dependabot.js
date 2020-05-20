const {
  argv: { owner },
} = require("yargs");
const yaml = require("js-yaml");
const { Octokit: Core } = require("@octokit/core");
const { paginateRest } = require("@octokit/plugin-paginate-rest");
const createPullRequest = require("octokit-create-pull-request");
const prettier = require("prettier");

if (!process.env.GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN must be set");
}

if (!owner) {
  throw new Error("--owner argument required");
}

const REGEX_GREENKEEPER_BADGE = /\[!\[[^\]]+\]\(https:\/\/badges.greenkeeper.io[^)]+\)\]\(https:\/\/greenkeeper.io\/\)/;
const DEPENDABOT_CONFIG = prettier.format(
  `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    labels:
      - "maintenance"`,
  { parser: "yaml" }
);

run().catch(console.error);

async function run() {
  const Octokit = Core.plugin(paginateRest, createPullRequest);
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const reposToMigrate = [];

  for await (const response of octokit.paginate.iterator(
    "GET /orgs/:org/repos",
    {
      org: owner,
    }
  )) {
    const repositoryNames = response.data.map((repository) => repository.name);

    for (const repo of repositoryNames) {
      console.log(`checking ${owner}/${repo} README ...`);
      const { data } = await octokit.request("GET /repos/:owner/:repo/readme", {
        owner: owner,
        repo,
      });

      const content = Buffer.from(data.content, "base64").toString();
      if (/badges.greenkeeper.io/.test(content)) {
        reposToMigrate.push({
          repo,
          readme: {
            path: "",
            content: prettier.format(
              content.replace(REGEX_GREENKEEPER_BADGE, ""),
              {
                parser: "markdown",
              }
            ),
          },
        });
      } else {
        console.log("no Greenkeeper badge found");
      }
    }
  }

  for (const { repo, readme } of reposToMigrate) {
    // get GitHub Action Workflow files
    console.log(`Getting workflow files for ${owner}/${repo}`);
    const { data: files } = await octokit
      .request("GET /repos/:owner/:repo/contents/:path", {
        owner: owner,
        repo,
        path: ".github/workflows",
      })
      .catch(() => {
        console.log(`Now workflow files found`);
        return { data: [] };
      });

    const workflowFiles = {};

    for (const file of files) {
      if (/\.ya?ml$/.test(file.name)) {
        const path = `.github/workflows/${file.name}`;
        const { data } = await octokit.request(
          "GET /repos/:owner/:repo/contents/:path",
          {
            owner: owner,
            repo,
            path,
          }
        );

        const workflow = yaml.safeLoad(
          Buffer.from(data.content, "base64").toString()
        );

        if (!workflow.on.push || !workflow.on.push.branches) {
          console.log(
            `.github/workflows/${file.name} has no on.push.branches setting`
          );
          continue;
        }

        if (
          !workflow.on.push.branches.find((branch) =>
            /^greenkeeper/.test(branch)
          )
        ) {
          console.log(
            `${path} has no on.push.branches for Greenkeeper branches`
          );
          continue;
        }

        workflow.on.push.branches = workflow.on.push.branches.map((branch) => {
          return branch.replace(/^greenkeeper/, "dependabot/npm_and_yarn");
        });
        workflowFiles[path] = prettier.format(yaml.safeDump(workflow), {
          parser: "yaml",
        });
      }
    }

    console.log("creating pull request ...");
    const { data: pullRequest } = await octokit.createPullRequest({
      owner,
      repo,
      title: "Replace Greenkeeper with Dependabot",
      body:
        "Follow up to https://github.com/octokit/create-octokit-project.js/issues/16",
      head: "replace-greenkeeper-with-dependabot",
      changes: {
        files: {
          "README.md": readme.content,
          ".github/dependabot.yml": DEPENDABOT_CONFIG,
          ...workflowFiles,
        },
        commit: "ci: replace Greenkeeper with Dependabot",
      },
    });

    console.log('adding "maintenance" label');
    await octokit.request(
      "POST /repos/:owner/:repo/issues/:issue_number/labels",
      {
        owner,
        repo,
        issue_number: pullRequest.number,
        labels: ["maintenance"],
      }
    );

    console.log(`Pull Request: ${pullRequest.html_url}`);
  }
}
