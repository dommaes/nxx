import { Tree, readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';

import generator from './generator';

describe('application generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await generator(tree, { name: 'testProject' });
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });

  it('should ', async () => {
    await generator(tree, { name: 'testProject' });
    console.log(tree.read('settings.gradle.kts', 'utf-8'));
  });
});
