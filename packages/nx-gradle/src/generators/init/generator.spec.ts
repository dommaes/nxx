import { exec, ExecException } from 'child_process';
import { Readable } from 'stream';

import {
  Tree,
  readWorkspaceConfiguration,
  WorkspaceConfiguration,
  updateWorkspaceConfiguration,
  logger,
} from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { setDefaultCollection } from '@nrwl/workspace/src/utilities/set-default-collection';
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import fetch from 'node-fetch';

import generator, { NormalizedSchema, normalizeOptions, updateGitIgnore, updateWorkspaceConfig } from './generator';
import { Dsl } from './lib/types';

const { Response } = jest.requireActual('node-fetch');

jest.mock('child_process');

jest.mock('@nrwl/devkit');
jest.mock('@nrwl/workspace/src/utilities/set-default-collection');
jest.mock('@octokit/rest');
jest.mock('node-fetch');

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockOctokitClass = Octokit as jest.MockedClass<typeof Octokit>;
const mockGetLatestRelease = jest.fn<
  RestEndpointMethodTypes['repos']['getLatestRelease']['response'],
  [Promise<RestEndpointMethodTypes['repos']['getLatestRelease']['parameters']>]
>();
const mockGetReleaseByTag = jest.fn<
  RestEndpointMethodTypes['repos']['getReleaseByTag']['response'],
  [Promise<RestEndpointMethodTypes['repos']['getReleaseByTag']['parameters']>]
>();
const mockOctokit = {
  rest: {
    repos: {
      // @ts-ignore: typing
      getLatestRelease: mockGetLatestRelease,
      // @ts-ignore: typing
      getReleaseByTag: mockGetReleaseByTag,
    },
  },
};

describe('init generator', () => {
  let tree: Tree;

  beforeEach(() => {
    // @ts-ignore: typing
    mockOctokitClass.mockImplementation(() => mockOctokit);
    mockGetLatestRelease.mockResolvedValue({
      data: {
        // @ts-ignore: typing
        tag_name: 'v7.3.3',
      },
    });
    // @ts-ignore: typing
    mockGetReleaseByTag.mockResolvedValue({});
    mockFetch.mockImplementation(() => Promise.resolve(new Response(Readable.from([]))));

    tree = createTreeWithEmptyWorkspace();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeOptions', () => {
    it('should return correct normalized options', () => {
      const normalizedOptions = normalizeOptions(tree, { dsl: 'kotlin', useInstalledGradle: false });

      expect(normalizedOptions).toMatchObject({
        rootProjectName: 'virtual',
        useInstalledGradle: false,
      });
    });

    it('should return correct normalized options for given rootProjectName', () => {
      const normalizedOptions = normalizeOptions(tree, {
        dsl: 'kotlin',
        useInstalledGradle: false,
        rootProjectName: 'rootProject',
      });

      expect(normalizedOptions).toMatchObject({
        rootProjectName: 'rootProject',
      });
    });

    it('should return correct normalized options for Kotlin DSL', () => {
      const normalizedOptions = normalizeOptions(tree, { dsl: 'kotlin', useInstalledGradle: false });

      expect(normalizedOptions).toMatchObject({
        dsl: 'kotlin',
        gradleFileExtension: '.kts',
      });
    });

    it('should return correct normalized options for Groovy DSL', () => {
      const normalizedOptions = normalizeOptions(tree, { dsl: 'groovy', useInstalledGradle: false });

      expect(normalizedOptions).toMatchObject({
        dsl: 'groovy',
        gradleFileExtension: '',
      });
    });
  });

  describe('updateWorkspaceConfig', () => {
    const mockReadWorkspaceConfiguration = readWorkspaceConfiguration as jest.MockedFunction<
      typeof readWorkspaceConfiguration
    >;
    const mockUpdateWorkspaceConfiguration = updateWorkspaceConfiguration as jest.MockedFunction<
      typeof updateWorkspaceConfiguration
    >;
    const mockSetDefaultCollection = setDefaultCollection as jest.MockedFunction<typeof setDefaultCollection>;

    it('should set app and lib generators, add plugin and set default collection', () => {
      mockReadWorkspaceConfiguration.mockReturnValueOnce({} as WorkspaceConfiguration);

      updateWorkspaceConfig(tree, { dsl: 'kotlin' } as NormalizedSchema);

      expect(mockUpdateWorkspaceConfiguration).toHaveBeenCalledWith(tree, {
        generators: {
          '@nxx/nx-gradle:application': {
            dsl: 'kotlin',
          },
          '@nxx/nx-gradle:library': {
            dsl: 'kotlin',
          },
        },
        plugins: ['@nxx/nx-gradle'],
      });
      expect(mockSetDefaultCollection).toHaveBeenCalledWith(tree, '@nxx/nx-gradle');
    });

    it('should merge generator and plugin configs', () => {
      mockReadWorkspaceConfiguration.mockReturnValueOnce({
        generators: {
          '@nxx/nx-gradle:application': {
            test: 'test',
          },
          '@nxx/nx-gradle:library': {
            test: 'test',
          },
        },
        plugins: ['test'],
      } as unknown as WorkspaceConfiguration);

      updateWorkspaceConfig(tree, { dsl: 'kotlin' } as NormalizedSchema);

      expect(mockUpdateWorkspaceConfiguration).toHaveBeenCalledWith(tree, {
        generators: {
          '@nxx/nx-gradle:application': {
            test: 'test',
            dsl: 'kotlin',
          },
          '@nxx/nx-gradle:library': {
            test: 'test',
            dsl: 'kotlin',
          },
        },
        plugins: ['test', '@nxx/nx-gradle'],
      });
      expect(mockSetDefaultCollection).toHaveBeenCalledWith(tree, '@nxx/nx-gradle');
    });
  });

  describe('updateGitIgnore', () => {
    beforeEach(() => {
      jest.spyOn(logger, 'warn');
    });

    it("should log warning if .gitignore doesn't exist", () => {
      jest.spyOn(tree, 'exists').mockReturnValueOnce(false);
      jest.spyOn(tree, 'read');
      jest.spyOn(tree, 'write');

      updateGitIgnore(tree);

      expect(logger.warn).toHaveBeenCalledWith("Couldn't find .gitignore file to update");
      expect(tree.read).not.toHaveBeenCalled();
      expect(tree.write).not.toHaveBeenCalled();
    });

    it('should add entries to .gitignore', () => {
      jest.spyOn(tree, 'exists').mockReturnValueOnce(true);
      jest.spyOn(tree, 'read').mockReturnValueOnce('');
      jest.spyOn(tree, 'write');

      updateGitIgnore(tree);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(tree.read).toHaveBeenCalledWith('.gitignore', 'utf-8');
      expect(tree.write).toHaveBeenCalledWith('.gitignore', '\n.gradle\n!gradle-wrapper.jar\n');
    });

    it('should bot add entries to .gitignore', () => {
      jest.spyOn(tree, 'exists').mockReturnValueOnce(true);
      jest.spyOn(tree, 'read').mockReturnValueOnce('.gradle\n!gradle-wrapper.jar');
      jest.spyOn(tree, 'write');

      updateGitIgnore(tree);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(tree.read).toHaveBeenCalledWith('.gitignore', 'utf-8');
      expect(tree.write).toHaveBeenCalledWith('.gitignore', '.gradle\n!gradle-wrapper.jar');
    });
  });

  // describe('generator defaults', () => {
  //   it('should set generator defaults to Kotlin DSL in workspace config', async () => {
  //     await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //     const workspace = readWorkspaceConfiguration(tree);
  //
  //     expect(workspace.generators).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:application']).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:application']).toEqual({ dsl: 'kotlin' });
  //     expect(workspace.generators['@nxx/nx-gradle:library']).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:library']).toEqual({ dsl: 'kotlin' });
  //   });
  //
  //   it('should set generator defaults to Groovy DSL in workspace config', async () => {
  //     await generator(tree, { dsl: 'groovy', useInstalledGradle: false });
  //
  //     const workspace = readWorkspaceConfiguration(tree);
  //
  //     expect(workspace.generators).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:application']).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:application']).toEqual({ dsl: 'groovy' });
  //     expect(workspace.generators['@nxx/nx-gradle:library']).toBeDefined();
  //     expect(workspace.generators['@nxx/nx-gradle:library']).toEqual({ dsl: 'groovy' });
  //   });
  // });
  //
  // it('should add plugin to workspace config', async () => {
  //   await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //   const workspace = readWorkspaceConfiguration(tree);
  //
  //   expect(workspace.plugins).toBeDefined();
  //   expect(workspace.plugins).toContainEqual('@nxx/nx-gradle');
  // });
  //
  // it('should set default collection in workspace config', async () => {
  //   await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //   const workspace = readWorkspaceConfiguration(tree);
  //
  //   expect(workspace.cli).toBeDefined();
  //   expect(workspace.cli.defaultCollection).toEqual('@nxx/nx-gradle');
  // });
  //
  // describe('.gitignore', () => {
  //   it('should add ".gradle" and "!gradle-wrapper.jar" to .gitignore', async () => {
  //     tree.write('.gitignore', '');
  //
  //     await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //     const gitignore = tree.read('.gitignore', 'utf-8');
  //
  //     expect(gitignore).toContain('.gradle');
  //     expect(gitignore).toContain('!gradle-wrapper.jar');
  //   });
  //
  //   it('should not add ".gradle" and "!gradle-wrapper.jar" to .gitignore if they are already defined', async () => {
  //     tree.write('.gitignore', '.gradle\n!gradle-wrapper.jar');
  //
  //     await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //     const gitignore = tree.read('.gitignore', 'utf-8');
  //
  //     expect(gitignore.match(/^\.gradle$/gm)).toHaveLength(1);
  //     expect(gitignore.match(/^!gradle-wrapper.jar$/gm)).toHaveLength(1);
  //   });
  // });
  //
  // describe('.editorconfig', () => {
  //   describe.each([
  //     { dsl: 'kotlin' as Dsl, dslSectionMarker: '[*.gradle.kts]' },
  //     { dsl: 'groovy' as Dsl, dslSectionMarker: '[*.gradle]' },
  //   ])('$dsl DSL', ({ dsl, dslSectionMarker }) => {
  //     it('should add "indent_size = 4" to .editorconfig', async () => {
  //       tree.write('.editorconfig', '');
  //
  //       await generator(tree, { dsl, useInstalledGradle: false });
  //
  //       const editorconfig = tree.read('.editorconfig', 'utf-8');
  //
  //       expect(editorconfig).toContain(`${dslSectionMarker}\nindent_size = 4`);
  //     });
  //
  //     it('should not add "indent_size = 4" to .editorconfig if DSL section is already defined', async () => {
  //       tree.write('.editorconfig', dslSectionMarker);
  //
  //       await generator(tree, { dsl, useInstalledGradle: false });
  //
  //       const editorconfig = tree.read('.editorconfig', 'utf-8');
  //
  //       expect(editorconfig).not.toContain(`${dslSectionMarker}\nindent_size = 4`);
  //     });
  //   });
  // });
  //
  // describe('files', () => {
  //   describe('Gradle settings file', () => {
  //     it.each([
  //       { dsl: 'kotlin' as Dsl, extension: '.kts' },
  //       { dsl: 'groovy' as Dsl, extension: '' },
  //     ])('should add Gradle settings file with $dsl DSL', async ({ dsl, extension }) => {
  //       await generator(tree, { dsl, useInstalledGradle: false });
  //
  //       const hasSettings = tree.exists(`settings.gradle${extension}`);
  //
  //       expect(hasSettings).toBe(true);
  //     });
  //   });
  //
  //   describe('Gradle wrapper files', () => {
  //     describe('download Gradle wrapper files', () => {
  //       beforeEach(() => {
  //         jest.spyOn(mockOctokit.rest.repos, 'getLatestRelease');
  //         jest.spyOn(mockOctokit.rest.repos, 'getReleaseByTag');
  //       });
  //
  //       it('should download and add Gradle wrapper files', async () => {
  //         await generator(tree, { dsl: 'kotlin', useInstalledGradle: false });
  //
  //         expect(mockOctokit.rest.repos.getLatestRelease).toHaveBeenCalledWith({ owner: 'gradle', repo: 'gradle' });
  //         expect(mockOctokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled();
  //
  //         const hasGradlew = tree.exists('gradlew');
  //         const hasGradlewBat = tree.exists('gradlew.bat');
  //         const hasGradleWrapperJar = tree.exists('gradle/wrapper/gradle-wrapper.jar');
  //         const hasGradleWrapperProperties = tree.exists('gradle/wrapper/gradle-wrapper.properties');
  //
  //         expect(hasGradlew).toBe(true);
  //         expect(hasGradlewBat).toBe(true);
  //         expect(hasGradleWrapperJar).toBe(true);
  //         expect(hasGradleWrapperProperties).toBe(true);
  //       });
  //
  //       it('should download and add Gradle wrapper files with specified version', async () => {
  //         await generator(tree, { dsl: 'kotlin', useInstalledGradle: false, gradleVersion: '7.3.3' });
  //
  //         expect(mockOctokit.rest.repos.getLatestRelease).not.toHaveBeenCalled();
  //         expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
  //           owner: 'gradle',
  //           repo: 'gradle',
  //           tag: 'v7.3.3',
  //         });
  //
  //         const hasGradlew = tree.exists('gradlew');
  //         const hasGradlewBat = tree.exists('gradlew.bat');
  //         const hasGradleWrapperJar = tree.exists('gradle/wrapper/gradle-wrapper.jar');
  //         const hasGradleWrapperProperties = tree.exists('gradle/wrapper/gradle-wrapper.properties');
  //
  //         expect(hasGradlew).toBe(true);
  //         expect(hasGradlewBat).toBe(true);
  //         expect(hasGradleWrapperJar).toBe(true);
  //         expect(hasGradleWrapperProperties).toBe(true);
  //       });
  //     });
  //
  //     describe('execute "gradle wrapper"', () => {
  //       beforeEach(() => {
  //         mockExec.mockImplementationOnce(
  //           // @ts-ignore: typing
  //           (cmd: string, callback: (error: ExecException | null, stdout: string, stderr: string) => void) =>
  //             callback(null, '', ''),
  //         );
  //       });
  //
  //       it('should execute "gradle wrapper"', async () => {
  //         await generator(tree, { dsl: 'kotlin', useInstalledGradle: true });
  //
  //         expect(exec).toHaveBeenCalledWith('gradle wrapper', expect.any(Function));
  //       });
  //
  //       it('should execute "gradle wrapper" with specified version', async () => {
  //         await generator(tree, { dsl: 'kotlin', useInstalledGradle: true, gradleVersion: '7.3.3' });
  //
  //         expect(exec).toHaveBeenCalledWith('gradle wrapper --gradle-version 7.3.3', expect.any(Function));
  //       });
  //     });
  //   });
  // });
});
