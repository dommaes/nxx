import {
  formatFiles,
  generateFiles,
  logger,
  offsetFromRoot,
  readWorkspaceConfiguration,
  Tree,
  updateWorkspaceConfiguration,
} from '@nrwl/devkit';
import * as path from 'path';
import { InitGeneratorSchema } from './schema';
import { setDefaultCollection } from '@nrwl/workspace';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

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
  workspace.generators['@dommaes/nx-gradle:application'] = {
    dsl: options.dsl,
    ...(workspace.generators['@dommaes/nx-gradle:application'] ?? {}),
  };
  workspace.generators['@dommaes/nx-gradle:library'] = {
    dsl: options.dsl,
    ...(workspace.generators['@dommaes/nx-gradle:library'] ?? {}),
  };

  workspace.plugins = workspace.plugins ?? [];
  if (!workspace.plugins.includes('@dommaes/nx-gradle')) {
    workspace.plugins.push('@dommaes/nx-gradle');
  }

  updateWorkspaceConfiguration(tree, workspace);
  setDefaultCollection('@dommaes/nx-gradle');
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
    userAgent: '@dommaes/nx-gradle',
    log: {
      debug: logger.debug,
      info: logger.info,
      warn: logger.warn,
      error: logger.error,
    },
  });

  return octokit.rest.repos.getLatestRelease({ owner: 'gradle', repo: 'gradle' }).then(({ data }) => data.tag_name);
};

const downloadGradleWrapper = async (options: NormalizedSchema) => {
  const tag = await getTag(options);

  const baseUrl = `https://raw.githubusercontent.com/gradle/gradle/${tag}`;
  const headers = { 'User-Agent': '@dommaes/nx-gradle' };

  const gradlew = Buffer.from(await fetch(`${baseUrl}/gradlew`, { headers }).then((res) => res.arrayBuffer()));
  const gradlewBat = Buffer.from(await fetch(`${baseUrl}/gradlew.bat`, { headers }).then((res) => res.arrayBuffer()));
  const gradleWrapperJar = Buffer.from(
    await fetch(`${baseUrl}/gradle/wrapper/gradle-wrapper.jar`, { headers }).then((res) => res.arrayBuffer()),
  );
  const gradleWrapperProperties = Buffer.from(
    await fetch(`${baseUrl}/gradle/wrapper/gradle-wrapper.properties`, { headers }).then((res) => res.arrayBuffer()),
  );

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
  } else {
    logger.info('Downloading Gradle wrapper from GitHub.');

    const { gradlew, gradlewBat, gradleWrapperJar, gradleWrapperProperties } = await downloadGradleWrapper(options);

    tree.write('gradlew', gradlew, { mode: '775' });
    tree.write('gradlew.bat', gradlewBat, { mode: '664' });
    tree.write('gradle/wrapper/gradle-wrapper.jar', gradleWrapperJar, { mode: '664' });
    tree.write('gradle/wrapper/gradle-wrapper.properties', gradleWrapperProperties, { mode: '664' });
  }
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

  let content = tree.read('.gitignore', 'utf-8');

  ['.gradle', '!gradle-wrapper.jar'].forEach((entry) => {
    if (new RegExp(`/^${entry}$/`, 'gm').test(content)) {
      content = `${content}\n${entry}\n`;
    }
  });

  tree.write('.gitignore', content);
};

export const gradleInitGenerator = async (tree: Tree, options: InitGeneratorSchema) => {
  const normalizedOptions = normalizeOptions(tree, options);

  updateWorkspaceConfig(tree, normalizedOptions);
  updateGitIgnore(tree);

  await addFiles(tree, normalizedOptions);

  await formatFiles(tree);
};

export default gradleInitGenerator;
