import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
  readFile,
  updateFile,
} from '@nrwl/nx-plugin/testing';

jest.setTimeout(120_000);

describe('nx-gradle e2e', () => {
  let originalNxJson: string;

  beforeEach(() => {
    originalNxJson = readFile('nx.json');
  });

  afterEach(() => {
    updateFile('nx.json', originalNxJson);
  });

  it.only('should', async () => {
    ensureNxProject('@nxx/nx-gradle', 'dist/packages/nx-gradle');

    const name = 'proj';
    console.log(name);
    await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name}`);
    console.log(`settings ${name}:\n${readFile('settings.gradle.kts')}`);
    console.log(`build ${name}:\n${readFile(`apps/${name}/build.gradle.kts`)}`);

    // const name = 'proj';
    // console.log(name);
    // await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name} --dsl=groovy`);
    // console.log(`settings ${name}:\n${readFile('settings.gradle')}`);
    // console.log(`build ${name}:\n${readFile(`apps/${name}/build.gradle`)}`);

    // const name1 = uniq('proj');
    // console.log(name1);
    // await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name1}`);
    // console.log(`settings ${name1}:\n${readFile('settings.gradle.kts')}`);
    // console.log(`build ${name1}:\n${readFile(`apps/${name1}/build.gradle.kts`)}`);
    //
    // const name2 = uniq('proj');
    // console.log(name2);
    // await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name2}`);
    // console.log(`settings ${name2}:\n${readFile('settings.gradle.kts')}`);
    // console.log(`build ${name2}:\n${readFile(`apps/${name2}/build.gradle.kts`)}`);
    //
    // const name3 = uniq('proj');
    // console.log(name3);
    // await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name3} --dsl=groovy`);
    // console.log(`settings ${name3}:\n${readFile('settings.gradle')}`);
    // console.log(`build ${name3}:\n${readFile(`apps/${name3}/build.gradle`)}`);
    //
    // const name4 = uniq('proj');
    // console.log(name4);
    // await runNxCommandAsync(`generate @nxx/nx-gradle:application ${name4} --dsl=groovy`);
    // console.log(`settings ${name4}:\n${readFile('settings.gradle')}`);
    // console.log(`build ${name4}:\n${readFile(`apps/${name4}/build.gradle`)}`);
  });

  it('should create nx-gradle', async () => {
    const plugin = uniq('nx-gradle');
    ensureNxProject('@nxx/nx-gradle', 'dist/packages/nx-gradle');
    await runNxCommandAsync(`generate @nxx/nx-gradle:nx-gradle ${plugin}`);

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Executor ran');
  });

  describe('--directory', () => {
    it('should create src in the specified directory', async () => {
      const plugin = uniq('nx-gradle');
      ensureNxProject('@nxx/nx-gradle', 'dist/packages/nx-gradle');
      await runNxCommandAsync(`generate @nxx/nx-gradle:nx-gradle ${plugin} --directory subdir`);
      expect(() => checkFilesExist(`libs/subdir/${plugin}/src/index.ts`)).not.toThrow();
    });
  });

  describe('--tags', () => {
    it('should add tags to the project', async () => {
      const plugin = uniq('nx-gradle');
      ensureNxProject('@nxx/nx-gradle', 'dist/packages/nx-gradle');
      await runNxCommandAsync(`generate @nxx/nx-gradle:nx-gradle ${plugin} --tags e2etag,e2ePackage`);
      const project = readJson(`libs/${plugin}/project.json`);
      expect(project.tags).toEqual(['e2etag', 'e2ePackage']);
    });
  });
});
