import path from 'path';
import { remove, pathExists, readJSON, writeJSON } from 'fs-extra';
import prompts from 'prompts';

import { getOptionsOrPrompt } from './utils/options';
import { executeCLIStep } from './utils/cli-step';
import { exec } from '../code/lib/cli/src/repro-generators/scripts';
import type { Parameters } from '../code/lib/cli/src/repro-generators/configs';
import { getInterpretedFile } from '../code/lib/core-common';
import { readConfig, writeConfig } from '../code/lib/csf-tools';
import { babelParse } from '../code/lib/csf-tools/src/babelParse';

const frameworks = ['react', 'angular'];
const addons = ['a11y', 'storysource'];
const examplesDir = path.resolve(__dirname, '../examples');
const codeDir = path.resolve(__dirname, '../code');

async function getOptions() {
  return getOptionsOrPrompt('yarn example', {
    framework: {
      description: 'Which framework would you like to use?',
      values: frameworks,
      required: true as const,
    },
    addon: {
      description: 'Which extra addons (beyond the CLI defaults) would you like installed?',
      values: addons,
      multiple: true as const,
    },
    includeStories: {
      description: "Include Storybook's own stories?",
      promptType: (_, { framework }) => framework === 'react',
    },
    create: {
      description: 'Create the example from scratch (rather than degitting it)?',
    },
    forceDelete: {
      description: 'Always delete an existing example, even if it has the same configuration?',
      promptType: false,
    },
    forceReuse: {
      description: 'Always reuse an existing example, even if it has a different configuration?',
      promptType: false,
    },
    link: {
      description: 'Link the storybook to the local code?',
      inverse: true,
    },
    start: {
      description: 'Start the example Storybook?',
      inverse: true,
    },
    build: {
      description: 'Build the example Storybook?',
    },
    watch: {
      description: 'Start building used packages in watch mode as well as the example Storybook?',
    },
    dryRun: {
      description: "Don't execute commands, just list them (dry run)?",
    },
  });
}

const steps = {
  repro: {
    command: 'repro',
    description: 'Bootstrapping example',
    icon: '👷',
    hasArgument: true,
    options: {
      template: { values: frameworks },
      e2e: {},
    },
  },
  add: {
    command: 'add',
    description: 'Adding addon',
    icon: '+',
    hasArgument: true,
    options: {},
  },
  link: {
    command: 'link',
    description: 'Linking packages',
    icon: '🔗',
    hasArgument: true,
    options: { local: {}, start: { inverse: true } },
  },
  build: {
    command: 'build',
    description: 'Building example',
    icon: '🔨',
    options: {},
  },
  dev: {
    command: 'dev',
    description: 'Starting example',
    icon: '🖥 ',
    options: {},
  },
};

const logger = console;

const addPackageScripts = async ({
  cwd,
  scripts,
}: {
  cwd: string;
  scripts: Record<string, string>;
}) => {
  logger.info(`🔢 Adding package resolutions:`);
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = await readJSON(packageJsonPath);
  packageJson.scripts = {
    ...packageJson.scripts,
    ...scripts,
  };
  await writeJSON(packageJsonPath, packageJson, { spaces: 2 });
};

async function main() {
  const optionValues = await getOptions();

  const { framework, forceDelete, forceReuse, link, dryRun } = optionValues;
  const cwd = path.join(examplesDir, framework as string);

  const exists = await pathExists(cwd);
  let shouldDelete = exists && !forceReuse;
  if (exists && !forceDelete && !forceReuse) {
    const relativePath = path.relative(process.cwd(), cwd);
    ({ shouldDelete } = await prompts({
      type: 'toggle',
      message: `${relativePath} already exists, should delete it and create a new one?`,
      name: 'shouldDelete',
      initial: false,
      active: 'yes',
      inactive: 'no',
    }));
  }

  if (exists && shouldDelete && !dryRun) await remove(cwd);

  if (!exists || shouldDelete) {
    await executeCLIStep(steps.repro, {
      argument: cwd,
      optionValues: { template: framework },
      cwd: examplesDir,
      dryRun,
    });

    // TODO -- sb add <addon> doesn't actually work properly:
    //   - installs in `deps` not `devDeps`
    //   - does a `workspace:^` install (what does that mean?)
    //   - doesn't add to `main.js`

    // eslint-disable-next-line no-restricted-syntax
    for (const addon of optionValues.addon as string[]) {
      const addonName = `@storybook/addon-${addon}`;
      // eslint-disable-next-line no-await-in-loop
      await executeCLIStep(steps.add, { argument: addonName, cwd, dryRun });
    }

    // TODO copy stories

    if (link) {
      await executeCLIStep(steps.link, {
        argument: cwd,
        cwd: codeDir,
        dryRun,
        optionValues: { local: true, start: false },
      });

      await addPackageScripts({
        cwd,
        scripts: {
          storybook:
            'NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" storybook dev -p 6006',
          'build-storybook':
            'NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" storybook build',
        },
      });
    }
  }

  const { start } = optionValues;
  if (start) {
    await exec(
      'yarn storybook',
      { cwd },
      {
        dryRun,
        startMessage: `⬆️  Starting Storybook`,
        errorMessage: `🚨 Starting Storybook failed`,
      }
    );
  } else {
    await executeCLIStep(steps.build, { cwd, dryRun });
    // TODO serve
  }

  // TODO start dev
}

main().catch((err) => console.error(err));
