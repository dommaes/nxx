import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

import {
  formatFiles,
  generateFiles,
  logger,
  offsetFromRoot,
  readWorkspaceConfiguration,
  Tree,
  updateWorkspaceConfiguration,
} from '@nrwl/devkit';
import { setDefaultCollection } from '@nrwl/workspace/src/utilities/set-default-collection';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

import { InitGeneratorSchema } from './schema';

interface NormalizedSchema extends InitGeneratorSchema {
  gradleFileExtension: string;
  rootProjectName: string;
}

const normalizeOptions = (tree: Tree, options: InitGeneratorSchema): NormalizedSchema => {
  const gradleFileExtension = options.dsl === 'kotlin' ? '.kts' : '';
  const rootProjectName = options.rootProjectName ?? tree.root.substring(tree.root.lastIndexOf('/') + 1);

  return {
    ...options,
    gradleFileExtension,
    rootProjectName,
  };
};

const updateWorkspaceConfig = (tree: Tree, options: InitGeneratorSchema) => {
  const workspace = readWorkspaceConfiguration(tree);

  workspace.generators = workspace.generators ?? {};
  workspace.generators['@nxx/nx-gradle:application'] = {
    dsl: options.dsl,
    ...(workspace.generators['@nxx/nx-gradle:application'] ?? {}),
  };
  workspace.generators['@nxx/nx-gradle:library'] = {
    dsl: options.dsl,
    ...(workspace.generators['@nxx/nx-gradle:library'] ?? {}),
  };

  workspace.plugins = workspace.plugins ?? [];
  if (!workspace.plugins.includes('@nxx/nx-gradle')) {
    workspace.plugins.push('@nxx/nx-gradle');
  }

  updateWorkspaceConfiguration(tree, workspace);
  setDefaultCollection(tree, '@nxx/nx-gradle');
};

const execGradleWrapper = async (options: NormalizedSchema) => {
  logger.info('Creating Gradle wrapper with installed Gradle.');

  let gradleWrapperCommand = 'gradle wrapper';
  if (options.gradleVersion) {
    gradleWrapperCommand += ` --gradle-version ${options.gradleVersion}`;
  }

  const { stdout, stderr } = await promisify(exec)(gradleWrapperCommand);
  logger.info(stdout);
  logger.error(stderr);
};

const getTag = async (options: NormalizedSchema) => {
  if (options.gradleVersion) {
    return `v${options.gradleVersion}`;
  }

  const octokit = new Octokit({
    userAgent: '@nxx/nx-gradle',
    log: {
      debug: logger.debug,
      info: logger.info,
      warn: logger.warn,
      error: logger.error,
    },
  });

  return octokit.rest.repos.getLatestRelease({ owner: 'gradle', repo: 'gradle' }).then(({ data }) => data.tag_name);
};

const downloadFile = async (url: string) => {
  return fetch(url, { headers: { 'User-Agent': '@nxx/nx-gradle' } })
    .then((res) => res.arrayBuffer())
    .then((buffer) => Buffer.from(buffer));
};

const downloadGradleWrapper = async (options: NormalizedSchema) => {
  const tag = await getTag(options);

  const baseUrl = `https://raw.githubusercontent.com/gradle/gradle/${tag}`;

  const gradlew = await downloadFile(`${baseUrl}/gradlew`);
  const gradlewBat = await downloadFile(`${baseUrl}/gradlew.bat`);
  const gradleWrapperJar = await downloadFile(`${baseUrl}/gradle/wrapper/gradle-wrapper.jar`);
  const gradleWrapperProperties = await downloadFile(`${baseUrl}/gradle/wrapper/gradle-wrapper.properties`);

  return {
    gradlew,
    gradlewBat,
    gradleWrapperJar,
    gradleWrapperProperties,
  };
};

const createGradleWrapper = async (tree: Tree, options: NormalizedSchema) => {
  if (options.useInstalledGradle) {
    await execGradleWrapper(options);
    return;
  }

  logger.info('Downloading Gradle wrapper from GitHub.');

  const { gradlew, gradlewBat, gradleWrapperJar, gradleWrapperProperties } = await downloadGradleWrapper(options);

  tree.write('gradlew', gradlew, { mode: '775' });
  tree.write('gradlew.bat', gradlewBat);
  tree.write('gradle/wrapper/gradle-wrapper.jar', gradleWrapperJar);
  tree.write('gradle/wrapper/gradle-wrapper.properties', gradleWrapperProperties);
};

const addFiles = async (tree: Tree, options: NormalizedSchema) => {
  const templateOptions = {
    ...options,
    quote: options.dsl === 'kotlin' ? '"' : "'",
    offsetFromRoot: offsetFromRoot(tree.root),
    template: '',
  };

  generateFiles(tree, path.join(__dirname, 'files'), '', templateOptions);

  await createGradleWrapper(tree, options);
};

const updateGitIgnore = (tree: Tree) => {
  if (!tree.exists('.gitignore')) {
    logger.warn(`Couldn't find .gitignore file to update`);
    return;
  }

  let gitignore = tree.read('.gitignore', 'utf-8');

  ['.gradle', '!gradle-wrapper.jar'].forEach((entry) => {
    const regex = new RegExp(`^${entry}$`, 'gm');
    if (!regex.test(gitignore)) {
      gitignore = `${gitignore}\n${entry}\n`;
    }
  });

  tree.write('.gitignore', gitignore);
};

export const gradleInitGenerator = async (tree: Tree, options: InitGeneratorSchema) => {
  const normalizedOptions = normalizeOptions(tree, options);

  updateWorkspaceConfig(tree, normalizedOptions);
  updateGitIgnore(tree);

  await addFiles(tree, normalizedOptions);

  await formatFiles(tree);
};

export default gradleInitGenerator;
