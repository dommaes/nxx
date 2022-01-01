import { Dsl } from './lib/types';

export interface InitGeneratorSchema {
  dsl: Dsl;
  rootProjectName?: string;
  useInstalledGradle: boolean;
  gradleVersion?: string;
}
