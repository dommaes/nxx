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

interface NormalizedSchema extends InitGeneratorSchema {
  gradleFileExtension: string;
  rootProjectName: string;
}

const normalizeOptions = (tree: Tree, options: InitGeneratorSchema): NormalizedSchema => {
  const gradleFileExtension = options.dsl === 'kotlin' ? '.kts' : '';
  const rootProjectName = options.rootProjectName ?? tree.root;

  return {
    ...options,
    gradleFileExtension,
    rootProjectName,
  };
};

const setDefaults = (tree: Tree, options: InitGeneratorSchema) => {
  const workspace = readWorkspaceConfiguration(tree);

  workspace.generators = workspace.generators || {};
  workspace.generators['@dommaes/nx-gradle:application'] = {
    dsl: options.dsl,
    ...(workspace.generators['@dommaes/nx-gradle:application'] || {}),
  };
  workspace.generators['@dommaes/nx-gradle:library'] = {
    dsl: options.dsl,
    ...(workspace.generators['@dommaes/nx-gradle:library'] || {}),
  };

  updateWorkspaceConfiguration(tree, workspace);
  setDefaultCollection('@dommaes/nx-gradle');
};

const addFiles = (tree: Tree, options: NormalizedSchema) => {
  const templateOptions = {
    ...options,
    quote: options.dsl === 'kotlin' ? '"' : "'",
    offsetFromRoot: offsetFromRoot(tree.root),
    template: '',
  };

  generateFiles(tree, path.join(__dirname, 'files'), '', templateOptions);
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

  setDefaults(tree, normalizedOptions);
  addFiles(tree, normalizedOptions);

  updateGitIgnore(tree);

  await formatFiles(tree);
};

export default gradleInitGenerator;
