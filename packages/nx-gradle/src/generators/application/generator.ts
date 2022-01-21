import { join } from 'path';

import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  logger,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';

import gradleInitGenerator from '../init/generator';
import { gradleFileOptions } from '../lib/gradle-file-options';
import { Dsl } from '../lib/types';

import { ApplicationGeneratorSchema } from './schema';

interface NormalizedSchema extends ApplicationGeneratorSchema {
  gradleFileExt: string;
  quote: string;
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

export default async function (tree: Tree, options: ApplicationGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  await gradleInitGenerator(tree, { ...options, skipFormat: true });

  addProjectConfiguration(tree, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'application',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    targets: {
      build: {
        executor: '@nxx/nx-gradle:build',
      },
      test: {
        executor: '@nxx/nx-gradle:test',
      },
    },
    tags: normalizedOptions.parsedTags,
  });

  addFiles(tree, normalizedOptions);

  addToSettings(tree, normalizedOptions);

  if (!normalizedOptions.skipFormat) {
    await formatFiles(tree);
  }
}

function normalizeOptions(tree: Tree, options: ApplicationGeneratorSchema): NormalizedSchema {
  const dsl = options.dsl as Dsl;
  const gradleFileOpts = gradleFileOptions(dsl);
  const name = names(options.name).fileName;
  const projectDirectory = options.directory ? `${names(options.directory).fileName}/${name}` : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags ? options.tags.split(',').map((s) => s.trim()) : [];

  return {
    ...options,
    ...gradleFileOpts,
    dsl,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
  };
  generateFiles(tree, join(__dirname, 'files'), options.projectRoot, templateOptions);

  getWorkspaceLayout(tree);
}

function addToSettings(tree: Tree, options: NormalizedSchema) {
  const settingsFile = `settings.gradle${options.gradleFileExt}`;

  if (!tree.exists(settingsFile)) {
    logger.warn(`Couldn't find ${settingsFile} file to update`);
    return;
  }

  const project = options.projectRoot.replace('/', ':');
  const { dsl, quote } = options;
  const include = `include${dsl === Dsl.KOTLIN ? '(' : ' '}${quote}${project}${quote}${dsl === Dsl.KOTLIN ? ')' : ''}`;

  let settings = tree.read(settingsFile, 'utf-8');

  const includes = settings.match(/include.*/g);
  if (includes?.length > 0) {
    const lastInclude = includes[includes.length - 1];
    settings = settings.replace(lastInclude, `${lastInclude}\n${include}`);
  } else {
    settings = settings.replace(/rootProject\.name.*/g, `$&\n${include}`);
  }

  tree.write(settingsFile, settings);
}
