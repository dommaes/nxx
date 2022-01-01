import { exec } from 'child_process';
import { Readable } from 'stream';

import { Tree, readWorkspaceConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import fetch from 'node-fetch';

import gradleInitGenerator from './generator';
import { Dsl } from './lib/types';

const { Response } = jest.requireActual('node-fetch');

jest.mock('child_process');

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

describe('gradleInitGenerator', () => {
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

  describe('generator defaults', () => {
    it.each([{ dsl: 'kotlin' as Dsl }, { dsl: 'groovy' as Dsl }])(
      'should set generator defaults to $dsl DSL in workspace config',
      async ({ dsl }) => {
        await gradleInitGenerator(tree, { dsl, useInstalledGradle: false });

        const workspace = readWorkspaceConfiguration(tree);

        expect(workspace.generators).toBeDefined();
        expect(workspace.generators['@nxx/nx-gradle:application']).toBeDefined();
        expect(workspace.generators['@nxx/nx-gradle:application']).toEqual({ dsl });
        expect(workspace.generators['@nxx/nx-gradle:library']).toBeDefined();
        expect(workspace.generators['@nxx/nx-gradle:library']).toEqual({ dsl });
      },
    );
  });

  it('should add plugin to workspace config', async () => {
    await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false });

    const workspace = readWorkspaceConfiguration(tree);

    expect(workspace.plugins).toBeDefined();
    expect(workspace.plugins).toContainEqual('@nxx/nx-gradle');
  });

  it('should set default collection in workspace config', async () => {
    await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false });

    const workspace = readWorkspaceConfiguration(tree);

    expect(workspace.cli).toBeDefined();
    expect(workspace.cli.defaultCollection).toEqual('@nxx/nx-gradle');
  });

  describe('.gitignore', () => {
    it('should add ".gradle" and "!gradle-wrapper.jar" to .gitignore', async () => {
      tree.write('.gitignore', '');

      await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false });

      const gitignore = tree.read('.gitignore', 'utf-8');

      expect(gitignore).toContain('.gradle');
      expect(gitignore).toContain('!gradle-wrapper.jar');
    });

    it('should not add ".gradle" and "!gradle-wrapper.jar" to .gitignore if they are already defined', async () => {
      tree.write('.gitignore', '.gradle\n!gradle-wrapper.jar');

      await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false });

      const gitignore = tree.read('.gitignore', 'utf-8');

      expect(gitignore.match(/^\.gradle$/gm)).toHaveLength(1);
      expect(gitignore.match(/^!gradle-wrapper.jar$/gm)).toHaveLength(1);
    });
  });

  describe('.editorconfig', () => {
    describe.each([
      { dsl: 'kotlin' as Dsl, dslSectionMarker: '[*.gradle.kts]' },
      { dsl: 'groovy' as Dsl, dslSectionMarker: '[*.gradle]' },
    ])('$dsl DSL', ({ dsl, dslSectionMarker }) => {
      it('should add "indent_size = 4" to .editorconfig', async () => {
        tree.write('.editorconfig', '');

        await gradleInitGenerator(tree, { dsl, useInstalledGradle: false });

        const editorconfig = tree.read('.editorconfig', 'utf-8');

        expect(editorconfig).toContain(`${dslSectionMarker}\nindent_size = 4`);
      });

      it('should not add "indent_size = 4" to .editorconfig if DSL section is already defined', async () => {
        tree.write('.editorconfig', dslSectionMarker);

        await gradleInitGenerator(tree, { dsl, useInstalledGradle: false });

        const editorconfig = tree.read('.editorconfig', 'utf-8');

        expect(editorconfig).not.toContain(`${dslSectionMarker}\nindent_size = 4`);
      });
    });
  });

  describe('files', () => {
    describe('Gradle settings file', () => {
      it.each([
        { dsl: 'kotlin' as Dsl, extension: '.kts' },
        { dsl: 'groovy' as Dsl, extension: '' },
      ])('should add Gradle settings file with $dsl DSL', async ({ dsl, extension }) => {
        await gradleInitGenerator(tree, { dsl, useInstalledGradle: false });

        const hasSettings = tree.exists(`settings.gradle${extension}`);
        const hasProperties = tree.exists('gradle.properties');

        expect(hasSettings).toBe(true);
        expect(hasProperties).toBe(true);
      });

      it('should add Gradle settings file with custom rootProjectName', async () => {
        await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false, rootProjectName: 'test' });

        const hasSettings = tree.exists(`settings.gradle.kts`);
        const hasProperties = tree.exists('gradle.properties');

        expect(hasSettings).toBe(true);
        expect(hasProperties).toBe(true);

        const settings = tree.read('settings.gradle.kts', 'utf-8');

        expect(settings).toContain('test');
      });
    });

    describe('Gradle wrapper files', () => {
      describe('download Gradle wrapper files', () => {
        beforeEach(() => {
          jest.spyOn(mockOctokit.rest.repos, 'getLatestRelease');
          jest.spyOn(mockOctokit.rest.repos, 'getReleaseByTag');
        });

        it('should download and add Gradle wrapper files', async () => {
          await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false });

          expect(mockOctokit.rest.repos.getLatestRelease).toHaveBeenCalledWith({ owner: 'gradle', repo: 'gradle' });
          expect(mockOctokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled();

          const hasGradlew = tree.exists('gradlew');
          const hasGradlewBat = tree.exists('gradlew.bat');
          const hasGradleWrapperJar = tree.exists('gradle/wrapper/gradle-wrapper.jar');
          const hasGradleWrapperProperties = tree.exists('gradle/wrapper/gradle-wrapper.properties');

          expect(hasGradlew).toBe(true);
          expect(hasGradlewBat).toBe(true);
          expect(hasGradleWrapperJar).toBe(true);
          expect(hasGradleWrapperProperties).toBe(true);
        });

        it('should download and add Gradle wrapper files with specified version', async () => {
          await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: false, gradleVersion: '7.3.3' });

          expect(mockOctokit.rest.repos.getLatestRelease).not.toHaveBeenCalled();
          expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
            owner: 'gradle',
            repo: 'gradle',
            tag: 'v7.3.3',
          });

          const hasGradlew = tree.exists('gradlew');
          const hasGradlewBat = tree.exists('gradlew.bat');
          const hasGradleWrapperJar = tree.exists('gradle/wrapper/gradle-wrapper.jar');
          const hasGradleWrapperProperties = tree.exists('gradle/wrapper/gradle-wrapper.properties');

          expect(hasGradlew).toBe(true);
          expect(hasGradlewBat).toBe(true);
          expect(hasGradleWrapperJar).toBe(true);
          expect(hasGradleWrapperProperties).toBe(true);
        });
      });

      describe('execute "gradle wrapper"', () => {
        beforeEach(() => {
          mockExec.mockImplementationOnce(
            // @ts-ignore: typing
            (cmd: string, callback: (error: ExecException | null, stdout: string, stderr: string) => void) =>
              callback(null, '', ''),
          );
        });

        it('should execute "gradle wrapper"', async () => {
          await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: true });

          expect(exec).toHaveBeenCalledWith('gradle wrapper', expect.any(Function));
        });

        it('should execute "gradle wrapper" with specified version', async () => {
          await gradleInitGenerator(tree, { dsl: 'kotlin', useInstalledGradle: true, gradleVersion: '7.3.3' });

          expect(exec).toHaveBeenCalledWith('gradle wrapper --gradle-version 7.3.3', expect.any(Function));
        });
      });
    });
  });
});
