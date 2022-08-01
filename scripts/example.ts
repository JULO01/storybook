/* eslint-disable no-restricted-syntax, no-await-in-loop */
import path from 'path';
import {
  remove,
  pathExists,
  readJSON,
  writeJSON,
  ensureSymlink,
  readFile,
  writeFile,
  mkdir,
} from 'fs-extra';
import prompts from 'prompts';
import globby from 'globby';
import { transform } from 'esbuild';

import { getOptionsOrPrompt } from './utils/options';
import { executeCLIStep } from './utils/cli-step';
import { exec } from '../code/lib/cli/src/repro-generators/scripts';
import type { Parameters } from '../code/lib/cli/src/repro-generators/configs';
import { getInterpretedFile } from '../code/lib/core-common';
import { readConfig, writeConfig } from '../code/lib/csf-tools';
import { babelParse } from '../code/lib/csf-tools/src/babelParse';

const frameworks = ['react', 'angular'];
const addons = ['a11y', 'storysource'];
const defaultAddons = [
  'actions',
  'backgrounds',
  'controls',
  'docs',
  'highlight',
  'links',
  'interactions',
  'measure',
  'outline',
  'toolbars',
  'viewport',
];
const examplesDir = path.resolve(__dirname, '../examples');
const codeDir = path.resolve(__dirname, '../code');

// TODO -- how to encode this information
const renderersMap = { react: 'react', angular: 'angular' };
const isTSMap = { react: false, angular: true };

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

export const overrideMainConfig = async ({
  cwd,
  mainOverrides,
}: {
  cwd: string;
  mainOverrides: Parameters['mainOverrides'];
}) => {
  logger.info(`📝 Overwriting main.js with the following configuration:`);
  const configDir = path.join(cwd, '.storybook');
  const mainConfigPath = getInterpretedFile(path.resolve(configDir, 'main'));
  logger.debug(mainOverrides);
  const mainConfig = await readConfig(mainConfigPath);

  Object.keys(mainOverrides).forEach((field) => {
    // NOTE: using setFieldNode and passing the output of babelParse()
    mainConfig.setFieldNode([field], mainOverrides[field]);
  });

  await writeConfig(mainConfig);
};

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

async function copyStories(possibleFrom: string[], to: string) {
  await Promise.all(
    possibleFrom.map(async (from) => {
      if (!(await pathExists(from))) return;

      await ensureSymlink(from, to);
    })
  );
}

async function main() {
  const optionValues = await getOptions();

  const { framework, forceDelete, forceReuse, link, dryRun } = optionValues;
  const cwd = path.join(examplesDir, framework);

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

    // TODO -- this seems like it might be framework specific. Should we search for a folder?
    // or set it in the config somewhere?
    const storiesDir = path.resolve(cwd, './stories');

    // TODO -- can we get the options type to return something more specific
    const renderer = renderersMap[framework as 'react' | 'angular'];
    const isTS = isTSMap[framework as 'react' | 'angular'];
    const possiblePackageStoriesDir = isTS ? ['src/stories'] : ['dist/stories', 'dist/esm/stories'];

    // Copy over renderer stories
    const rendererDir = path.join(codeDir, 'renderers', renderer);
    await copyStories(
      possiblePackageStoriesDir.map((dir) => path.join(rendererDir, dir)),
      path.join(storiesDir, renderer)
    );

    // TODO -- sb add <addon> doesn't actually work properly:
    //   - installs in `deps` not `devDeps`
    //   - does a `workspace:^` install (what does that mean?)
    //   - doesn't add to `main.js`

    for (const addon of optionValues.addon) {
      const addonName = `@storybook/addon-${addon}`;
      await executeCLIStep(steps.add, { argument: addonName, cwd, dryRun });
    }

    for (const addon of [...defaultAddons, ...optionValues.addon]) {
      const addonStoriesDir = path.join(codeDir, 'addons', addon);

      await copyStories(
        possiblePackageStoriesDir.map((dir) => path.join(addonStoriesDir, dir)),
        path.join(storiesDir, `addon-${addon}`)
      );
    }

    if (link) {
      await executeCLIStep(steps.link, {
        argument: cwd,
        cwd: codeDir,
        dryRun,
        optionValues: { local: true, start: false },
      });

      // TODO -- work out exactly where this should happen
      const code = '(c) => ({ ...c, resolve: { ...c.resolve, symlinks: false } })';
      const mainOverrides = {
        // @ts-ignore (not sure why TS complains here, it does exist)
        webpackFinal: babelParse(code).program.body[0].expression,
      };
      await overrideMainConfig({ cwd, mainOverrides });

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
