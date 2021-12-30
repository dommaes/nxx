import { Readable } from 'stream';

import { Tree, readWorkspaceConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import fetch from 'node-fetch';

import generator from './generator';

const { Response } = jest.requireActual('node-fetch');

jest.mock('node-fetch');
jest.mock('@octokit/rest');

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockOctokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockGetLatestRelease = jest.fn<
  RestEndpointMethodTypes['repos']['getLatestRelease']['response'],
  [Promise<RestEndpointMethodTypes['repos']['getLatestRelease']['parameters']>]
>();

describe('init generator', () => {
  let tree: Tree;

  beforeEach(() => {
    mockOctokit.mockImplementation(() => ({
      rest: {
        repos: {
          // @ts-ignore: typing
          getLatestRelease: mockGetLatestRelease,
        },
      },
    }));
    mockGetLatestRelease.mockResolvedValue({
      data: {
        // @ts-ignore: typing
        tag_name: 'v7.3.3',
      },
    });
    mockFetch.mockImplementation(() => Promise.resolve(new Response(Readable.from([]))));

    tree = createTreeWithEmptyWorkspace();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generator defaults', () => {
    it('should set generator defaults to Kotlin DSL in workspace config', async () => {
      await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });

      const workspace = readWorkspaceConfiguration(tree);

      expect(workspace.generators).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:application']).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:application']).toEqual({ dsl: 'kotlin' });
      expect(workspace.generators['@nxx/nx-gradle:library']).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:library']).toEqual({ dsl: 'kotlin' });
    });

    it('should set generator defaults to Groovy DSL in workspace config', async () => {
      await generator(tree, { dsl: 'groovy', useInstalledGradle: false });

      const workspace = readWorkspaceConfiguration(tree);

      expect(workspace.generators).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:application']).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:application']).toEqual({ dsl: 'groovy' });
      expect(workspace.generators['@nxx/nx-gradle:library']).toBeDefined();
      expect(workspace.generators['@nxx/nx-gradle:library']).toEqual({ dsl: 'groovy' });
    });
  });

  it('should add plugin to workspace config', async () => {
    await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });

    const workspace = readWorkspaceConfiguration(tree);

    expect(workspace.plugins).toBeDefined();
    expect(workspace.plugins).toContainEqual('@nxx/nx-gradle');
  });

  it('should set default collection in workspace config', async () => {
    await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });

    const workspace = readWorkspaceConfiguration(tree);

    expect(workspace.cli).toBeDefined();
    expect(workspace.cli.defaultCollection).toEqual('@nxx/nx-gradle');
  });

  describe('.gitignore', () => {
    it('should add .gradle and !gradle-wrapper.jar to .gitignore', async () => {
      tree.write('.gitignore', '');

      await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });

      const gitignore = tree.read('.gitignore', 'utf-8');

      expect(gitignore).toContain('.gradle');
      expect(gitignore).toContain('!gradle-wrapper.jar');
    });

    it('should not add .gradle and !gradle-wrapper.jar to .gitignore if they are already defined', async () => {
      tree.write('.gitignore', '.gradle\n!gradle-wrapper.jar');

      await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });

      const gitignore = tree.read('.gitignore', 'utf-8');

      expect(gitignore.match(/^\.gradle$/gm)).toHaveLength(1);
      expect(gitignore.match(/^!gradle-wrapper.jar$/gm)).toHaveLength(1);
    });
  });

  describe('files', () => {});
});
