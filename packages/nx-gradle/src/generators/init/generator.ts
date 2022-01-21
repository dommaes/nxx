import { exec } from 'child_process';
import { join } from 'path';
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

import { gradleFileOptions } from '../lib/gradle-file-options';
import { Dsl } from '../lib/types';

import { InitGeneratorSchema } from './schema';

export interface NormalizedSchema extends InitGeneratorSchema {
  gradleFileExt: string;
  quote: string;
  rootProjectName: string;
}

export default async function gradleInitGenerator(tree: Tree, options: InitGeneratorSchema): Promise<void> {
  const normalizedOptions = normalizeOptions(tree, options);

  updateWorkspaceConfig(tree, normalizedOptions);
  updateGitIgnore(tree);
  updateEditorConfig(tree, normalizedOptions);

  await addFiles(tree, normalizedOptions);

  if (!normalizedOptions.skipFormat) {
    await formatFiles(tree);
  }
}

function normalizeOptions(tree: Tree, options: InitGeneratorSchema): NormalizedSchema {
  const dsl = options.dsl as Dsl;
  const gradleFileOpts = gradleFileOptions(dsl);
  const rootProjectName = options.rootProjectName ?? tree.root.substring(tree.root.lastIndexOf('/') + 1);

  return {
    ...options,
    ...gradleFileOpts,
    dsl,
    rootProjectName,
  };
}

function updateWorkspaceConfig(tree: Tree, options: NormalizedSchema): void {
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
}

function updateGitIgnore(tree: Tree): void {
  if (!tree.exists('.gitignore')) {
    logger.warn(`Couldn't find .gitignore file to update`);
    return;
  }

  let gitignore = tree.read('.gitignore', 'utf-8');

  ['.gradle', '!gradle-wrapper.jar'].forEach((entry, i, arr) => {
    const regex = new RegExp(`^${entry}$`, 'gm');
    if (!regex.test(gitignore)) {
      gitignore += `\n${entry}`;

      if (i === arr.length - 1) {
        gitignore += '\n';
      }
    }
  });

  tree.write('.gitignore', gitignore);
}

function updateEditorConfig(tree: Tree, options: NormalizedSchema): void {
  if (!tree.exists('.editorconfig')) {
    logger.warn(`Couldn't find .editorconfig file to update`);
    return;
  }

  let editorconfig = tree.read('.editorconfig', 'utf-8');

  const gradleDslSectionMarker = options.dsl === Dsl.KOTLIN ? '[*.gradle.kts]' : '[*.gradle]';
  const hasGradleDslSection = editorconfig.includes(gradleDslSectionMarker);

  if (!hasGradleDslSection) {
    editorconfig += `\n${gradleDslSectionMarker}\nindent_size = 4\n`;
  }

  tree.write('.editorconfig', editorconfig);
}

async function addFiles(tree: Tree, options: NormalizedSchema): Promise<void> {
  const templateOptions = {
    ...options,
    offsetFromRoot: offsetFromRoot(tree.root),
    template: '',
  };

  const settingsFile = `settings.gradle${options.gradleFileExt}`;
  if (!tree.exists(settingsFile)) {
    generateFiles(tree, join(__dirname, 'files'), '', templateOptions);
  }

  if (!['gradlew', 'gradlew.bat'].every((file) => tree.exists(file))) {
    await createGradleWrapper(tree, options);
  }
}

async function createGradleWrapper(tree: Tree, options: NormalizedSchema): Promise<void> {
  if (options.useInstalledGradle) {
    await execGradleWrapper(options);
    return;
  }

  const { gradlew, gradlewBat, gradleWrapperJar, gradleWrapperProperties } = await downloadGradleWrapper(options);

  tree.write('gradlew', gradlew, { mode: '775' });
  tree.write('gradlew.bat', gradlewBat);
  tree.write('gradle/wrapper/gradle-wrapper.jar', gradleWrapperJar);
  tree.write('gradle/wrapper/gradle-wrapper.properties', gradleWrapperProperties);
}

async function execGradleWrapper(options: NormalizedSchema): Promise<void> {
  logger.info('Creating Gradle wrapper with installed Gradle');

  let gradleWrapperCommand = 'gradle wrapper';
  if (options.gradleVersion) {
    gradleWrapperCommand += ` --gradle-version ${options.gradleVersion}`;
  }

  const { stdout, stderr } = await promisify(exec)(gradleWrapperCommand);
  logger.debug(stdout);
  logger.error(stderr);
}

async function downloadGradleWrapper(
  options: NormalizedSchema,
): Promise<{ gradlew: Buffer; gradlewBat: Buffer; gradleWrapperJar: Buffer; gradleWrapperProperties: Buffer }> {
  try {
    logger.info('Trying to download Gradle wrapper');

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
  } catch (err: unknown) {
    logger.error(
      `Couldn't download Gradle wrapper files${options.gradleVersion ? ` for ${options.gradleVersion}` : ''}`,
    );
  }
}

async function getTag(options: NormalizedSchema): Promise<string> {
  const octokit = new Octokit({
    userAgent: '@nxx/nx-gradle',
    log: {
      debug: logger.debug,
      info: logger.debug,
      warn: logger.warn,
      error: logger.error,
    },
  });

  if (options.gradleVersion) {
    const tag = `v${options.gradleVersion}`;
    return octokit.rest.repos.getReleaseByTag({ owner: 'gradle', repo: 'gradle', tag }).then(() => tag);
  }

  return octokit.rest.repos.getLatestRelease({ owner: 'gradle', repo: 'gradle' }).then(({ data }) => data.tag_name);
}

function downloadFile(url: string): Promise<Buffer> {
  return fetch(url, { headers: { 'User-Agent': '@nxx/nx-gradle' } })
    .then((res) => res.arrayBuffer())
    .then((buffer) => Buffer.from(buffer));
}
